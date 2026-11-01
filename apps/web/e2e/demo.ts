import { expect, type Page } from '@playwright/test';

type DemoUser = { email: string; role: string; password: string };

export function demoUser(role: string): DemoUser {
  const user = (JSON.parse(process.env.E2E_USERS ?? '[]') as DemoUser[]).find((u) => u.role === role);
  if (!user) throw new Error(`Sem usuário demo com o papel ${role}`);
  return user;
}

export async function login(page: Page, role: string, next = '/painel'): Promise<void> {
  const user = demoUser(role);
  if (!page.url().includes('/entrar')) await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(next);
}
