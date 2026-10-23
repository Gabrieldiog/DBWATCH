import swc from 'unplugin-swc';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// SWC gera os metadados de decorators que a injeção de dependência do Nest precisa
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
  },
});
