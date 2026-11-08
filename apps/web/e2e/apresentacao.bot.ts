import { expect, request, test, type Page } from '@playwright/test';
import { apontar, clicar, digitar, legenda, prepararCursor, respirar } from './bot-ponteiro';
import { demoUser } from './demo';
import { cancelPending, origin, revokeGrants } from './pam';

// O bot da apresentação: as quatro pessoas usam as telas de verdade, uma depois da outra, no mesmo navegador.
// Nada é encenado: cada clique é uma chamada real à API, e o que aparece na tela é o que o banco respondeu
const RECURSO = 'Clientes · sensibilidade Média · até 1 h';

async function entrar(page: Page, papel: string, tela: string) {
  const u = demoUser(papel);
  await page.goto(`/entrar?next=${encodeURIComponent(tela)}`);
  await digitar(page, page.getByLabel('E-mail'), u.email);
  await digitar(page, page.getByLabel('Senha'), u.password);
  await clicar(page, page.getByRole('button', { name: 'Entrar' }));
  await expect(page).toHaveURL((url) => url.pathname === tela);
}

async function sair(page: Page) {
  await clicar(page, page.getByRole('button', { name: 'Sair' }));
  await expect(page).toHaveURL(/\/entrar/);
}

// Sessão só de API, sem tela, para deixar o palco limpo antes de começar
async function api(papel: string) {
  const ctx = await request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: origin });
  const u = demoUser(papel);
  expect((await ctx.post('/api/auth/login', { data: { email: u.email, password: u.password } })).status()).toBe(204);
  return ctx;
}

