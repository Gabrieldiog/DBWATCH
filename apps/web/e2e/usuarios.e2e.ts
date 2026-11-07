import { expect, test, type Page } from '@playwright/test';
import { demoUser, login } from './demo';

const row = (page: Page, email: string) => page.getByRole('row').filter({ hasText: email });

// Fluxo do admin: criar, dar papel, a pessoa entra, desativar derruba a sessão dela no banco
test('admin cria usuário, dá papel e desativar encerra a sessão da pessoa', async ({ page, browser }) => {
  const email = `e2e-${Date.now()}@dbwatch.test`;
  await login(page, 'ADMIN', '/usuarios');
  await page.getByLabel('Nome').fill('Pessoa do Teste');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText(`${email} criado`);
  // A senha inicial é gerada pela API e aparece só nesta resposta; recarregar a tela faz ela sumir
  const password = (await page.locator('code.secret').textContent())!;
  expect(password).toMatch(/^[\w-]{16}$/);
  await expect(row(page, email)).toContainText('Ativo');

  await row(page, email).getByRole('button', { name: '+ Solicitante' }).click();
  await expect(row(page, email).getByRole('button', { name: 'Remover Solicitante' })).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  const res = await other.request.post('/api/auth/login', { headers: { origin: 'http://localhost:3000' }, data: { email, password } });
  expect(res.status()).toBe(204);
  expect((await other.request.get('/api/auth/me')).status()).toBe(200);

  await page.reload();
  await expect(page.locator('code.secret')).toHaveCount(0);
  await row(page, email).getByRole('button', { name: 'Desativar' }).click();
  await expect(row(page, email)).toContainText('Desativado');
  expect((await other.request.get('/api/auth/me')).status()).toBe(401);
  // Duas camadas: a API recusa conta desativada e, além disso, as sessões foram revogadas no banco
  const id = ((await (await page.request.get('/api/users')).json()) as { id: string; email: string }[]).find((u) => u.email === email)!.id;
  expect(await (await page.request.get(`/api/users/${id}/sessions`)).json()).toEqual([]);
});

test('o banco barra dar papel a si mesmo e tirar o último ADMIN, e a tela mostra o motivo', async ({ page }) => {
  const ana = demoUser('ADMIN').email;
  await login(page, 'ADMIN', '/usuarios');
  await row(page, ana).getByRole('button', { name: '+ Auditoria' }).click();
  await expect(row(page, ana).getByRole('alert')).toHaveText('Ninguém atribui papel a si mesmo');
  // Pré-condição: banco limpo da demonstração, com a Ana como única ADMIN ativa. Sem isso, remover funcionaria de verdade
  const users = (await (await page.request.get('/api/users')).json()) as { status: string; roles: string[] }[];
  const admins = users.filter((u) => u.status === 'ACTIVE' && u.roles.includes('ADMIN'));
  expect(admins, 'o E2E precisa de um banco com só os usuários demo (no CI ele roda antes dos testes da API)').toHaveLength(1);
  await row(page, ana).getByRole('button', { name: 'Remover Administração' }).click();
  await expect(row(page, ana).getByRole('alert').filter({ hasText: 'pelo menos um ADMIN ativo' })).toBeVisible();
  await page.reload();
  await expect(row(page, ana).getByRole('button', { name: 'Remover Administração' })).toBeVisible();
});

test('quem não administra usuários recebe 404', async ({ page }) => {
  await login(page, 'APPROVER');
  expect((await page.goto('/usuarios'))?.status()).toBe(404);
});
