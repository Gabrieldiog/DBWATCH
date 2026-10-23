import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    logger: new ConsoleLogger({ json: true }),
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, env.API_HOST);
}

void bootstrap();
