import { expect, test } from '@playwright/test';
import { login } from './demo';

// LAB: o botão da apresentação. Tudo acontece no PostgreSQL; a tela só observa (grafo, números e SSE)
test('bot da simulação: acesso, incidente e verificação chegam ao vivo no monitor até o fim', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, 'ADMIN', '/monitor');
  await page.getByRole('button', { name: '▶ Iniciar simulação' }).click();
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Rodando no banco' })).toBeVisible();

  // Só o que chegou ao vivo depois do clique: a lista inicial pode ter narrações de rodadas anteriores
  const live = page.locator('.events li.event-new');
  // Ato 1: as duas camadas barram a autoaprovação
  await expect(live.filter({ hasText: 'A API recusou: Ninguém decide o próprio pedido' })).toContainText('Fonte: LAB', { timeout: 20_000 });
  await expect(live.filter({ hasText: 'o PostgreSQL recusou com 23514' })).toBeVisible({ timeout: 10_000 });

  const graph = page.getByRole('figure', { name: /Quem bloqueia quem/ });
  const row = graph.getByRole('row').filter({ hasText: '(dbwatch-sim:caixa)' });
  await expect(row.getByRole('cell').first()).toContainText('(dbwatch-sim:relatorio)', { timeout: 40_000 });

  // Ato 2: o incidente
  await expect(live.filter({ hasText: 'O relatório travou a conta da Ana' })).toContainText('Fonte: LAB');
  await expect(live.filter({ hasText: '55P03' }).first()).toBeVisible({ timeout: 20_000 });
  await expect(live.filter({ hasText: 'idle_in_transaction_session_timeout' })).toBeVisible({ timeout: 30_000 });
  await expect(live.filter({ hasText: 'Incidente resolvido' })).toContainText('total das contas 140.00', { timeout: 20_000 });
  // Ato 3 e fim
  await expect(live.filter({ hasText: /Cadeia íntegra: \d+ registros/ })).toBeVisible({ timeout: 20_000 });
  await expect(live.filter({ hasText: 'Simulação concluída' })).toBeVisible({ timeout: 10_000 });
});

test('quem não roda o laboratório não vê o botão da simulação', async ({ page }) => {
  await login(page, 'AUDITOR', '/monitor');
  await expect(page.getByRole('heading', { name: 'Agora no PostgreSQL' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Iniciar simulação/ })).toHaveCount(0);
});
