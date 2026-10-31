import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LabStep } from '../../src/lab/lab-recorder';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

type Run = { id: number; outcome: string; steps: LabStep[] };

describe('LAB: laboratório de concorrência com duas sessões reais', () => {
  let app: NestExpressApplication;
  let admin: { id: string; cookie: string };
  const run = (scenario: string, cookie = admin.cookie) =>
    request(app.getHttpServer()).post(`/api/lab/${scenario}/run`).set('Origin', ORIGIN).set('Cookie', cookie);
  const balances = async () =>
    (await withClient('admin', (db) => db.query('SELECT balance::float AS b FROM lab.accounts ORDER BY id'))).rows.map((r) => r.b);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    admin = await loginAs(app, ['ADMIN']);
  });
  afterAll(() => app.close());

  it('T-LAB-01 transferência que viola a CHECK: 23514 e saldos iguais aos de antes', async () => {
    const body = (await run('transferencia-falha').expect(200)).body as Run;
    expect(body.outcome).toBe('OK');
    expect(body.steps.find((s) => s.sqlstate)?.sqlstate).toBe('23514');
    expect(await balances()).toEqual([100, 50]);
    const [saved] = (await withClient('admin', (db) => db.query('SELECT scenario, outcome, started_by FROM lab.runs WHERE id = $1', [body.id]))).rows;
    expect(saved).toEqual({ scenario: 'transferencia-falha', outcome: 'OK', started_by: admin.id });
  });

  it('T-LAB-02 espera de lock: B espera A confirmar e nenhuma atualização se perde', async () => {
    const body = (await run('espera-de-lock').expect(200)).body as Run;
    expect(body.outcome).toBe('OK');
    expect(body.steps.some((s) => s.note === 'B está esperando um lock')).toBe(true);
    const waited = body.steps.find((s) => s.session === 'B' && s.sql?.startsWith('UPDATE'));
    expect(waited!.ms).toBeGreaterThanOrEqual(1_500);
    expect(await balances()).toEqual([70, 50]);
  });

  it('T-LAB-03 deadlock: exatamente uma sessão recebe 40P01 e a outra confirma', async () => {
    const body = (await run('deadlock').expect(200)).body as Run;
    expect(body.outcome).toBe('OK');
    expect(body.steps.filter((s) => s.sqlstate === '40P01')).toHaveLength(1);
    expect(body.steps.filter((s) => s.sql === 'COMMIT')).toHaveLength(1);
  });

  it('T-LAB-04 leitura não repetível: o valor muda em READ COMMITTED e não muda em REPEATABLE READ', async () => {
    const body = (await run('leitura-nao-repetivel').expect(200)).body as Run;
    expect(body.outcome).toBe('OK');
    expect(body.steps.filter((s) => s.sql?.startsWith('BEGIN ISOLATION LEVEL')).map((s) => s.sql)).toEqual([
      'BEGIN ISOLATION LEVEL READ COMMITTED',
      'BEGIN ISOLATION LEVEL REPEATABLE READ',
    ]);
    const reads = body.steps.filter((s) => s.sql?.startsWith('SELECT balance')).map((s) => s.rows?.[0]?.saldo);
    expect(reads).toEqual([100, 70, 100, 100]);
  });

  it('T-LAB-05 write skew: a regra quebra em READ COMMITTED; em SERIALIZABLE uma sessão recebe 40001', async () => {
    const body = (await run('write-skew').expect(200)).body as Run;
    expect(body.outcome).toBe('OK');
    expect(body.steps.some((s) => s.note === 'Ficaram 0 de plantão: a regra quebrou sem nenhum erro')).toBe(true);
    expect(body.steps.filter((s) => s.sqlstate === '40001')).toHaveLength(1);
    const left = await withClient('admin', (db) => db.query('SELECT count(*)::int AS n FROM lab.on_call WHERE on_duty'));
    expect(left.rows[0].n).toBe(1);
  });

  it('T-LAB-06 isolamento: papel do lab sem acesso ao produto, timeouts no papel e um experimento por vez', async () => {
    await withClient('dbwatch_lab', async (db) => {
      for (const table of ['iam.users', 'audit.audit_log', 'monitor.app_events', 'pam.access_requests']) {
        expect(await sqlState(db.query(`SELECT 1 FROM ${table} LIMIT 1`))).toBe('42501');
      }
      const show = async (name: string) => (await db.query(`SHOW ${name}`)).rows[0][name];
      expect([await show('lock_timeout'), await show('statement_timeout'), await show('idle_in_transaction_session_timeout')]).toEqual(['5s', '15s', '20s']);
    });
    const [first, second] = await Promise.all([run('espera-de-lock'), new Promise((r) => setTimeout(r, 300)).then(() => run('deadlock'))]);
    expect([first.status, second.status]).toEqual([200, 409]);

    const requester = await loginAs(app, ['REQUESTER']);
    await run('deadlock', requester.cookie).expect(403);
    await run('nao-existe').expect(404);
    const off = await createApp(urlFor('dbwatch_app'), { LAB_ENABLED: 'false' });
    try {
      const offAdmin = await loginAs(off, ['ADMIN']);
      await request(off.getHttpServer()).get('/api/lab/scenarios').set('Cookie', offAdmin.cookie).expect(404);
    } finally {
      await off.close();
    }
  });
});
