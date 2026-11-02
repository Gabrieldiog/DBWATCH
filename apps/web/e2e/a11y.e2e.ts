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

    test('página não encontrada', async ({ page }) => {
      await page.goto('/nao-existe');
      await expectNoSeriousViolations(page);
    });
  });
}
