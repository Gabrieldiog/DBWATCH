import { expect, test } from '@playwright/test';
import { login } from './demo';

// O guia mostra só o que o papel enxerga, com as permissões em português
test('a visão geral explica cada área do papel e traduz as permissões', async ({ page }) => {
  await login(page, 'REQUESTER');
  const guia = page.locator('.guia');
  await expect(guia.getByRole('link')).toHaveText(['Minhas sessões', 'Pedir acesso', 'Meus acessos', 'Consultas', 'Console SQL']);
  await expect(guia).not.toContainText('Usuários');
  await expect(page.getByText('Pedir acesso a um recurso')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Os papéis' })).toBeVisible();
});

// <details> nativo: fechado por padrão, abre pelo teclado e explica cada número do monitor
test('o "O que é esta tela?" do monitor abre pelo teclado e explica os números', async ({ page }) => {
  await login(page, 'AUDITOR', '/monitor');
  const ajuda = page.locator('details.explica');
  await expect(ajuda.getByText('Ociosas em transação:')).toBeHidden();
  await ajuda.getByText('O que é esta tela?').focus();
  await page.keyboard.press('Enter');
  await expect(ajuda.getByText('Ociosas em transação:')).toBeVisible();
  await expect(ajuda).toContainText('O PostgreSQL só conta, não diz quais');
});
