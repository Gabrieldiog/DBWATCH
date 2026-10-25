import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, withClient, urlFor } from '../support/db';
import { loginAs } from '../support/users';

const JUSTIFICATIVA = 'Investigar divergência no relatório de vendas de outubro';
const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
const newResource = async (max = 60, active = true) =>
  (await sql("INSERT INTO pam.resources (name, database_name, sensitivity, max_grant_minutes, active) VALUES ($1, 'dbwatch_target', 'MEDIUM', $2, $3) RETURNING id", [`rec-${randomUUID()}`, max, active]))[0].id as string;

describe('pedidos de acesso', () => {
  let app: NestExpressApplication;
  const ask = (cookie: string, body: object) =>
    request(app.getHttpServer()).post('/api/requests').set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const get = (cookie: string, url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('T-PAM-01 pedido válido: 201 PENDING, auditado, em "meus pedidos" e na fila de outro aprovador', async () => {
    const [requester, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const resourceId = await newResource();
    expect((await get(requester.cookie, '/api/resources').expect(200)).body.map((r: { id: string }) => r.id)).toContain(resourceId);
    const res = await ask(requester.cookie, { resourceId, accessLevel: 'READ', requestedMinutes: 30, justification: JUSTIFICATIVA }).expect(201);
    expect(res.body).toMatchObject({ status: 'PENDING', requestedMinutes: 30, resource: { id: resourceId } });
    expect((await get(requester.cookie, '/api/requests/mine')).body[0].id).toBe(res.body.id);
    const queue = (await get(approver.cookie, '/api/requests/queue').expect(200)).body;
    expect(queue.find((q: { id: string }) => q.id === res.body.id).requester.id).toBe(requester.id);
    await get(requester.cookie, '/api/requests/queue').expect(403);
    const [row] = await sql("SELECT actor_id, outcome::text FROM audit.audit_log WHERE action = 'pam.request_create' AND resource_id = $1", [res.body.id]);
    expect(row).toEqual({ actor_id: requester.id, outcome: 'SUCCESS' });
  });

  it('T-PAM-02 justificativa curta, duração acima do máximo do recurso e recurso inativo são recusados', async () => {
    const { cookie } = await loginAs(app, ['REQUESTER']);
    const body = { resourceId: await newResource(30), accessLevel: 'READ', requestedMinutes: 30, justification: JUSTIFICATIVA };
    await ask(cookie, { ...body, justification: 'curta demais' }).expect(400);
    expect((await ask(cookie, { ...body, requestedMinutes: 45 }).expect(422)).body.message).toMatch(/máximo/);
    await ask(cookie, { ...body, resourceId: await newResource(60, false) }).expect(422);
    await ask(cookie, { ...body, resourceId: randomUUID() }).expect(404);
  });

  it('T-SEC-05 status, decided_by ou id enviados pelo cliente viram 400', async () => {
    const { cookie } = await loginAs(app, ['REQUESTER']);
    const body = { resourceId: await newResource(), accessLevel: 'READ', requestedMinutes: 30, justification: JUSTIFICATIVA };
    for (const extra of [{ status: 'APPROVED' }, { decidedById: randomUUID() }, { id: randomUUID() }]) await ask(cookie, { ...body, ...extra }).expect(400);
  });

  it('só um pedido pendente por pessoa e recurso (UNIQUE parcial); o aprovador não vê os próprios na fila', async () => {
    const user = await loginAs(app, ['REQUESTER', 'APPROVER']);
    const body = { resourceId: await newResource(), accessLevel: 'WRITE', requestedMinutes: 15, justification: JUSTIFICATIVA };
    const { id } = (await ask(user.cookie, body).expect(201)).body;
    expect((await ask(user.cookie, body).expect(409)).body.message).toMatch(/pendente/);
    expect((await get(user.cookie, '/api/requests/queue')).body.map((q: { id: string }) => q.id)).not.toContain(id);
    await sql("UPDATE pam.access_requests SET status = 'CANCELLED' WHERE id = $1", [id]);
    await ask(user.cookie, body).expect(201);
  });

  it('o banco barra autoaprovação, decisão sem autor e DELETE de pedido', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const [{ id }] = await sql(
      "INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification) VALUES ($1, $2, 'READ', 10, $3) RETURNING id",
      [user.id, await newResource(), JUSTIFICATIVA],
    );
    await withClient('dbwatch_app', async (db) => {
      const decide = (by: string | null) => db.query("UPDATE pam.access_requests SET status = 'APPROVED', decided_by = $2, decided_at = now() WHERE id = $1", [id, by]);
      expect(await sqlState(decide(user.id))).toBe('23514');
      expect(await sqlState(decide(null))).toBe('23514');
      expect(await sqlState(db.query('DELETE FROM pam.access_requests WHERE id = $1', [id]))).toBe('42501');
    });
  });
});
