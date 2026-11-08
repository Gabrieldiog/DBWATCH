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
  await expect(page.getByText('Sem acesso a Clientes agora.')).toBeVisible();
  await page.getByRole('link', { name: 'Pedir acesso a Clientes' }).click();
  await expect(page.getByLabel('Recurso').first().locator('option:checked')).toHaveText(/^Clientes/);

  await approvedGrant(page.request, bruno.request, 'Clientes', 'WRITE');
  await page.goto('/console');
  await page.getByLabel('Recurso').selectOption({ label: 'Clientes' });
  await expect(page.getByText(/Você tem acesso de Escrita a Clientes até/)).toBeVisible();
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

// PK-23: com Leitura o console também serve, mas a transação é somente leitura
test('console SQL: com Leitura consulta pelo SQL pronto e o banco recusa a alteração (25006)', async ({ page, browser }) => {
  const bruno = await (await browser.newContext()).newPage();
  await login(bruno, 'APPROVER');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/console');
  await approvedGrant(page.request, bruno.request, 'Clientes', 'READ');
  await page.goto('/console');
  await page.getByLabel('Recurso').selectOption({ label: 'Clientes' });
  await expect(page.getByText(/Você tem acesso de Leitura a Clientes até/)).toBeVisible();
  const form = page.locator('form.console-sql');
  const executar = page.getByRole('button', { name: 'Executar no banco' });

  await page.getByRole('button', { name: 'Clientes de Goiânia' }).click();
  await executar.click();
  await expect(form.getByRole('status')).toContainText('SELECT: 20 linha(s)');
  await expect(page.getByRole('row').filter({ hasText: 'cliente' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Mudar a cidade de um cliente' }).click();
  await executar.click();
  await expect(form.getByRole('alert')).toContainText('SQLSTATE 25006');
  await expect(form.getByRole('alert')).toContainText('read-only transaction');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
});
