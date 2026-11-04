import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupDocs } from './app.setup';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: new ConsoleLogger({ json: true }),
  });
  configureApp(app, env);
  setupDocs(app, env);
  app.enableShutdownHooks();
  // Produção sem HTTPS (ex.: http://IP:porta): o cookie de sessão viaja sem criptografia; fica avisado no log
  if (env.NODE_ENV === 'production' && !env.APP_ORIGIN.startsWith('https://'))
    new Logger('Sessao').warn(`APP_ORIGIN sem HTTPS (${env.APP_ORIGIN}): cookie de sessão sem Secure`);
  await app.listen(env.API_PORT, env.API_HOST);
}

void bootstrap();
