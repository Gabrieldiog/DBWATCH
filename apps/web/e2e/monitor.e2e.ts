import { expect, test, type Page } from '@playwright/test';
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
  expect((await admin.post(`/api/users/${me.id}/roles`, { headers: origin, data: { role: 'AUDITOR' } })).ok()).toBe(false);

  await expect
    .poll(async () => (await rows()).some(([at, n]) => at! > before && Number(n) >= 1), { timeout: 20_000 })
    .toBe(true);
});

test('quem não tem monitor:read recebe 404', async ({ page }) => {
  await login(page, 'REQUESTER');
  expect((await page.goto('/monitor'))?.status()).toBe(404);
});
