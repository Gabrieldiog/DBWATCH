import { expect, test, type Page } from '@playwright/test';
import { demoUser, login } from './demo';
import { approvedGrant, revokeGrants } from './pam';

const card = (page: Page, title: string) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

async function withGrant(page: Page, browser: import('@playwright/test').Browser, resource: string) {
  const bruno = await (await browser.newContext()).newPage();
  await login(bruno, 'APPROVER');
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/consultas');
  if (resource) await approvedGrant(page.request, bruno.request, resource);
  await page.reload();
}

// T-E2E-03: o solicitante executa uma consulta do catálogo e vê o resultado
test('T-E2E-03 consulta do catálogo com concessão ativa mostra as linhas e o código da execução', async ({ page, browser }) => {
  await withGrant(page, browser, 'Catálogo de produtos');
  const produtos = card(page, 'Produtos de uma categoria');
  await produtos.getByLabel('Categoria').selectOption('Bebidas');
  await produtos.getByRole('button', { name: 'Executar' }).click();
  await expect(produtos.getByRole('status')).toContainText(/50 linha\(s\) em \d+ ms/);
  await expect(produtos.getByRole('status')).toContainText(UUID);
  await expect(produtos.getByRole('columnheader')).toHaveText(['id', 'nome', 'preco']);
  await expect(produtos.getByRole('row')).toHaveCount(51);
});

test('consulta lenta é cancelada pelo banco e a tela explica o tempo-limite', async ({ page, browser }) => {
  await withGrant(page, browser, 'Catálogo de produtos');
  const lenta = card(page, 'LAB: relatório que demora (tempo-limite de 1 s)');
  await lenta.getByLabel('Segundos de espera').fill('3');
  await lenta.getByRole('button', { name: 'Executar' }).click();
  await expect(lenta.getByRole('alert')).toHaveText('A consulta passou do tempo-limite e foi cancelada pelo banco.');
  await expect(lenta.getByRole('status')).toContainText(UUID);
});

// Sem acesso, o cartão mostra o caminho: o link abre o pedido já no recurso certo
test('sem acesso, a consulta oferece o pedido já preenchido; com acesso, mostra até quando vale', async ({ page, browser }) => {
  await withGrant(page, browser, '');
  const bloco = (nome: string) => page.getByRole('region', { name: nome, exact: true });
  await expect(bloco('Clientes')).toContainText('Sem acesso a Clientes agora.');
  await bloco('Clientes').getByRole('link', { name: 'Pedir acesso a Clientes' }).click();
  await expect(page).toHaveURL(/\/pedidos\?recurso=/);
  await expect(page.getByLabel('Recurso').first().locator('option:checked')).toHaveText(/^Clientes/);

  await withGrant(page, browser, 'Catálogo de produtos');
  await page.goto('/consultas');
  await expect(bloco('Catálogo de produtos')).toContainText(/Você tem acesso a Catálogo de produtos até \d{2}\/\d{2}\/\d{4}/);
  await expect(bloco('Financeiro')).toContainText('Sem acesso a Financeiro agora.');
});

test('sem concessão viva a API nega e a tela mostra o motivo', async ({ page, browser }) => {
  await withGrant(page, browser, '');
  const clientes = card(page, 'Clientes de uma cidade (e-mail mascarado)');
  await clientes.getByLabel('Cidade').selectOption('Goiânia');
  await clientes.getByRole('button', { name: 'Executar' }).click();
  // O motivo depende do histórico do Diego no banco (nunca teve acesso, ou teve e expirou ou foi revogado)
  await expect(clientes.getByRole('alert')).toContainText(/Você ainda não tem acesso a este recurso|Seu acesso a este recurso (expirou|foi revogado)/);
  await expect(clientes.getByRole('link', { name: 'Pedir acesso a Clientes' })).toBeVisible();
  await expect(clientes.getByRole('table')).toHaveCount(0);
});

test('auditora não executa consultas e recebe 404', async ({ page }) => {
  await login(page, 'AUDITOR');
  expect((await page.goto('/consultas'))?.status()).toBe(404);
});
