import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Ensaio da apresentação: o roteiro inteiro no navegador, com vídeo (o backup do dia) e o tempo de cada bloco.
// Fica fora da suíte de testes porque leva uns 4 minutos e grava vídeo
export default defineConfig({
  ...base,
  testMatch: '**/*.ensaio.ts',
  outputDir: './ensaio-results',
  use: { ...base.use, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1280, height: 720 }, video: { mode: 'on', size: { width: 1280, height: 720 } } },
});
