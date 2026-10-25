import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs, TEST_PASSWORD } from '../support/users';

const rule = (values: string, params: unknown[]) =>
  withClient('admin', (db) => db.query(`INSERT INTO iam.login_acl (priority, action, ip_range, user_id, weekdays, start_time, end_time, description) VALUES ${values}`, params));
const decide = async (user: string, ip: string, at: string) =>
  withClient('dbwatch_app', async (db) =>
    (await db.query<{ action: string }>('SELECT action::text FROM iam.login_acl_decision($1, $2, $3)', [user, ip, at])).rows[0]?.action ?? 'SEM_REGRA');

describe('ACL de login por IP e horário', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('a regra de menor prioridade que casa decide; faixa, dia da semana e janela de horário em Brasília', async () => {
    const { id } = await loginAs(app, ['REQUESTER']);
    await rule(
      `(10, 'ALLOW', '10.1.0.0/16', $1, NULL, NULL, NULL, 'laboratório liberado'),
       (20, 'DENY', '10.0.0.0/8', $1, NULL, NULL, NULL, 'resto da rede interna'),
       (30, 'DENY', NULL, $1, '{6,7}', NULL, NULL, 'fim de semana'),
       (40, 'DENY', NULL, $1, NULL, '00:00', '06:00', 'madrugada')`,
      [id],
    );
    const weekday = '2026-10-26T15:00:00-03:00'; // segunda, 15h
    expect(await decide(id, '10.1.2.3', weekday)).toBe('ALLOW');
    expect(await decide(id, '10.2.0.1', weekday)).toBe('DENY');
    expect(await decide(id, '192.168.0.10', weekday)).toBe('SEM_REGRA');
    expect(await decide(id, '192.168.0.10', '2026-10-31T15:00:00-03:00')).toBe('DENY'); // sábado
    // 05:30 em Brasília é 08:30 em UTC: o fuso é aplicado no banco
    expect(await decide(id, '192.168.0.10', '2026-10-27T08:30:00Z')).toBe('DENY');
    expect(await decide(id, '192.168.0.10', '2026-10-27T09:30:00Z')).toBe('SEM_REGRA');
  });

  it('o banco recusa faixa com bits de host, janela invertida e regra que nega todos sempre', async () => {
    const insert = (values: string) => sqlState(rule(values, []));
    expect(await insert(`(1, 'DENY', '10.0.0.1/8', NULL, NULL, NULL, NULL, 'x')`)).toBe('23514');
    expect(await insert(`(1, 'DENY', '10.0.0.0/8', NULL, NULL, '18:00', '08:00', 'x')`)).toBe('23514');
    expect(await insert(`(1, 'DENY', NULL, NULL, NULL, NULL, NULL, 'x')`)).toBe('23514');
    expect(await insert(`(1, 'DENY', NULL, NULL, '{8}', NULL, NULL, 'x')`)).toBe('23514');
  });

  it('login de IP negado: 403 só com a senha certa, auditado com a regra', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    await rule(`(5, 'DENY', '203.0.113.0/24', $1, NULL, NULL, NULL, 'rede de teste')`, [user.id]);
    const login = (ip: string, password = TEST_PASSWORD) =>
      request(app.getHttpServer()).post('/api/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email: user.email, password });
    await login('203.0.113.9', 'errada').expect(401);
    const res = await login('203.0.113.9').expect(403);
    expect(res.body.message).toBe('Login não permitido deste local ou horário');
    expect(res.headers['set-cookie']).toBeUndefined();
    await login('198.51.100.7').expect(204);
    const [row] = await withClient('admin', async (db) =>
      (await db.query("SELECT reason, metadata FROM audit.audit_log WHERE actor_id = $1 AND reason = 'acl_negado'", [user.id])).rows,
    );
    expect(row.metadata.regra).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('admin cria, lista e remove regras pela API; a auditoria guarda o antes e o depois', async () => {
    const [admin, target] = [await loginAs(app, ['ADMIN']), await loginAs(app, ['REQUESTER'])];
    const post = (cookie: string, body: object) =>
      request(app.getHttpServer()).post('/api/login-acl').set('Origin', ORIGIN).set('Cookie', cookie).send(body);
    const body = { priority: 900, action: 'DENY', ipRange: '198.18.0.0/15', userId: target.id, weekdays: [1, 2], startTime: '22:00', endTime: '23:30', description: 'noite' };

    const { id } = (await post(admin.cookie, body).expect(201)).body;
    await post(target.cookie, body).expect(403);
    expect((await post(admin.cookie, { ...body, ipRange: '198.18.0.1/15' }).expect(400)).body.message).toMatch(/bits de host/);
    expect((await post(admin.cookie, { ...body, ipRange: undefined, userId: undefined, weekdays: undefined, startTime: undefined, endTime: undefined }).expect(400)).body.message).toMatch(/negar o login de todos/);
    await post(admin.cookie, { ...body, ipRange: "x'; DROP TABLE iam.users; --" }).expect(400);

    const list = await request(app.getHttpServer()).get('/api/login-acl').set('Cookie', admin.cookie).expect(200);
    expect(list.body.find((r: { id: string }) => r.id === id)).toMatchObject({ ipRange: '198.18.0.0/15', weekdays: [1, 2], startTime: '22:00' });
    await request(app.getHttpServer()).delete(`/api/login-acl/${id}`).set('Origin', ORIGIN).set('Cookie', admin.cookie).expect(204);
    await request(app.getHttpServer()).delete(`/api/login-acl/${id}`).set('Origin', ORIGIN).set('Cookie', admin.cookie).expect(404);
    const trail = await withClient('admin', async (db) =>
      (await db.query("SELECT action, metadata FROM audit.audit_log WHERE resource_id = $1 AND outcome = 'SUCCESS' ORDER BY chain_position", [id])).rows,
    );
    expect(trail.map((t) => t.action)).toEqual(['iam.acl_create', 'iam.acl_delete']);
    expect(trail[1].metadata).toEqual({ prioridade: 900, acao: 'DENY', faixa_ip: '198.18.0.0/15', usuario: target.id, dias: '1,2', horario: '22:00-23:30' });
  });
});
