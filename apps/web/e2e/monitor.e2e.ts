import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { demoUser, login } from './demo';
import { origin } from './pam';

const stat = (page: Page, label: string) =>
  page.locator('.stats > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

// T-E2E-05 (parte 1): números das views do PostgreSQL, e um evento provocado de verdade chega na tela sem recarregar
test('o rollback provocado na API aparece no gráfico do monitor sozinho', async ({ page, browser }) => {
  await login(page, 'AUDITOR', '/monitor');
  await expect(page.getByRole('main').getByText(/Última amostra às \d\d:\d\d:\d\d/)).toBeVisible({ timeout: 10_000 });
  // A própria API mantém conexões abertas (pool e LISTEN), então nunca há zero sessões ociosas
  expect(Number(await stat(page, 'Ociosas').textContent())).toBeGreaterThan(0);

  const chart = page.getByRole('figure', { name: /Rollbacks/ });
  await chart.getByText('Ver como tabela').click();
  const rows = () => chart.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...(tr as HTMLTableRowElement).cells].map((c) => c.textContent ?? '')));
  const before = (await rows())[0]![0]!;

  // Dar papel a si mesmo: a CHECK do banco recusa e a transação volta (ROLLBACK de verdade no pg_stat_database)
  const { email, password } = demoUser('ADMIN');
  const admin = (await (await browser.newContext()).newPage()).request;
  await admin.post('/api/auth/login', { headers: origin, data: { email, password } });
  const me = (await (await admin.get('/api/auth/me')).json()) as { id: string };
  const denied = await admin.post(`/api/users/${me.id}/roles`, { headers: origin, data: { role: 'AUDITOR' } });
  expect(denied.ok()).toBe(false);
  const { correlationId } = (await denied.json()) as { correlationId: string };

  await expect
    .poll(async () => (await rows()).some(([at, n]) => at! > before && Number(n) >= 1), { timeout: 20_000 })
    .toBe(true);
  // Este mesmo rollback (pelo código da execução, não um de outra rodada) chega pelo SSE, ligado à trilha de auditoria
  // A mesma requisição gera dois eventos: o rollback e a atividade auditada da falha
  const rollback = page.getByRole('listitem').filter({ hasText: 'Rollback na API' }).filter({ has: page.locator(`a[href="/auditoria?correlationId=${correlationId}"]`) });
  await expect(rollback).toBeVisible();
  await expect(rollback).toContainText(
    'Fonte: Aplicação',
  );
});

// Duas sessões psql reais disputam um advisory lock (não toca em dado nenhum); o timeout do papel é zerado só nelas
function psql(app: string, sql: string) {
  if (!process.env.DATABASE_URL) process.loadEnvFile('../../.env');
  return spawn('psql', [process.env.DATABASE_URL!, '-qXc', `SET statement_timeout = 0; ${sql}`], { env: { ...process.env, PGAPPNAME: app } });
}

// T-E2E-05 (parte 2): lock real desenhado no grafo e alerta de espera longa chegando ao vivo
test('lock segurado de verdade aparece no grafo e o alerta de espera longa chega pelo SSE', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, 'AUDITOR', '/monitor');
  const holder = psql('e2e-segura', 'SELECT pg_advisory_lock(4242420); SELECT pg_sleep(14)');
  await page.waitForTimeout(1_000);
  const waiter = psql('e2e-espera', 'SELECT pg_advisory_lock(4242420); SELECT pg_advisory_unlock(4242420)');
  try {
    const row = page.getByRole('figure', { name: /Quem bloqueia quem/ }).getByRole('row').filter({ hasText: 'e2e-espera' });
    await expect(row.getByRole('cell').first()).toContainText('(e2e-segura)', { timeout: 15_000 });
    await expect(row).toContainText('advisory · ExclusiveLock');
    // O alerta desta sessão (pelo pid real dela), não um que sobrou de outra rodada na lista inicial
    const pid = (await row.getByRole('cell').nth(1).textContent())!.match(/pid (\d+)/)![1];
    const alert = page.getByRole('listitem').filter({ hasText: `pid ${pid} (e2e-espera) espera` });
    await expect(alert).toContainText('Espera longa por lock', { timeout: 15_000 });
  } finally {
    holder.kill();
    waiter.kill();
  }
});

test('quem não tem monitor:read recebe 404', async ({ page }) => {
  await login(page, 'REQUESTER');
  expect((await page.goto('/monitor'))?.status()).toBe(404);
});

// A reclamação que originou o PK-20c: "fiz uma consulta e não apareceu nos eventos ao vivo"
test('uma consulta feita em outro navegador aparece ao vivo no monitor, com o link para a auditoria', async ({ page, browser }) => {
  await login(page, 'AUDITOR', '/monitor');
  const diego = await (await browser.newContext()).newPage();
  await login(diego, 'REQUESTER', '/consultas');
  // Nenhum teste dá ao Diego acesso ao Financeiro (sensibilidade alta): a consulta é negada e mesmo assim auditada
  const res = await diego.request.post('/api/queries/faturamento_mensal/execute', { headers: origin, data: {} });
  expect(res.status()).toBe(403);
  const cid = res.headers()['x-request-id']!;
  const event = page.locator('.events li.event-new').filter({ hasText: 'Consulta executada' }).filter({ has: page.locator(`a[href$="${cid}"]`) });
  // O motivo depende do histórico do Diego no banco (nunca teve acesso, ou teve e foi revogado)
  // PK-25: diz quem fez e o recurso; "Detalhar" abre a explicação logo embaixo
  await expect(event).toContainText(/Diego Solicitante tentou consultar Financeiro, mas foi negado: (não tinha acesso|o acesso tinha)/);
  await expect(event).toContainText('Fonte: Aplicação');
  await event.getByText('Detalhar').click();
  await expect(event.getByText(/nasceu na mesma transação do registro/)).toBeVisible();
  await event.getByRole('link', { name: 'ver na auditoria' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'pam.query_execute' })).toContainText(demoUser('REQUESTER').email);
});
