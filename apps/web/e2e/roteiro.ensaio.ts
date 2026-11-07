import { expect, test, type Page } from '@playwright/test';
import { demoUser, login } from './demo';
import { cancelPending, revokeGrants } from './pam';

// O roteiro do docs/DEMO.md na ordem da apresentação, só com o que acontece na tela (os blocos de psql ficam no terminal).
// As pausas dão tempo de narrar; no fim, o tempo de cada bloco sai no terminal para ajustar a fala
const blocos: [string, number][] = [];
async function bloco(nome: string, run: () => Promise<void>) {
  const t = Date.now();
  await test.step(nome, run);
  blocos.push([nome, Math.round((Date.now() - t) / 1000)]);
}
const narrar = (page: Page, s: number) => page.waitForTimeout(s * 1000);
const trocar = async (page: Page, papel: string, tela: string) => {
  await page.getByRole('button', { name: 'Sair' }).click();
  // O Sair navega para o login sozinho; só então o próximo papel entra
  await expect(page).toHaveURL(/\/entrar/);
  await page.goto(`/entrar?next=${encodeURIComponent(tela)}`);
  await login(page, papel, tela);
};
const lab = (page: Page, texto: string) => page.locator('.cards > li').filter({ hasText: texto });
async function rodar(page: Page, texto: string) {
  const card = lab(page, texto);
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Rodar experimento' }).click();
  await expect(card.getByRole('status')).toContainText('Comportamento confirmado no banco', { timeout: 30_000 });
  await card.getByText('O que isso mostra:').scrollIntoViewIfNeeded();
  await narrar(page, 4);
}

test('ensaio do roteiro da apresentação', async ({ page, browser }) => {
  test.setTimeout(10 * 60_000);
  // Palco limpo: sem concessão viva nem pedido pendente que atrapalhe a demonstração
  const apoio = await (await browser.newContext()).newPage();
  await login(apoio, 'APPROVER');
  for (const papel of ['REQUESTER', 'ADMIN']) await revokeGrants(apoio.request, demoUser(papel).email);
  await apoio.context().close();

  await bloco('Abertura: página inicial com o status real do banco', async () => {
    await page.goto('/');
    await narrar(page, 5);
  });

  await bloco('PAM: Diego pede acesso a Clientes', async () => {
    await login(page, 'REQUESTER', '/pedidos');
    await cancelPending(page.request, 'Clientes');
    await page.reload();
    await page.getByLabel('Recurso').first().selectOption({ label: 'Clientes · sensibilidade Média · até 1 h' });
    await page.getByLabel(/Duração/).first().fill('15');
    await page.getByLabel('Justificativa').fill('Conferir o cadastro de clientes antes da campanha de novembro');
    await narrar(page, 2);
    await page.getByRole('button', { name: 'Pedir acesso' }).click();
    await expect(page.getByRole('status')).toHaveText(/Pedido enviado/);
    await narrar(page, 3);
  });

  await bloco('PAM: Bruno aprova', async () => {
    await trocar(page, 'APPROVER', '/aprovacoes');
    const card = page.locator('ul.cards').first().getByRole('listitem').filter({ hasText: 'em Clientes' });
    await narrar(page, 3);
    await card.getByRole('button', { name: 'Aprovar' }).click();
    await expect(card).toHaveCount(0);
  });

  await bloco('Concessão: contagem regressiva e consulta do catálogo', async () => {
    await trocar(page, 'REQUESTER', '/acessos');
    await narrar(page, 4);
    await page.goto('/consultas');
    const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Clientes de uma cidade (e-mail mascarado)' }) });
    await card.getByLabel('cidade').fill('Goiânia');
    await card.getByRole('button', { name: 'Executar' }).click();
    await expect(card.getByRole('status')).toContainText(/linha\(s\) em \d+ ms/);
    await narrar(page, 4);
  });

  await bloco('Auditoria: Eva verifica a cadeia de hash', async () => {
    await trocar(page, 'AUDITOR', '/auditoria');
    await narrar(page, 3);
    await page.getByRole('button', { name: 'Verificar integridade' }).click();
    await expect(page.getByRole('main').getByRole('status')).toHaveText(/Cadeia íntegra/);
    await narrar(page, 3);
  });

  await bloco('Laboratório: rollback, lock, deadlock, isolamento e índices', async () => {
    await trocar(page, 'ADMIN', '/laboratorio');
    for (const texto of ['a CHECK barra e o ROLLBACK', 'B espera A confirmar', 'derruba exatamente um (40P01)', 'sempre alguém de plantão', 'sem índice, com B-tree e com BRIN'])
      await rodar(page, texto);
  });

  await bloco('Bot da simulação no Monitor (LAB): acesso, incidente e verificação', async () => {
    await page.goto('/monitor');
    await page.getByRole('button', { name: '▶ Iniciar simulação' }).click();
    // O que importa fica abaixo dos números: o grafo de bloqueio e o fluxo de eventos
    await page.getByRole('heading', { name: 'Bloqueios agora' }).evaluate((h) => h.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    const fim = page.locator('.events li.event-new').filter({ hasText: 'Simulação concluída' });
    await expect(fim).toBeVisible({ timeout: 90_000 });
    await narrar(page, 3);
  });

  await bloco('Break-glass: Ana abre, o alerta sobe e Bruno revisa', async () => {
    await page.goto('/pedidos');
    const form = page.locator('form.break-glass');
    await form.scrollIntoViewIfNeeded();
    await form.getByLabel(/O que está acontecendo/).fill('Incidente no fechamento: preciso ler o catálogo agora para achar o produto com preço errado');
    await form.getByLabel(/Duração/).fill('5');
    await form.getByRole('button', { name: 'Abrir acesso de emergência' }).click();
    await expect(form.getByRole('status')).toContainText('Acesso de leitura aberto até');
    await page.goto('/monitor');
    await expect(page.locator('.events li').filter({ hasText: 'Acesso de emergência' }).first()).toBeVisible();
    await narrar(page, 3);
    await trocar(page, 'APPROVER', '/aprovacoes');
    const card = page.locator('li.break-glass').filter({ hasText: 'preço errado' }).first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole('button', { name: 'Revisar' }).click();
    await page.getByRole('dialog').getByLabel(/Motivo/).fill('Conferido com o time de vendas, uso legítimo');
    await page.getByRole('dialog').getByRole('button', { name: 'Revisar' }).click();
    await expect(card).toHaveCount(0);
    await revokeGrants(page.request, demoUser('ADMIN').email);
  });

  console.log(['', 'Tempo de cada bloco (s):', ...blocos.map(([n, s]) => `  ${String(s).padStart(4)}  ${n}`), `  ${String(blocos.reduce((a, [, s]) => a + s, 0)).padStart(4)}  total`].join('\n'));
});
