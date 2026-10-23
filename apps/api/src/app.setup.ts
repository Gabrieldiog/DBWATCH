import type { NestExpressApplication } from '@nestjs/platform-express';
import { correlationId } from './common/correlation-id';

// Compartilhado entre main.ts e os testes, para testarmos a mesma configuração que roda
export function configureApp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(correlationId);
}
