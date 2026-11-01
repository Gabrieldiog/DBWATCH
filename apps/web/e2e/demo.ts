import { expect, type Page } from '@playwright/test';

type DemoUser = { email: string; role: string; password: string };

// nth escolhe entre pessoas do mesmo papel (há dois aprovadores: o recurso HIGH precisa dos dois)
export function demoUser(role: string, nth = 0): DemoUser {
  const user = (JSON.parse(process.env.E2E_USERS ?? '[]') as DemoUser[]).filter((u) => u.role === role)[nth];
  if (!user) throw new Error(`Sem usuário demo com o papel ${role}`);
  return user;
}

export async function login(page: Page, role: string, next = '/painel', nth = 0): Promise<void> {
  const user = demoUser(role, nth);
  if (!page.url().includes('/entrar')) await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(next);
}
