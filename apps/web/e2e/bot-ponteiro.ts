import type { Locator, Page } from '@playwright/test';

// RITMO=2 deixa o bot duas vezes mais lento; 0.5, duas vezes mais rápido
const RITMO = Number(process.env.BOT_RITMO ?? 1);
export const respirar = (page: Page, segundos: number) => page.waitForTimeout(segundos * 1000 * RITMO);

// O Playwright clica de verdade, mas o navegador não desenha o ponteiro dele: o cursor e a legenda são desenhados aqui.
// Ficam no <html>, fora do <body> do React, e sobrevivem às trocas de página pelo sessionStorage
export async function prepararCursor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const desenhar = () => {
      if (document.getElementById('bot-cursor')) return;
      const cursor = document.createElement('div');
      cursor.id = 'bot-cursor';
      cursor.innerHTML =
        '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#fff" stroke="#0c2a31" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none' });
      const legenda = document.createElement('div');
      legenda.id = 'bot-legenda';
      Object.assign(legenda.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', maxWidth: '80vw', padding: '12px 20px',
        borderRadius: '10px', background: 'rgba(12, 42, 49, 0.94)', color: '#fff', font: '600 19px/1.4 system-ui, sans-serif',
        textAlign: 'center', zIndex: '2147483646', pointerEvents: 'none', boxShadow: '0 6px 24px rgba(0,0,0,.25)',
      });
      const texto = sessionStorage.getItem('bot-legenda') ?? '';
      legenda.textContent = texto;
      legenda.style.display = texto ? 'block' : 'none';
      const [x, y] = (sessionStorage.getItem('bot-xy') ?? '60,60').split(',');
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      document.documentElement.append(cursor, legenda);
    };
    document.addEventListener('mousemove', (e) => {
      sessionStorage.setItem('bot-xy', `${e.clientX},${e.clientY}`);
      const c = document.getElementById('bot-cursor');
      if (c) c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, true);
    // O clique deixa um anel que some: a plateia vê onde o bot apertou
    document.addEventListener('mousedown', (e) => {
      const anel = document.createElement('div');
      Object.assign(anel.style, {
        position: 'fixed', left: `${e.clientX - 18}px`, top: `${e.clientY - 18}px`, width: '36px', height: '36px', borderRadius: '50%',
        border: '3px solid #00727a', zIndex: '2147483646', pointerEvents: 'none',
      });
      document.documentElement.append(anel);
      anel.animate([{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 500 }).onfinish = () => anel.remove();
    }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', desenhar);
    else desenhar();
  });
}

export async function legenda(page: Page, texto: string): Promise<void> {
  await page.evaluate((t) => {
    sessionStorage.setItem('bot-legenda', t);
    const l = document.getElementById('bot-legenda');
    if (l) Object.assign(l, { textContent: t }).style.display = t ? 'block' : 'none';
  }, texto);
}

// Leva o cursor até o alvo em vários passos, como uma mão, e só então age
export async function apontar(page: Page, alvo: Locator): Promise<void> {
  await alvo.scrollIntoViewIfNeeded();
  const box = (await alvo.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
  await page.waitForTimeout(250 * RITMO);
}

export async function clicar(page: Page, alvo: Locator): Promise<void> {
  await apontar(page, alvo);
  await alvo.click();
}

export async function digitar(page: Page, alvo: Locator, texto: string): Promise<void> {
  await clicar(page, alvo);
  await alvo.fill('');
  await alvo.pressSequentially(texto, { delay: 35 * RITMO });
}