test('o DBWATCH se demonstra sozinho', async ({ page }) => {
  const [bruno, diego] = [await api('APPROVER'), await api('REQUESTER')];
  for (const papel of ['REQUESTER', 'ADMIN']) await revokeGrants(bruno, demoUser(papel).email);
  await cancelPending(diego, 'Clientes');
  await Promise.all([bruno.dispose(), diego.dispose()]);
  await prepararCursor(page);

  await page.goto('/');
  await legenda(page, 'DBWATCH: quem acessa dados sensíveis, por quanto tempo e com a aprovação de quem');
  await respirar(page, 4);

  // 1. Pedido
  await entrar(page, 'REQUESTER', '/pedidos');
  await legenda(page, 'Diego precisa ver o cadastro de clientes e pede acesso, com justificativa');
  const recurso = page.getByLabel('Recurso').first();
  await apontar(page, recurso);
  await recurso.selectOption({ label: RECURSO });
  await digitar(page, page.getByLabel(/Duração/).first(), '15');
  await digitar(page, page.getByLabel('Justificativa'), 'Conferir o cadastro de clientes antes da campanha de novembro');
  await clicar(page, page.getByRole('button', { name: 'Pedir acesso' }));
  await expect(page.getByRole('status')).toHaveText(/Pedido enviado/);
  await legenda(page, 'O pedido nasce Pendente. Diego não pode aprovar o próprio pedido');
  await respirar(page, 3);
  await page.goto('/aprovacoes');
  await legenda(page, 'Se Diego tenta abrir Aprovações, a tela nem existe para ele: 404');
  await respirar(page, 3.5);

  // 2. Aprovação
  await page.goto('/painel');
  await sair(page);
  await entrar(page, 'APPROVER', '/aprovacoes');
  await legenda(page, 'Bruno, o aprovador, lê a justificativa e decide');
  const card = page.locator('ul.cards').first().getByRole('listitem').filter({ hasText: 'em Clientes' });
  await respirar(page, 2.5);
  await clicar(page, card.getByRole('button', { name: 'Aprovar' }));
  await expect(card).toHaveCount(0);
  await legenda(page, 'Aprovado: a concessão nasceu na mesma transação, com prazo pelo relógio do banco');
  await respirar(page, 3);

  // 3. Uso
  await sair(page);
  await entrar(page, 'REQUESTER', '/acessos');
  await legenda(page, 'Diego vê o acesso vivo, com a contagem regressiva');
  await respirar(page, 3);
  await clicar(page, page.getByRole('link', { name: 'Consultas' }));
  await legenda(page, 'Com o acesso vivo, Diego consulta os clientes de Goiânia');
  const consulta = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Clientes de uma cidade (e-mail mascarado)' }) });
  await digitar(page, consulta.getByLabel('cidade'), 'Goiânia');
  await clicar(page, consulta.getByRole('button', { name: 'Executar' }));
  await expect(consulta.getByRole('status')).toContainText(/linha\(s\) em \d+ ms/);
  await legenda(page, 'Só leitura, e-mail mascarado e tempo-limite. A execução tem um código na auditoria');
  await respirar(page, 3.5);

  // 4. Auditoria
  await sair(page);
  await entrar(page, 'AUDITOR', '/auditoria');
  await legenda(page, 'Eva, da auditoria, procura tudo o que o Diego fez');
  await digitar(page, page.getByLabel('Pessoa (e-mail)'), demoUser('REQUESTER').email);
  await clicar(page, page.getByRole('button', { name: 'Filtrar' }));
  await expect(page.getByRole('row').filter({ hasText: 'pam.query_execute' }).first()).toBeVisible();
  await respirar(page, 3);
  await clicar(page, page.getByRole('button', { name: 'Verificar integridade' }));
  await expect(page.getByRole('main').getByRole('status')).toHaveText(/Cadeia íntegra/);
  await legenda(page, 'A cadeia de hash foi recalculada dentro do banco: nenhum registro foi alterado');
  await respirar(page, 3.5);

  // 5. Laboratório
  await sair(page);
  await entrar(page, 'ADMIN', '/laboratorio');
  const deadlock = page.locator('.cards > li').filter({ hasText: 'derruba exatamente um (40P01)' });
  await legenda(page, 'No laboratório (LAB), duas sessões reais travam uma à outra');
  await clicar(page, deadlock.getByRole('button', { name: 'Rodar experimento' }));
  await expect(deadlock.getByRole('status')).toContainText('Comportamento confirmado no banco', { timeout: 30_000 });
  await apontar(page, deadlock.locator('.step-error'));
  await legenda(page, 'O PostgreSQL achou o ciclo e derrubou uma das sessões com 40P01');
  await respirar(page, 4);

  // 6. Break-glass
  await clicar(page, page.getByRole('link', { name: 'Pedir acesso' }));
  const form = page.locator('form.break-glass');
  await legenda(page, 'Emergência: Ana abre um acesso sem esperar aprovação (break-glass), no máximo 15 minutos');
  await digitar(page, form.getByLabel(/Duração/), '5');
  await digitar(page, form.getByLabel(/O que está acontecendo/), 'Incidente no fechamento: preciso ler o catálogo agora');
  await clicar(page, form.getByRole('button', { name: 'Abrir acesso de emergência' }));
  await expect(form.getByRole('status')).toContainText('Acesso de leitura aberto até');
  await respirar(page, 2.5);

  // 7. Monitor e o incidente
  await clicar(page, page.getByRole('link', { name: 'Monitor' }));
  const alerta = page.locator('.events li').filter({ hasText: 'Acesso de emergência' }).first();
  await apontar(page, alerta);
  await legenda(page, 'O alerta de emergência chegou ao Monitor na hora; outra pessoa vai revisar depois');
  await respirar(page, 3.5);
  await legenda(page, 'Agora o próprio sistema roda um incidente de verdade no banco');
  await clicar(page, page.getByRole('button', { name: '▶ Iniciar simulação' }));
  await page.getByRole('heading', { name: 'Bloqueios agora' }).evaluate((h) => h.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  // A legenda acompanha o evento mais novo que o banco manda pelo SSE, até o fim da história
  const novos = page.locator('.events li.event-new');
  const fim = novos.filter({ hasText: 'Simulação concluída' });
  for (let i = 0; i < 240 && (await fim.count()) === 0; i++) {
    const titulo = await novos.first().locator('strong').textContent().catch(() => null);
    if (titulo) await legenda(page, `Ao vivo: ${titulo}`);
    await page.waitForTimeout(500);
  }
  await expect(fim).toBeVisible();
  await legenda(page, 'Fim. Tudo o que aconteceu aqui está na auditoria, e nada pode ser apagado');
  await respirar(page, 5);
});
