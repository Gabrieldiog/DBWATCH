import { expect, test } from '@playwright/test';
import { demoUser, login } from './demo';

// Outro "aparelho" com user-agent próprio: a linha dele é achada pelo texto, mesmo com outros testes logados na mesma conta
test('a pessoa vê onde está logada e encerra outro aparelho pela tela', async ({ page, browser }) => {
  const user = demoUser('AUDITOR');
  const ua = `Aparelho-E2E-${Date.now()}`;
  const other = await browser.newContext({ userAgent: ua });
  const res = await other.request.post('/api/auth/login', { headers: { origin: 'http://localhost:3000' }, data: { email: user.email, password: user.password } });
  expect(res.status()).toBe(204);

  await login(page, 'AUDITOR', '/sessoes');
  await expect(page.getByRole('heading', { name: 'Minhas sessões' })).toBeVisible();
  const mine = page.getByRole('row').filter({ hasText: 'Esta sessão' });
  await expect(mine).toHaveCount(1);
  await expect(mine.getByRole('button', { name: 'Encerrar' })).toHaveCount(0);

  const row = page.getByRole('row').filter({ hasText: ua });
  await row.getByRole('button', { name: 'Encerrar' }).click();
  await expect(row).toHaveCount(0);
  // Revogada no banco: o cookie do outro aparelho parou de valer, e o desta tela continua
  expect((await other.request.get('/api/auth/me')).status()).toBe(401);
  expect((await page.request.get('/api/auth/me')).status()).toBe(200);
  await other.close();
});
