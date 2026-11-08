import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { demoUser, login } from './demo';
import { approvedGrant, pendingRequest, revokeGrants } from './pam';

// T-A11Y-01 (parte já publicada): login e console, nos dois temas
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`tema ${colorScheme === 'light' ? 'claro' : 'escuro'}`, () => {
    test.use({ colorScheme });

    test('login', async ({ page }) => {
      await page.goto('/entrar?motivo=expirou');
      await expectNoSeriousViolations(page);
    });

    test('console', async ({ page }) => {
      await login(page, 'ADMIN');
      await expectNoSeriousViolations(page);
    });

    test('monitor com a tabela do gráfico aberta', async ({ page }) => {
      await login(page, 'AUDITOR', '/monitor');
      await page.getByText('Ver como tabela').first().click();
      await expectNoSeriousViolations(page);
    });

    test('laboratório com a linha do tempo de um experimento', async ({ page }) => {
      await login(page, 'ADMIN', '/laboratorio');
      await page.getByRole('button', { name: 'Rodar experimento' }).first().click();
      await expect(page.getByRole('main').getByRole('status')).toBeVisible({ timeout: 15_000 });
      await expectNoSeriousViolations(page);
    });

    test('meus pedidos', async ({ page }) => {
      await login(page, 'REQUESTER', '/pedidos');
      await expectNoSeriousViolations(page);
    });

    test('aprovações com o diálogo de rejeição aberto', async ({ page, browser }) => {
      const requester = await (await browser.newContext()).newPage();
      await login(requester, 'REQUESTER');
      await pendingRequest(requester.request, 'Catálogo de produtos');
      await login(page, 'APPROVER', '/aprovacoes');
      await page.getByRole('button', { name: 'Rejeitar' }).first().click();
      await expectNoSeriousViolations(page);
    });

    test('meus acessos com contagem e acessos de todos', async ({ page, browser }) => {
      const requester = await (await browser.newContext()).newPage();
      await login(requester, 'REQUESTER');
      await login(page, 'APPROVER', '/acessos');
      await revokeGrants(page.request, demoUser('REQUESTER').email);
      await approvedGrant(requester.request, page.request, 'Catálogo de produtos');
      await page.reload();
      await expectNoSeriousViolations(page);
    });

    test('consultas', async ({ page }) => {
      await login(page, 'REQUESTER', '/consultas');
      await expectNoSeriousViolations(page);
    });

    test('auditoria', async ({ page }) => {
      await login(page, 'AUDITOR', '/auditoria');
      await expectNoSeriousViolations(page);
    });

    test('usuários', async ({ page }) => {
      await login(page, 'ADMIN', '/usuarios');
      await expectNoSeriousViolations(page);
    });

    test('pedir acesso com o formulário de emergência', async ({ page }) => {
      await login(page, 'ADMIN', '/pedidos');
      await expect(page.getByRole('heading', { name: /Emergência/ })).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('visão geral e o monitor com a ajuda aberta', async ({ page }) => {
      await login(page, 'AUDITOR');
      await expectNoSeriousViolations(page);
      await page.goto('/monitor');
      await page.locator('details.explica summary').click();
      await expectNoSeriousViolations(page);
    });

    test('console SQL', async ({ page }) => {
      await login(page, 'REQUESTER', '/console');
      await expectNoSeriousViolations(page);
    });

    test('minhas sessões', async ({ page }) => {
      await login(page, 'REQUESTER', '/sessoes');
      await expectNoSeriousViolations(page);
    });

    test('página não encontrada', async ({ page }) => {
      await page.goto('/nao-existe');
      await expectNoSeriousViolations(page);
    });
  });
}

// WCAG 2.4.1: o primeiro Tab oferece pular o menu, e o Enter leva o foco direto ao conteúdo da tela
test('teclado: o primeiro Tab pula o menu direto para o conteúdo', async ({ page }) => {
  await login(page, 'APPROVER');
  // Carregamento normal da tela: depois do login, o Next ainda ajusta o foco da navegação e atropelaria o Tab
  await page.goto('/acessos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#conteudo')).toBeFocused();
});
