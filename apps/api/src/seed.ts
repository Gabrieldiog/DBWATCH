import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuditedTransaction } from './audit/audited-transaction';
import { seedDemoUsers } from './auth/demo-users';
import { loadEnv } from './config/env';

// Uso: pnpm db:seed. As senhas aparecem só neste terminal; nada é gravado em arquivo
async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production' && !process.argv.includes('--permitir-producao')) {
    throw new Error('Seed de demonstração bloqueado em produção (use --permitir-producao de propósito)');
  }
  const ctx = await NestFactory.createApplicationContext(AppModule.forRoot(env), { logger: ['error'] });
  try {
    const users = await seedDemoUsers(ctx.get(AuditedTransaction));
    console.table(users.map((u) => ({ email: u.email, papel: u.role, senha: u.password, novo: u.created ? 'sim' : 'não' })));
    console.log('Senhas novas geradas; sessões antigas desses usuários foram revogadas.');
  } finally {
    await ctx.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
