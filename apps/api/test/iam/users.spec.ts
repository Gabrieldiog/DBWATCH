import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs, TEST_PASSWORD } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);

describe('administração de usuários', () => {
  let app: NestExpressApplication;
  let admin: { id: string; cookie: string };
  const as = (cookie: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie),
    send: (method: 'post' | 'patch' | 'delete', url: string, body?: object) =>
      request(app.getHttpServer())[method](url).set('Origin', ORIGIN).set('Cookie', cookie).send(body),
  });
  const login = (email: string, password = TEST_PASSWORD) =>
    request(app.getHttpServer()).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    admin = await loginAs(app, ['ADMIN']);
  });
  afterAll(() => app.close());

  it('T-IAM-01 cria usuário com senha forte, recusa e-mail repetido e senha fraca', async () => {
    const email = `novo-${randomUUID()}@dbwatch.test`;
    const body = { email: email.toUpperCase(), displayName: 'Nova Pessoa', password: 'uma-senha-longa' };
    const res = await as(admin.cookie).send('post', '/api/users', body).expect(201);
    expect(res.body).toMatchObject({ email, status: 'ACTIVE' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);
    await login(email, 'uma-senha-longa').expect(204);
    await as(admin.cookie).send('post', '/api/users', body).expect(409);
    await as(admin.cookie).send('post', '/api/users', { ...body, email: `b-${email}`, password: 'curta-11ch' }).expect(400);
    await as(admin.cookie).send('post', '/api/users', { ...body, email: `c-${email}`, password: `c-${email}` }).expect(400);
    const requester = await loginAs(app, ['REQUESTER']);
    await as(requester.cookie).send('post', '/api/users', { ...body, email: `d-${email}` }).expect(403);
  });

  it('T-IAM-02 desativar revoga as 3 sessões na mesma transação e registra o antes/depois', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const cookies = [user.cookie];
    for (let i = 0; i < 2; i++) cookies.push((await login(user.email).expect(204)).headers['set-cookie']![0]!.split(';')[0]!);
    const res = await as(admin.cookie).send('patch', `/api/users/${user.id}/status`, { status: 'DISABLED' }).expect(200);
    expect(res.body).toEqual({ id: user.id, status: 'DISABLED', revokedSessions: 3 });
    for (const cookie of cookies) await as(cookie).get('/api/auth/me').expect(401);
    await login(user.email).expect(401);
    const [row] = await sql("SELECT actor_id, metadata FROM audit.audit_log WHERE action = 'iam.user_status' AND resource_id = $1", [user.id]);
    expect(row).toEqual({
      actor_id: admin.id,
      metadata: { status_antes: 'ACTIVE', status_depois: 'DISABLED', sessoes_revogadas: 3 },
    });
    await as(admin.cookie).send('patch', `/api/users/${user.id}/status`, { status: 'ACTIVE' }).expect(200);
    await login(user.email).expect(204);
  });

  it('T-IAM-05 atribuir papel registra quem deu, a quem e qual; e as regras de papel valem', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    await as(admin.cookie).send('post', `/api/users/${user.id}/roles`, { role: 'APPROVER' }).expect(204);
    expect((await as(user.cookie).get('/api/auth/me').expect(200)).body.roles).toEqual(['APPROVER', 'REQUESTER']);
    const [row] = await sql("SELECT actor_id, outcome::text, metadata FROM audit.audit_log WHERE action = 'iam.role_assign' AND resource_id = $1", [user.id]);
    expect(row).toEqual({ actor_id: admin.id, outcome: 'SUCCESS', metadata: { papel: 'APPROVER' } });

    await as(admin.cookie).send('post', `/api/users/${user.id}/roles`, { role: 'APPROVER' }).expect(409);
    await as(admin.cookie).send('post', `/api/users/${admin.id}/roles`, { role: 'AUDITOR' }).expect(403);
    await as(admin.cookie).send('post', `/api/users/${user.id}/roles`, { role: 'ROOT' }).expect(400);
    await as(admin.cookie).send('post', '/api/users/nao-e-uuid/roles', { role: 'APPROVER' }).expect(400);
    await as(admin.cookie).send('post', `/api/users/${randomUUID()}/roles`, { role: 'APPROVER' }).expect(404);
    await as(admin.cookie).send('delete', `/api/users/${user.id}/roles/APPROVER`).expect(204);
    await as(admin.cookie).send('delete', `/api/users/${user.id}/roles/APPROVER`).expect(404);
    const list = await as(admin.cookie).get('/api/users').expect(200);
    expect(list.body.find((u: { id: string }) => u.id === user.id)).toMatchObject({ roles: ['REQUESTER'] });
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|argon2/);
  });

  describe('último ADMIN ativo', () => {
    let a: { id: string; cookie: string };
    let b: { id: string; cookie: string };
    const activeAdmins = async () =>
      (await sql("SELECT count(*)::int AS n FROM iam.users u JOIN iam.user_roles ur ON ur.user_id = u.id WHERE ur.role_id = 1 AND u.status = 'ACTIVE'"))[0].n;

    beforeAll(async () => {
      [a, b] = [await loginAs(app, ['ADMIN']), await loginAs(app, ['ADMIN'])];
      // Deixa A e B como os únicos administradores ativos do banco de testes
      await sql(
        `UPDATE iam.users SET status = 'DISABLED' WHERE status = 'ACTIVE' AND id <> ALL($1::uuid[])
            AND id IN (SELECT user_id FROM iam.user_roles WHERE role_id = 1)`,
        [[a.id, b.id]],
      );
    });

    it('T-IAM-03 o último ADMIN não perde o papel nem é desativado (422), e a tentativa fica auditada', async () => {
      await as(a.cookie).send('patch', `/api/users/${b.id}/status`, { status: 'DISABLED' }).expect(200);
      await as(a.cookie).send('delete', `/api/users/${a.id}/roles/ADMIN`).expect(422);
      await as(a.cookie).send('patch', `/api/users/${a.id}/status`, { status: 'DISABLED' }).expect(422);
      expect(await activeAdmins()).toBe(1);
      const failures = await sql("SELECT reason FROM audit.audit_log WHERE actor_id = $1 AND outcome = 'FAILURE'", [a.id]);
      expect(failures.map((f) => f.reason)).toEqual(['sqlstate:DW001', 'sqlstate:DW001']);
      await sql("UPDATE iam.users SET status = 'ACTIVE' WHERE id = $1", [b.id]);
    });

    it('T-IAM-04 dois admins removendo o papel um do outro ao mesmo tempo: um continua', async () => {
      const [c1, c2] = [new Client(urlFor('dbwatch_app')), new Client(urlFor('dbwatch_app'))];
      await Promise.all([c1.connect(), c2.connect()]);
      try {
        await c1.query('BEGIN');
        await c2.query('BEGIN');
        await c1.query('DELETE FROM iam.user_roles WHERE user_id = $1 AND role_id = 1', [b.id]);
        const second = sqlState(c2.query('DELETE FROM iam.user_roles WHERE user_id = $1 AND role_id = 1', [a.id]));
        // Espera a segunda transação ficar parada no advisory lock antes de confirmar a primeira
        for (let i = 0; i < 100; i++) {
          if ((await sql("SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted")).length) break;
          await new Promise((r) => setTimeout(r, 20));
        }
        await c1.query('COMMIT');
        expect(await second).toBe('DW001');
        await c2.query('ROLLBACK');
        expect(await activeAdmins()).toBe(1);
      } finally {
        await Promise.all([c1.end(), c2.end()]);
        await sql('INSERT INTO iam.user_roles (user_id, role_id) VALUES ($1, 1) ON CONFLICT DO NOTHING', [b.id]);
      }
    });
  });
});
