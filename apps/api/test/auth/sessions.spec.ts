import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs, TEST_PASSWORD } from '../support/users';

describe('sessões ativas', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const del = (url: string, cookie: string) => http().delete(url).set('Origin', ORIGIN).set('Cookie', cookie);
  const another = async (email: string) =>
    (await http().post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: TEST_PASSWORD }).expect(204))
      .headers['set-cookie']![0]!.split(';')[0]!;

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('lista as minhas sessões, marca a atual e encerra a outra', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const laptop = await another(user.email);
    const list = await http().get('/api/auth/sessions').set('Cookie', user.cookie).expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|token_hash/);

    const other = list.body.find((s: { current: boolean }) => !s.current);
    await del(`/api/auth/sessions/${other.id}`, user.cookie).expect(204);
    await http().get('/api/auth/me').set('Cookie', laptop).expect(401);
    await http().get('/api/auth/me').set('Cookie', user.cookie).expect(200);
    expect((await http().get('/api/auth/sessions').set('Cookie', user.cookie)).body).toHaveLength(1);
  });

  it('sessão ociosa não aparece como ativa', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const idle = await another(user.email);
    await withClient('admin', (db) =>
      db.query("UPDATE iam.sessions SET last_seen_at = now() - interval '31 minutes' WHERE user_id = $1 AND created_at = (SELECT max(created_at) FROM iam.sessions WHERE user_id = $1)", [user.id]),
    );
    await http().get('/api/auth/me').set('Cookie', idle).expect(401);
    expect((await http().get('/api/auth/sessions').set('Cookie', user.cookie).expect(200)).body).toHaveLength(1);
  });

  it('ninguém encerra a sessão de outra pessoa: 404, e a sessão continua valendo', async () => {
    const [alice, bob] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER'])];
    const [bobSession] = (await http().get('/api/auth/sessions').set('Cookie', bob.cookie)).body;
    await del(`/api/auth/sessions/${bobSession.id}`, alice.cookie).expect(404);
    await http().get('/api/auth/me').set('Cookie', bob.cookie).expect(200);
    const [row] = await withClient('admin', async (db) =>
      (await db.query("SELECT outcome::text, reason FROM audit.audit_log WHERE actor_id = $1 AND action = 'auth.session_revoke'", [alice.id])).rows,
    );
    expect(row).toEqual({ outcome: 'FAILURE', reason: 'http:404' });
  });

  it('o admin vê e encerra todas as sessões de um usuário; quem não é admin recebe 403', async () => {
    const [admin, user] = [await loginAs(app, ['ADMIN']), await loginAs(app, ['REQUESTER'])];
    const second = await another(user.email);
    expect((await http().get(`/api/users/${user.id}/sessions`).set('Cookie', admin.cookie).expect(200)).body).toHaveLength(2);
    await del(`/api/users/${admin.id}/sessions`, user.cookie).expect(403);

    const res = await del(`/api/users/${user.id}/sessions`, admin.cookie).expect(200);
    expect(res.body).toEqual({ revokedSessions: 2 });
    for (const cookie of [user.cookie, second]) await http().get('/api/auth/me').set('Cookie', cookie).expect(401);
    const [row] = await withClient('admin', async (db) =>
      (await db.query("SELECT actor_id, metadata FROM audit.audit_log WHERE action = 'iam.sessions_revoke' AND resource_id = $1", [user.id])).rows,
    );
    expect(row).toEqual({ actor_id: admin.id, metadata: { sessoes_revogadas: 2 } });
  });
});
