import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { Env } from '../config/env';
import { PrismaClient, type Prisma } from '../generated/prisma/client';

export const ENV = Symbol('ENV');
export type Tx = Prisma.TransactionClient;

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
