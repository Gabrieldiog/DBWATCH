import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp, setupDocs } from '../../src/app.setup';
import { type Env, loadEnv } from '../../src/config/env';
import { urlFor } from './db';

export const ORIGIN = 'http://localhost:3000';

// Monta o app com a mesma configuração do main.ts; extras só para cenários de teste
export async function createApp(
  url: string,
  overrides: Record<string, string> = {},
  controllers: Type[] = [],
): Promise<NestExpressApplication> {
  const env: Env = loadEnv({ DATABASE_URL: url, APP_ORIGIN: ORIGIN, GRANT_SWEEP_SECONDS: '0', TARGET_DATABASE_URL: urlFor('dbwatch_target_ro', 'dbwatch_target'), ...overrides });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)], controllers }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, env);
  setupDocs(app, env);
  await app.init();
  return app;
}
