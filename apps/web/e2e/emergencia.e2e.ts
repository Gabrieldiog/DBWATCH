import { expect, test } from '@playwright/test';
import { demoUser, login } from './demo';
import { revokeGrants } from './pam';

// Break-glass de ponta a ponta: a Ana abre sozinha, o alerta fica na fila e outra pessoa revisa pela tela
test('break-glass: abre na hora pela tela e o aprovador revisa depois', async ({ page, browser }) => {
  const ana = demoUser('ADMIN').email;
  const bruno = await (await browser.newContext()).newPage();
  await login(bruno, 'APPROVER', '/aprovacoes');
  await revokeGrants(bruno.request, ana); // sobra de uma rodada anterior bateria na EXCLUDE de concessão sobreposta

  await login(page, 'ADMIN', '/pedidos');
  const form = page.locator('form.break-glass');
  const motivo = `Incidente E2E ${Date.now()}: fechamento travado, preciso ler o catálogo agora`;
  await form.getByLabel(/O que está acontecendo/).fill('curto demais');
  await expect(form.getByText('12 de 40')).toBeVisible();
  await form.getByLabel(/O que está acontecendo/).fill(motivo);
  await form.getByLabel(/Duração/).fill('5');
  await form.getByRole('button', { name: 'Abrir acesso de emergência' }).click();
  await expect(form.getByRole('status')).toContainText('Acesso de leitura aberto até');

  await bruno.reload();
  const card = bruno.locator('li.break-glass').filter({ hasText: motivo });
  await expect(card).toContainText(`${ana} abriu leitura em`);
  await card.getByRole('button', { name: 'Revisar' }).click();
  const dialog = bruno.getByRole('dialog');
  await dialog.getByLabel(/Motivo/).fill('Conferido com o time, uso legítimo');
  await dialog.getByRole('button', { name: 'Revisar' }).click();
  await expect(card).toHaveCount(0);
  await revokeGrants(bruno.request, ana);
});

test('quem não tem breakglass:use não vê o formulário de emergência', async ({ page }) => {
  await login(page, 'REQUESTER', '/pedidos');
  await expect(page.getByRole('heading', { name: 'Pedir acesso' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Emergência/ })).toHaveCount(0);
});

// Faixa de documentação (RFC 5737): nunca casa com o 127.0.0.1 dos outros testes, então não tranca ninguém
test('ACL de login: o banco recusa negar todo mundo, e uma regra válida é criada e removida pela tela', async ({ page }) => {
  await login(page, 'ADMIN', '/usuarios');
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Criar regra' }) });
  const desc = `Regra E2E ${Date.now()}`;
  await form.getByLabel('Descrição').fill(desc);
  await form.getByRole('button', { name: 'Criar regra' }).click();
  await expect(form.getByRole('alert')).toHaveText('Uma regra não pode negar o login de todos, sempre');

  await form.getByLabel(/Faixa de IP/).fill('203.0.113.0/24');
  await form.getByLabel('Sáb').check();
  await form.getByLabel(/^Das/).fill('22:00');
  await form.getByLabel('Até').fill('23:30');
  await form.getByRole('button', { name: 'Criar regra' }).click();
  await expect(form.getByRole('status')).toContainText('Regra criada');
  const row = page.getByRole('row').filter({ hasText: desc });
  await expect(row).toContainText('IP em 203.0.113.0/24, Sáb, das 22:00 às 23:30');
  await expect(row).toContainText('Negar');
  await row.getByRole('button', { name: 'Remover regra' }).click();
  await expect(row).toHaveCount(0);
});
