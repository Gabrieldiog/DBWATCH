import { expect, test } from '@playwright/test';
import { demoUser, login } from './demo';

// T-E2E-01: login, logout e sessão encerrada no servidor
test('sem sessão, o console manda para o login e volta para a mesma tela', async ({ page }) => {
  await page.goto('/painel');
  await expect(page).toHaveURL('/entrar?next=%2Fpainel');
  await login(page, 'REQUESTER');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: 'Principal' });
  await expect(menu.getByRole('link', { name: 'Pedir acesso' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Aprovações' })).toHaveCount(0);
});

test('senha errada mostra a mensagem da API e não entra', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(demoUser('AUDITOR').email);
  await page.getByLabel('Senha').fill('senha-errada-de-proposito');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('p.alert')).toHaveText('Credenciais inválidas');
  await expect(page).toHaveURL('/entrar');
});

test('sair revoga a sessão no banco, não só no navegador', async ({ page, context, request }) => {
  await login(page, 'REQUESTER');
  const old = (await context.cookies()).find((c) => c.name === 'dbwatch_session');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL('/entrar?motivo=saiu');
  await expect(page.getByRole('status')).toHaveText(/Você saiu/);
  const replay = await request.get('/api/auth/me', { headers: { cookie: `dbwatch_session=${old?.value}` } });
  expect(replay.status()).toBe(401);
});

test('sessão encerrada em outro lugar volta ao login com aviso', async ({ page, browser }) => {
  await login(page, 'AUDITOR');
  // Outra aba (outro navegador) da mesma pessoa encerra a sessão da primeira pela API
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, 'AUDITOR');
  const sessions = (await (await otherPage.request.get('/api/auth/sessions')).json()) as { id: string; current: boolean }[];
  for (const s of sessions.filter((s) => !s.current)) {
    const res = await otherPage.request.delete(`/api/auth/sessions/${s.id}`, { headers: { origin: 'http://localhost:3000' } });
    expect(res.status()).toBe(204);
  }
  await other.close();

  await page.reload();
  await expect(page).toHaveURL('/entrar?next=%2Fpainel&motivo=expirou');
  await expect(page.getByRole('status')).toHaveText(/Sua sessão terminou/);
  await login(page, 'AUDITOR');
});

test('endereço que não existe responde 404 com página própria', async ({ page }) => {
  const res = await page.goto('/nao-existe');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
