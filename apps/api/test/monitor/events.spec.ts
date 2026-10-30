import 'reflect-metadata';
import { get as httpGet } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MonitorService } from '../../src/monitor/monitor.service';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
// since: só eventos gerados depois deste id (o banco de testes guarda eventos antigos, e PIDs se repetem)
const events = async (code: string, key: string, value: string | number, since = 0) =>
  (await sql('SELECT detail FROM monitor.app_events WHERE code = $1 AND detail ->> $2 = $3 AND id > $4', [code, key, String(value), since])).map((r) => r.detail);
const lastId = async () => Number((await sql('SELECT coalesce(max(id), 0) AS last FROM monitor.app_events'))[0].last);

describe('eventos, alertas e fluxo ao vivo do monitor', () => {
  let app: NestExpressApplication;
  let monitor: MonitorService;

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000', MONITOR_LOCK_ALERT_MS: '300', MONITOR_IDLE_ALERT_MS: '300' });
    monitor = app.get(MonitorService);
  });
  afterAll(() => app.close());

  it('T-MON-03 rollback na API vira evento com a operação, o SQLSTATE e o correlation_id', async () => {
    const admin = await loginAs(app, ['ADMIN']);
    const body = { email: `dup-${Date.now()}@dbwatch.test`, displayName: 'Duplicado', password: 'uma-senha-longa' };
    const create = () => request(app.getHttpServer()).post('/api/users').set('Origin', ORIGIN).set('Cookie', admin.cookie).send(body);
    await create().expect(201);
    const res = await create().expect(409);
    const [event] = await sql('SELECT kind, operation, sqlstate FROM monitor.app_events WHERE correlation_id = $1', [res.body.correlationId]);
    expect(event).toEqual({ kind: 'TX_ROLLBACK', operation: 'iam.user_create', sqlstate: '23505' });
  });

  it('alertas de lock longo e de transação parada, sem repetir na amostra seguinte', async () => {
    const { id } = await loginAs(app, ['REQUESTER']);
    const since = await lastId();
    const [a, b] = [new Client(urlFor('admin')), new Client(urlFor('admin'))];
    await Promise.all([a.connect(), b.connect()]);
    try {
      const pb = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      const pa = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
      await a.query('BEGIN');
      await a.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [id]);
      const waiting = b.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [id]);
      await pause(500);
      await monitor.sample();
      await monitor.sample();
      expect(await events('LOCK_WAIT', 'bloqueado', pb, since)).toEqual([expect.objectContaining({ bloqueador: pa })]);
      // A sessão A segura a transação aberta sem fazer nada: "idle in transaction"
      expect(await events('IDLE_IN_TRANSACTION', 'pid', pa, since)).toHaveLength(1);
      await a.query('COMMIT');
      await waiting;
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('deadlock novo vira alerta high', async () => {
    const [x, y] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER'])];
    await monitor.sample();
    const last = await lastId();
    const [a, b] = [new Client(urlFor('admin')), new Client(urlFor('admin'))];
    await Promise.all([a.connect(), b.connect()]);
    try {
      for (const [c, first] of [[a, x.id], [b, y.id]] as const) {
        await c.query('BEGIN');
        await c.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [first]);
      }
      const results = await Promise.all([
        sqlState(a.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [y.id])),
        sqlState(b.query('UPDATE iam.users SET updated_at = now() WHERE id = $1', [x.id])),
      ]);
      expect(results).toContain('40P01');
      for (const c of [a, b]) await c.query('ROLLBACK; SELECT pg_stat_force_next_flush(); SELECT 1');
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
    await monitor.sample();
    // Só vale alerta gerado neste teste: o banco de testes guarda alertas de execuções anteriores
    const [alert] = await sql("SELECT severity, detail FROM monitor.app_events WHERE code = 'DEADLOCK' AND id > $1", [last]);
    expect(alert.severity).toBe('high');
    expect(alert.detail.novos).toBeGreaterThanOrEqual(1);
  });

  it('break-glass gera alerta high na mesma transação do acesso', async () => {
    const admin = await loginAs(app, ['ADMIN']);
    const [{ id: resourceId }] = await sql("SELECT id FROM pam.resources WHERE name = 'Catálogo de produtos'");
    await request(app.getHttpServer()).post('/api/break-glass').set('Origin', ORIGIN).set('Cookie', admin.cookie)
      .send({ resourceId, minutes: 5, justification: 'Incidente: catálogo com preços zerados, conferir agora mesmo' }).expect(201);
    expect(await events('BREAK_GLASS', 'usuario', admin.id)).toEqual([{ usuario: admin.id, recurso: resourceId, minutos: 5 }]);
  });

  it('SSE: o evento chega ao vivo pela rede (LISTEN/NOTIFY); sem monitor:read é 403', async () => {
    const [auditor, requester] = [await loginAs(app, ['AUDITOR']), await loginAs(app, ['REQUESTER'])];
    await request(app.getHttpServer()).get('/api/monitor/stream').set('Cookie', requester.cookie).expect(403);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const marker = `teste-${Date.now()}`;
    const received = await new Promise<string>((resolve, reject) => {
      const req = httpGet({ host: '127.0.0.1', port, path: '/api/monitor/stream', headers: { Cookie: auditor.cookie } }, (res) => {
        let buffer = '';
        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          if (buffer.includes(marker)) {
            req.destroy();
            resolve(buffer);
          }
        });
      });
      req.on('error', (err) => (err.message.includes('aborted') ? undefined : reject(err)));
      setTimeout(() => sql("INSERT INTO monitor.app_events (kind, code, severity, detail) VALUES ('ALERT', 'LOCK_WAIT', 'medium', jsonb_build_object('marca', $1::text))", [marker]), 300);
      setTimeout(() => reject(new Error('o evento não chegou pelo SSE')), 5_000);
    });
    expect(received).toMatch(/event: ALERT/);
    expect(received).toContain('"code":"LOCK_WAIT"');
  });
});
