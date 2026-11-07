import { expect, test } from '@playwright/test';
import { login } from './demo';
import { origin, pendingRequest, statusOf } from './pam';

// Parte do T-E2E-02: o solicitante acompanha os próprios pedidos
test('meus pedidos mostra o pendente e cancelar muda o estado no banco', async ({ page }) => {
  await login(page, 'REQUESTER', '/pedidos');
  const id = await pendingRequest(page.request, 'Catálogo de produtos');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Catálogo de produtos' }).first();
  await expect(row).toContainText('Pendente');
  await expect(row).toContainText('Leitura · 15 min');
  await row.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row).toContainText('Cancelado');
  expect(await statusOf(page.request, id)).toBe('CANCELLED');
});

test('pedido cancelado em outra aba mostra o erro da API e não muda nada', async ({ page }) => {
  await login(page, 'REQUESTER', '/pedidos');
  const id = await pendingRequest(page.request, 'Catálogo de produtos');
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
  await pendingRequest(page.request, 'Catálogo de produtos');
  await page.reload();
  // A tabela chega depois do esqueleto de carregamento: mede só quando ela aparece
  const cell = page.locator('td[data-label="Estado"]').first();
  await expect(cell).toBeVisible();
  const box = await cell.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
