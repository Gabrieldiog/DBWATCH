import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type { Env } from '../config/env';

export const ENV = Symbol('ENV');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      application_name: 'dbwatch-api',
      connectionTimeoutMillis: 2_000,
      statement_timeout: 5_000,
      idle_in_transaction_session_timeout: 10_000,
    });
    // Sem este listener, um erro numa conexão ociosa derrubaria o processo
    this.pool.on('error', (err) => this.logger.error(`Conexão ociosa falhou: ${err.message}`));
  }

  async ping(): Promise<number> {
    const start = performance.now();
    await this.pool.query('SELECT 1');
    return Math.round(performance.now() - start);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
