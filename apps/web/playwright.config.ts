import { defineConfig, devices } from '@playwright/test';

// T-E2E e T-A11Y: navegador de verdade contra a API e o PostgreSQL de verdade (rode pnpm build antes)
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000', viewport: { width: 1280, height: 720 } },
  // Reaproveita API e web que já estiverem no ar; no CI, sobe as duas a partir do build
  webServer: [
    { command: 'pnpm --filter @dbwatch/api start', url: 'http://127.0.0.1:4000/api/health', reuseExistingServer: true },
    { command: 'pnpm start', url: 'http://localhost:3000', reuseExistingServer: true },
  ],
});
