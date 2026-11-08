import { expect, test } from '@playwright/test';
import { demoUser, login } from './demo';
import { approvedGrant, revokeGrants } from './pam';

// PK-21: escrita de verdade no banco da loja, limitada pelo papel do recurso
test('console SQL: sem escrita leva ao pedido certo; com escrita altera de verdade e o banco recusa outra tabela', async ({ page, browser }) => {
  const bruno = await (await browser.newContext()).newPage();
  await login(bruno, 'APPROVER');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/console');
  await page.getByLabel('Recurso').selectOption({ label: 'Clientes' });
  await expect(page.getByText('Sem acesso de escrita a Clientes agora.')).toBeVisible();
  await page.getByRole('link', { name: 'Pedir escrita em Clientes' }).click();
  await expect(page.getByLabel('Recurso').first().locator('option:checked')).toHaveText(/^Clientes/);
  await expect(page.getByLabel('Escrita')).toBeChecked();

  await approvedGrant(page.request, bruno.request, 'Clientes', 'WRITE');
  await page.goto('/console');
  await page.getByLabel('Recurso').selectOption({ label: 'Clientes' });
  await expect(page.getByText(/Você tem acesso de escrita a Clientes até/)).toBeVisible();
  const comando = page.getByLabel('Comando SQL (um por vez)');
  const executar = page.getByRole('button', { name: 'Executar no banco' });

  await page.getByRole('button', { name: 'Mudar a cidade de um cliente' }).click();
  await expect(comando).toHaveValue(/UPDATE loja\.clientes/);
  await executar.click();
  await expect(page.locator('form.console-sql').getByRole('status')).toContainText('UPDATE: 1 linha(s)');
  await expect(page.getByRole('row').filter({ hasText: 'Cliente 7' })).toContainText('Anápolis');

  await page.getByRole('button', { name: 'Apagar pedidos (outra tabela)' }).click();
  await executar.click();
  // Só o alerta do formulário: o Next também tem um role="alert" (o anúncio de troca de rota)
  const erro = page.locator('form.console-sql').getByRole('alert');
  await expect(erro).toContainText('SQLSTATE 42501');
  await expect(erro).toContainText('permission denied for table pedidos');

  // Devolve o dado fictício como era (o cliente 7 é de Aparecida de Goiânia no banco-alvo)
  await comando.fill("UPDATE loja.clientes SET cidade = 'Aparecida de Goiânia' WHERE id = 7");
  await executar.click();
  await expect(page.locator('form.console-sql').getByRole('status')).toContainText('UPDATE: 1 linha(s)');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
});
