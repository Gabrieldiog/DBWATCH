import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { currentContext } from '../common/correlation-id';
import type { Env } from '../config/env';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

export const ENV = Symbol('ENV');
export type Tx = Prisma.TransactionClient;

// Diz ao banco quem está agindo, para a RLS; o true limita os valores a esta transação (o pool reaproveita conexões)
export async function setActor(tx: Tx): Promise<void> {
  const ctx = currentContext();
  const canReview = ctx?.permissions?.includes('request:review') ? 'on' : 'off';
  await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx?.userId ?? ''}, true), set_config('app.can_review', ${canReview}, true)`;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(ENV) env: Env) {
    // Pool próprio para controlar timeouts: nenhuma transação segura locks por tempo indefinido
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      application_name: 'dbwatch-api',
      connectionTimeoutMillis: 2_000,
      statement_timeout: 5_000,
      idle_in_transaction_session_timeout: 10_000,
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
    const logger = new Logger(PrismaService.name);
    // Sem este listener, um erro numa conexão ociosa derrubaria o processo
    pool.on('error', (err) => logger.error(`Conexão ociosa falhou: ${err.message}`));
  }

  // Leituras de tabelas com RLS precisam de uma transação com o usuário declarado
  asActor<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await setActor(tx);
      return fn(tx);
    });
  }

  async ping(): Promise<number> {
    const start = performance.now();
    await this.$queryRaw`SELECT 1`;
    return Math.round(performance.now() - start);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
