import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// Migrations rodam com o dono dos objetos; a API nunca usa esta credencial
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('MIGRATOR_DATABASE_URL') },
});
