import { expect, test } from '@playwright/test';
import { demoUser, login } from './demo';
import { approvedGrant, origin, revokeGrants } from './pam';

// T-E2E-04: a auditora acha pelo código a execução feita pelo solicitante e confere a cadeia
test('T-E2E-04 auditora filtra pelo código da execução e verifica a integridade', async ({ page, browser }) => {
  const bruno = await (await browser.newContext()).newPage();
  await login(bruno, 'APPROVER');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  const diego = await (await browser.newContext()).newPage();
  await login(diego, 'REQUESTER');
  await approvedGrant(diego.request, bruno.request, 'Catálogo de produtos');
  const run = await diego.request.post('/api/queries/produtos_por_categoria/execute', { headers: origin, data: { params: { categoria: 'Limpeza' } } });
  expect(run.status()).toBe(200);
  const code = run.headers()['x-request-id']!;

  await login(page, 'AUDITOR', '/auditoria');
  await page.getByLabel('Código da execução').fill(code);
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(new RegExp(`correlationId=${code}`));
  const rows = page.getByRole('row').filter({ hasText: 'pam.query_execute' });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(demoUser('REQUESTER').email);
  await expect(rows).toContainText('Sucesso');
  await expect(rows).toContainText('"linhas":50');

  await page.getByRole('button', { name: 'Verificar integridade' }).click();
  await expect(page.getByRole('main').getByRole('status')).toHaveText(/Cadeia íntegra: \d+ registros conferidos/);
});

test('filtra pela pessoa (e-mail) e pelo período de hoje', async ({ page }) => {
  const diego = demoUser('REQUESTER').email;
  await login(page, 'AUDITOR', '/auditoria');
  await page.getByLabel('Pessoa (e-mail)').fill(diego.toUpperCase());
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await page.getByLabel('De', { exact: true }).fill(`${today}T00:00`);
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/actorEmail=/);
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  // Quem: só o Diego em todas as linhas (o banco compara o e-mail sem diferenciar maiúsculas)
  expect(new Set(await page.locator('tbody td[data-label="Quem"]').allTextContents())).toEqual(new Set([diego]));
});

test('filtro inválido vira aviso na tela, sem chamar a API', async ({ page }) => {
  await login(page, 'AUDITOR', '/auditoria');
  await page.goto('/auditoria?correlationId=nao-e-uuid');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(/UUID completo/);
  await expect(page.getByRole('table')).toHaveCount(0);
});

test('a página seguinte continua de onde a anterior parou', async ({ page }) => {
  await login(page, 'AUDITOR', '/auditoria');
  const last = Number(await page.getByRole('row').last().getByRole('cell').first().textContent());
  await page.getByRole('link', { name: 'Registros mais antigos' }).click();
  await expect(page).toHaveURL(/cursor=\d+/);
  // Cursor pela posição na cadeia: registros novos chegando no meio não pulam nem repetem linhas
  await expect(page.getByRole('row').nth(1).getByRole('cell').first()).toHaveText(String(last - 1));
});

test('solicitante não vê a auditoria e recebe 404', async ({ page }) => {
  await login(page, 'REQUESTER');
  expect((await page.goto('/auditoria'))?.status()).toBe(404);
});
