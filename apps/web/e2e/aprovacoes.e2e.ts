import { expect, test, type Browser, type Page } from '@playwright/test';
import { demoUser, login } from './demo';
import { cancelPending, pendingRequest, revokeGrants, statusOf } from './pam';

async function approver(browser: Browser, nth = 0): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await login(page, 'APPROVER', '/aprovacoes', nth);
  return page;
}
const card = (page: Page, resource: string) => page.getByRole('listitem').filter({ hasText: `em ${resource}` });

// T-E2E-02 até a aprovação; a contagem regressiva do acesso vem com a tela "Meus acessos"
test('T-E2E-02 solicitante pede pelo formulário e o aprovador aprova', async ({ page, browser }) => {
  const bruno = await approver(browser);
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/pedidos');
  await cancelPending(page.request, 'Clientes');
  await page.reload();
  await page.getByLabel('Recurso').selectOption({ label: 'Clientes · sensibilidade Média · até 1 h' });
  await expect(page.getByLabel(/Duração/)).toHaveAttribute('max', '60');
  await page.getByLabel(/Duração/).fill('20');
  await page.getByLabel('Justificativa').fill('Curta');
  await expect(page.getByText('Faltam 15 caracteres')).toBeVisible();
  await page.getByLabel('Justificativa').fill('Conferir o cadastro de clientes antes da vitrine');
  await page.getByRole('button', { name: 'Pedir acesso' }).click();
  await expect(page.getByRole('status')).toHaveText(/Pedido enviado/);
  await expect(page.getByRole('row').filter({ hasText: 'Clientes' }).first()).toContainText('Pendente');

  await bruno.reload();
  await card(bruno, 'Clientes').getByRole('button', { name: 'Aprovar' }).click();
  await expect(card(bruno, 'Clientes')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'Clientes' }).first()).toContainText('Aprovado');
});

test('rejeitar pede um motivo num diálogo e o solicitante vê o motivo', async ({ page, browser }) => {
  await login(page, 'REQUESTER', '/pedidos');
  const id = await pendingRequest(page.request, 'Catálogo de produtos');
  const bruno = await approver(browser);
  await card(bruno, 'Catálogo de produtos').getByRole('button', { name: 'Rejeitar' }).click();
  const dialog = bruno.getByRole('dialog', { name: /Rejeitar o pedido de/ });
  await dialog.getByLabel(/Motivo/).fill('Sem chamado aberto para esse acesso');
  await dialog.getByRole('button', { name: 'Rejeitar' }).click();
  await expect(dialog).toBeHidden();
  await expect(card(bruno, 'Catálogo de produtos')).toHaveCount(0);
  expect(await statusOf(page.request, id)).toBe('REJECTED');
  await page.reload();
  await expect(page.getByText('Motivo: Sem chamado aberto para esse acesso').first()).toBeVisible();
});

test('recurso HIGH: a mesma pessoa não aprova duas vezes, a segunda aprovação é de outra', async ({ page, browser }) => {
  const bruno = await approver(browser);
  await revokeGrants(bruno.request, demoUser('REQUESTER').email);
  await login(page, 'REQUESTER', '/pedidos');
  const id = await pendingRequest(page.request, 'Financeiro');
  await bruno.reload();
  await card(bruno, 'Financeiro').getByRole('button', { name: 'Aprovar' }).click();
  await expect(card(bruno, 'Financeiro')).toContainText('1 de 2 aprovações');
  await expect(card(bruno, 'Financeiro').getByRole('button', { name: 'Aprovar' })).toBeDisabled();
  expect(await statusOf(page.request, id)).toBe('PENDING');

  const carla = await approver(browser, 1);
  await card(carla, 'Financeiro').getByRole('button', { name: 'Aprovar' }).click();
  await expect(card(carla, 'Financeiro')).toHaveCount(0);
  expect(await statusOf(page.request, id)).toBe('APPROVED');
});
