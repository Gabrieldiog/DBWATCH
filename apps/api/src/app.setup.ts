import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { sessionCookieName } from './auth/credentials';
import { correlationId } from './common/correlation-id';
import { originCheck, securityHeaders } from './common/security';
import type { Env } from './config/env';

// Compartilhado entre main.ts e os testes, para testarmos a mesma configuração que roda
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.setGlobalPrefix('api');
  app.use(correlationId);
  app.use(securityHeaders);
  app.use(originCheck(env.APP_ORIGIN));
}

export function setupDocs(app: NestExpressApplication, env: Env): void {
  if (env.API_DOCS === 'off') return;
  const config = new DocumentBuilder()
    .setTitle('DBWATCH API')
    .setDescription('Acessos privilegiados e PostgreSQL sob vigilância. Faça login e o cookie de sessão vale para as demais rotas.')
    .setVersion('0.4.0')
    .addCookieAuth(sessionCookieName(env.NODE_ENV === 'production'))
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
