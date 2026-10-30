import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Client, Pool } from 'pg';
import { Subject } from 'rxjs';
import type { Env } from '../config/env';
import { ENV } from '../database/prisma.service';
import {
  ALERT_DEADLOCK, ALERT_IDLE_IN_TX, ALERT_LOCK_WAIT, RECENT_EVENTS, RETENTION, SAMPLE_ACTIVITY, SAMPLE_DATABASES, SAMPLE_LOCKS, SERIES,
} from './monitor.queries';

const RETENTION_DAYS = 7;

export interface MonitorEvent {
  id: number;
  kind: string;
  code: string;
  severity: string;
  [key: string]: unknown;
}

@Injectable()
export class MonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitorService.name);
  private readonly pool?: Pool;
  private readonly database: string;
  private timer?: NodeJS.Timeout;
  private listener?: Client;
  // Eventos novos chegam pelo LISTEN e são repassados a todas as conexões SSE abertas
  readonly events$ = new Subject<MonitorEvent>();

  constructor(@Inject(ENV) private readonly env: Env) {
    this.database = new URL(env.DATABASE_URL).pathname.slice(1);
    if (!env.MONITOR_DATABASE_URL) return;
    this.pool = new Pool({ connectionString: env.MONITOR_DATABASE_URL, max: 3, application_name: 'dbwatch-monitor', statement_timeout: 5_000 });
    this.pool.on('error', (err) => this.logger.error(`Conexão do monitor falhou: ${err.message}`));
  }

  // Uma amostra = uma transação: as três tabelas recebem o mesmo now(), e a retenção vai junto
  async sample(): Promise<void> {
    const client = await this.db().connect();
    try {
      await client.query('BEGIN');
      for (const sql of [SAMPLE_DATABASES, SAMPLE_ACTIVITY, SAMPLE_LOCKS, ALERT_DEADLOCK]) await client.query(sql);
      await client.query(ALERT_LOCK_WAIT, [this.env.MONITOR_LOCK_ALERT_MS]);
      await client.query(ALERT_IDLE_IN_TX, [this.env.MONITOR_IDLE_ALERT_MS]);
      for (const sql of RETENTION) await client.query(sql, [RETENTION_DAYS]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async overview() {
    const { rows } = await this.db().query(`
      WITH last AS (SELECT max(sampled_at) AS t FROM monitor.activity_samples)
      SELECT (SELECT t FROM last) AS "sampledAt",
             count(*) FILTER (WHERE state = 'active')::int AS active,
             count(*) FILTER (WHERE state = 'idle')::int AS idle,
             count(*) FILTER (WHERE state LIKE 'idle in transaction%')::int AS "idleInTransaction",
             count(*) FILTER (WHERE wait_event_type = 'Lock')::int AS "waitingOnLock",
             (SELECT count(*)::int FROM monitor.lock_samples WHERE sampled_at = (SELECT t FROM last)) AS "blockedPairs"
        FROM monitor.activity_samples WHERE sampled_at = (SELECT t FROM last)`);
    return rows[0];
  }

  async locks() {
    const { rows } = await this.db().query(`
      SELECT blocked_pid AS "blockedPid", blocking_pid AS "blockingPid", datname AS database, locktype, mode, relation,
             wait_ms AS "waitMs", blocked_app AS "blockedApp", blocking_app AS "blockingApp"
        FROM monitor.lock_samples WHERE sampled_at = (SELECT max(sampled_at) FROM monitor.lock_samples)
       ORDER BY wait_ms DESC`);
    return rows;
  }

  async series(minutes: number) {
    return (await this.db().query(SERIES, [this.database, minutes])).rows;
  }

  async recentEvents(limit: number) {
    return (await this.db().query(RECENT_EVENTS, [limit])).rows;
  }

  private db(): Pool {
    if (!this.pool) throw new ServiceUnavailableException('Monitor não configurado (MONITOR_DATABASE_URL)');
    return this.pool;
  }

  async onModuleInit(): Promise<void> {
    if (!this.env.MONITOR_DATABASE_URL) return;
    this.listener = new Client({ connectionString: this.env.MONITOR_DATABASE_URL, application_name: 'dbwatch-listen' });
    this.listener.on('notification', (msg) => msg.payload && this.events$.next(JSON.parse(msg.payload) as MonitorEvent));
    this.listener.on('error', (err) => this.logger.error(`LISTEN caiu: ${err.message}`));
    await this.listener.connect();
    await this.listener.query('LISTEN dbwatch_events');
    if (this.env.MONITOR_SAMPLE_SECONDS === 0) return;
    this.timer = setInterval(() => {
      this.sample().catch((err: unknown) => this.logger.error(`Falha na amostra: ${err instanceof Error ? err.message : 'erro'}`));
    }, this.env.MONITOR_SAMPLE_SECONDS * 1000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    this.events$.complete();
    await this.listener?.end();
    await this.pool?.end();
  }
}
