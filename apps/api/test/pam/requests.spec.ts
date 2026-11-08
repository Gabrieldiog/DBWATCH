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
  let chosen: { id: string; cookie: string };
  // PK-26: todo pedido novo escolhe quem aprova; os testes antigos usam um aprovador fixo
  const ask = (cookie: string, body: object) =>
    request(app.getHttpServer()).post('/api/requests').set('Origin', ORIGIN).set('Cookie', cookie).send({ approverId: chosen.id, ...body });
  const get = (cookie: string, url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    chosen = await loginAs(app, ['APPROVER']);
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
      // Com RLS, quem não se declara não enxerga a linha; aqui a sessão se declara revisora
      await db.query("SELECT set_config('app.can_review', 'on', false)");
      const decide = (by: string | null) => db.query("UPDATE pam.access_requests SET status = 'APPROVED', decided_by = $2, decided_at = now() WHERE id = $1", [id, by]);
      expect(await sqlState(decide(user.id))).toBe('23514');
      expect(await sqlState(decide(null))).toBe('23514');
      expect(await sqlState(db.query('DELETE FROM pam.access_requests WHERE id = $1', [id]))).toBe('42501');
    });
  });

  it('T-PAM-11 quem pede escolhe quem aprova; só essa pessoa decide, e o banco garante mesmo sem a API', async () => {
    const [diego, bruno, carla, leigo] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER']), await loginAs(app, ['APPROVER']), await loginAs(app, ['REQUESTER'])];
    const list = (await get(diego.cookie, '/api/requests/approvers').expect(200)).body as { id: string; displayName: string }[];
    expect(list.map((a) => a.id)).toContain(bruno.id);
    expect(list.map((a) => a.id)).not.toContain(diego.id);
    expect(Object.keys(list[0]!).sort()).toEqual(['displayName', 'id']); // sem e-mail
    const body = { resourceId: await newResource(), accessLevel: 'READ', requestedMinutes: 15, justification: JUSTIFICATIVA };
    await ask(diego.cookie, { ...body, approverId: diego.id }).expect(400);
    await ask(diego.cookie, { ...body, approverId: leigo.id }).expect(400); // quem não aprova não pode ser escolhido
    const { id } = (await ask(diego.cookie, { ...body, approverId: bruno.id }).expect(201)).body;
    const decide = (cookie: string, verb: string, data = {}) =>
      request(app.getHttpServer()).post(`/api/requests/${id}/${verb}`).set('Origin', ORIGIN).set('Cookie', cookie).send(data);
    expect((await decide(carla.cookie, 'approve').expect(403)).body.message).toMatch(/só essa pessoa decide/);
    await decide(carla.cookie, 'reject', { note: 'Não fui escolhida' }).expect(403);
    // Sem a API: a CHECK recusa a decisão de outra pessoa
    const err = await sql("UPDATE pam.access_requests SET status = 'APPROVED', decided_by = $2, decided_at = now() WHERE id = $1", [id, carla.id]).catch((e) => e);
    expect([err.code, err.constraint]).toEqual(['23514', 'access_requests_somente_escolhido_ck']);
    expect((await decide(bruno.cookie, 'approve').expect(200)).body.status).toBe('APPROVED');

    // Sensibilidade alta: a primeira aprovação é de outra pessoa; a escolhida dá a final
    const [{ id: alto }] = await sql("INSERT INTO pam.resources (name, database_name, sensitivity, max_grant_minutes) VALUES ($1, 'dbwatch_target', 'HIGH', 30) RETURNING id", [`alto-${randomUUID()}`]);
    const high = (await ask(diego.cookie, { ...body, resourceId: alto, approverId: bruno.id }).expect(201)).body.id;
    const decideHigh = (cookie: string) => request(app.getHttpServer()).post(`/api/requests/${high}/approve`).set('Origin', ORIGIN).set('Cookie', cookie).send({});
    expect((await decideHigh(bruno.cookie).expect(403)).body.message).toMatch(/aprovação final/);
    expect((await decideHigh(carla.cookie).expect(200)).body).toMatchObject({ status: 'PENDING', approvals: 1 });
    expect((await decideHigh(bruno.cookie).expect(200)).body.status).toBe('APPROVED');
  });
});
