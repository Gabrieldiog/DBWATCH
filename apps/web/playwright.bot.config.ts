import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// O bot da apresentação: um navegador visível que usa as telas de verdade, devagar, com um cursor desenhado.
// Local: pnpm --filter @dbwatch/web bot. Na VPS: DBWATCH_URL=http://IP:8088 E2E_USERS='<saída do db:seed:json>' pnpm --filter @dbwatch/web bot
const url = process.env.DBWATCH_URL;
export default defineConfig({
  ...base,
  testMatch: '**/*.bot.ts',
  outputDir: './bot-results',
  reporter: 'line',
  timeout: 10 * 60_000,
  webServer: url ? undefined : base.webServer,
  use: {
    ...base.use,
    baseURL: url ?? 'http://localhost:3000',
    headless: !!process.env.CI,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1366, height: 768 },
    video: 'on',
  },
});
