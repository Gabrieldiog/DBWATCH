import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MonitorService } from '../../src/monitor/monitor.service';
import { createApp } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function connect(n: number): Promise<Client[]> {
  const clients = Array.from({ length: n }, () => new Client(urlFor('admin')));
  await Promise.all(clients.map((c) => c.connect()));
  return clients;
}
const pidOf = async (c: Client) => (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
async function until(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 50 && !(await check()); i++) await pause(50);
}

describe('monitor por amostragem', () => {
  let app: NestExpressApplication;
  let monitor: MonitorService;
  let auditor: { cookie: string };
  const get = (url: string) => request(app.getHttpServer()).get(url).set('Cookie', auditor.cookie).expect(200);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    monitor = app.get(MonitorService);
    auditor = await loginAs(app, ['AUDITOR']);
  });
  afterAll(() => app.close());

  it('T-MON-01 lock wait real aparece com o par bloqueado/bloqueador correto', async () => {
    const { id } = await loginAs(app, ['REQUESTER']);
    const [a, b] = await connect(2);
    try {
      const [pa, pb] = [await pidOf(a!), await pidOf(b!)];
      await a!.query('BEGIN');
      await a!.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [id]);
      const waiting = b!.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [id]);
      await until(async () => (await sql("SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [pb])).length > 0);
      await monitor.sample();
      const locks = (await get('/api/monitor/locks')).body;
      expect(locks).toContainEqual(expect.objectContaining({ blockedPid: pb, blockingPid: pa, locktype: 'transactionid' }));
      expect((await get('/api/monitor/overview')).body.waitingOnLock).toBeGreaterThanOrEqual(1);
      await a!.query('COMMIT');
      await waiting;
    } finally {
      await Promise.all([a!.end(), b!.end()]);
    }
  });

  it('T-MON-02 deadlock real aparece como delta de deadlocks no intervalo', async () => {
    const [x, y] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER'])];
    await monitor.sample();
    const [a, b] = await connect(2);
    try {
      await a!.query('BEGIN');
      await b!.query('BEGIN');
      await a!.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [x.id]);
      await b!.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [y.id]);
      const first = sqlState(a!.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [y.id]));
      const second = sqlState(b!.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [x.id]));
      expect([await first, await second]).toContain('40P01');
      // As estatísticas do PostgreSQL são enviadas em lote; forçamos o envio para não depender do relógio
      for (const c of [a!, b!]) {
        await c.query('ROLLBACK');
        await c.query('SELECT pg_stat_force_next_flush()');
        await c.query('SELECT 1');
      }
    } finally {
      await Promise.all([a!.end(), b!.end()]);
    }
    await monitor.sample();
    const series = (await get('/api/monitor/series?minutes=5')).body as { deadlocks: string | null }[];
    expect(Number(series.at(-1)!.deadlocks)).toBeGreaterThanOrEqual(1);
  });

  it('T-MON-04 o texto da query nunca é gravado: só o comando', async () => {
    const [c] = await connect(1);
    try {
      const pid = await pidOf(c!);
      const running = c!.query("SELECT 'segredo-123' AS x, pg_sleep(1)");
      await until(async () => (await sql("SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND state = 'active'", [pid])).length > 0);
      await monitor.sample();
      await running;
      const leaks = await sql(`SELECT (SELECT count(*) FROM monitor.activity_samples t WHERE row_to_json(t)::text LIKE '%segredo-123%')
        + (SELECT count(*) FROM monitor.lock_samples t WHERE row_to_json(t)::text LIKE '%segredo-123%') AS n`);
      expect(Number(leaks[0].n)).toBe(0);
      const [row] = await sql('SELECT command FROM monitor.activity_samples WHERE pid = $1 ORDER BY sampled_at DESC LIMIT 1', [pid]);
      expect(row).toEqual({ command: 'SELECT' });
    } finally {
      await c!.end();
    }
  });

  it('T-MON-05 contadores zerados (pg_stat_reset) não viram taxa negativa', async () => {
    await monitor.sample();
    await sql('SELECT pg_stat_reset()');
    await monitor.sample();
    const series = (await get('/api/monitor/series?minutes=5')).body as Record<string, string | null>[];
    const values = series.flatMap((s) => [s.commits, s.rollbacks, s.deadlocks]).filter((v) => v !== null).map(Number);
    expect(values.every((v) => v >= 0)).toBe(true);
    expect(series.at(-1)!.commits).toBeNull();
  });

  it('retenção de 7 dias e acesso só com monitor:read', async () => {
    await sql("INSERT INTO monitor.db_samples VALUES (now() - interval '8 days', 'velho', 0, 0, 0, 0, 0, 0, 0, NULL)");
    await monitor.sample();
    expect(await sql("SELECT 1 FROM monitor.db_samples WHERE datname = 'velho'")).toHaveLength(0);
    const requester = await loginAs(app, ['REQUESTER']);
    await request(app.getHttpServer()).get('/api/monitor/overview').set('Cookie', requester.cookie).expect(403);
    expect((await get('/api/monitor/overview')).body.sampledAt).toBeTruthy();
    expect(await sqlState(withClient('dbwatch_monitor', (db) => db.query('SELECT 1 FROM iam.users LIMIT 1')))).toBe('42501');
  });
});
