import { expect, test, type Browser, type Page } from '@playwright/test';
import { demoUser, login } from './demo';
import { approvedGrant, revokeGrants } from './pam';

async function as(browser: Browser, role: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, role, '/acessos');
  return page;
}

// Fim do T-E2E-02: depois da aprovação, o solicitante vê o acesso com o tempo correndo
test('T-E2E-02 acesso aprovado aparece como ativo com contagem regressiva', async ({ page, browser }) => {
  const bruno = await as(browser, 'APPROVER');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/acessos');
  await approvedGrant(page.request, bruno.request, 'Catálogo de produtos');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Catálogo de produtos' }).first();
  await expect(row).toContainText('Ativo');
  const timer = row.getByRole('timer');
  await expect(timer).toHaveText(/^1[45]:\d{2}$/);
  const first = await timer.textContent();
  await expect(timer).not.toHaveText(first!, { timeout: 3000 });
  await expect(page.getByRole('heading', { name: 'Acessos ativos de todos' })).toHaveCount(0);
});

test('revogar pede motivo e o acesso some na hora para o dono', async ({ page, browser }) => {
  const bruno = await as(browser, 'APPROVER');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/acessos');
  const id = await approvedGrant(page.request, bruno.request, 'Clientes');
  await bruno.reload();
  const row = bruno.getByRole('row').filter({ hasText: demoUser('REQUESTER').email }).filter({ hasText: 'Clientes' });
  await row.getByRole('button', { name: 'Revogar' }).click();
  const dialog = bruno.getByRole('dialog', { name: /Revogar o acesso de/ });
  await dialog.getByLabel(/Motivo/).fill('Fim do turno de suporte');
  await dialog.getByRole('button', { name: 'Revogar' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Clientes' }).first()).toContainText('Revogado');
  const mine = (await (await page.request.get('/api/grants/mine')).json()) as { id: string; state: string }[];
  expect(mine.find((g) => g.id === id)?.state).toBe('REVOKED');
});

test('auditora não tem acessos para ver e recebe 404', async ({ page }) => {
  await login(page, 'AUDITOR');
  expect((await page.goto('/acessos'))?.status()).toBe(404);
});
