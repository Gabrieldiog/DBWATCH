import { expect, test, type APIRequestContext } from '@playwright/test';
import { login } from './demo';

const origin = { origin: 'http://localhost:3000' };
type Req = { id: string; status: string; resource: { name: string } };

// Cada execução começa sem pedido pendente: o banco só aceita um pendente por pessoa e recurso
async function freshRequest(api: APIRequestContext): Promise<string> {
  const mine = (await (await api.get('/api/requests/mine')).json()) as Req[];
  for (const r of mine.filter((r) => r.status === 'PENDING')) await api.post(`/api/requests/${r.id}/cancel`, { headers: origin });
  const resources = (await (await api.get('/api/resources')).json()) as { id: string; name: string }[];
  const resourceId = resources.find((r) => r.name === 'Catálogo de produtos')!.id;
  const res = await api.post('/api/requests', {
    headers: origin,
    data: { resourceId, accessLevel: 'READ', requestedMinutes: 15, justification: 'Conferir o catálogo antes da vitrine de sexta' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as Req).id;
}

// Parte do T-E2E-02: o solicitante acompanha os próprios pedidos
test('meus pedidos mostra o pendente e cancelar muda o estado no banco', async ({ page }) => {
  await login(page, 'REQUESTER', '/pedidos');
  const id = await freshRequest(page.request);
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Catálogo de produtos' }).first();
  await expect(row).toContainText('Pendente');
  await expect(row).toContainText('Leitura · 15 min');
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row).toContainText('Cancelado');
  const mine = (await (await page.request.get('/api/requests/mine')).json()) as Req[];
  expect(mine.find((r) => r.id === id)?.status).toBe('CANCELLED');
});

test('pedido cancelado em outra aba mostra o erro da API e não muda nada', async ({ page }) => {
  await login(page, 'REQUESTER', '/pedidos');
  const id = await freshRequest(page.request);
  await page.reload();
  await page.request.post(`/api/requests/${id}/cancel`, { headers: origin });
  const row = page.getByRole('row').filter({ hasText: 'Catálogo de produtos' }).first();
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row.getByRole('alert')).toHaveText('Pedido pendente não encontrado');
});

test('quem não pode pedir acesso recebe 404 na tela', async ({ page }) => {
  await login(page, 'AUDITOR');
  const res = await page.goto('/pedidos');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});

test('no celular a tabela vira blocos e a página não rola para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, 'REQUESTER', '/pedidos');
  await freshRequest(page.request);
  await page.reload();
  const box = await page.locator('td[data-label="Estado"]').first().boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
