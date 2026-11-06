import { expect, test, type Page } from '@playwright/test';
import { login } from './demo';

const card = (page: Page, text: string) => page.locator('.cards > li').filter({ hasText: text });

// T-E2E-06: experimentos reais pela tela, cada passo com tempo e SQLSTATE vindos do banco
test('deadlock pela tela: uma sessão recebe 40P01 e a execução entra no histórico', async ({ page }) => {
  await login(page, 'ADMIN', '/laboratorio');
  const deadlock = card(page, 'derruba exatamente um (40P01)');
  await deadlock.getByRole('button', { name: 'Rodar experimento' }).click();
  const status = deadlock.getByRole('status');
  await expect(status).toContainText('Comportamento confirmado no banco', { timeout: 15_000 });
  await expect(deadlock.locator('.step-error')).toHaveCount(1);
  await expect(deadlock.locator('.step-error')).toContainText('erro 40P01');
  const id = (await status.textContent())!.match(/#(\d+)/)![1];
  await expect(page.getByRole('row').filter({ hasText: `#${id}` })).toContainText('deadlock');
  await expect(deadlock.getByText('O que isso mostra:')).toBeVisible();

  // O contador nativo do pg_stat_database sobe e o monitor mostra na amostra seguinte
  await page.goto('/monitor');
  const deadlocks = page.locator('.stats > div', { has: page.locator('dt', { hasText: 'Deadlocks (30 min)' }) }).locator('dd');
  await expect.poll(async () => Number(await deadlocks.textContent()), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('espera de lock: B espera 6 s e o grafo do monitor desenha o bloqueio ao vivo', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await login(page, 'ADMIN', '/laboratorio');
  const monitor = await (await browser.newContext()).newPage();
  await login(monitor, 'ADMIN', '/monitor');
  const lock = card(page, 'B espera A confirmar');
  await lock.getByRole('button', { name: 'Rodar experimento' }).click();
  const row = monitor.getByRole('figure', { name: /Quem bloqueia quem/ }).getByRole('row').filter({ hasText: '(dbwatch-lab:B)' });
  await expect(row.getByRole('cell').first()).toContainText('(dbwatch-lab:A)', { timeout: 10_000 });
  await expect(lock.getByRole('status')).toContainText('Comportamento confirmado no banco', { timeout: 15_000 });
  await expect(lock.locator('.step-B.step-slow')).toContainText(/ok em \d{4,} ms, esperando/);
});

test('quem não tem lab:run recebe 404', async ({ page }) => {
  await login(page, 'AUDITOR');
  expect((await page.goto('/laboratorio'))?.status()).toBe(404);
});
