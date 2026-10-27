import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditedTransaction } from '../../src/audit/audited-transaction';
import type { Tx } from '../../src/database/prisma.service';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
async function pendingRequest(requesterId: string, resourceId?: string): Promise<{ id: string; resourceId: string }> {
  resourceId ??= (await sql("INSERT INTO pam.resources (name, database_name, sensitivity, max_grant_minutes) VALUES ($1, 'dbwatch_target', 'MEDIUM', 60) RETURNING id", [`rec-${randomUUID()}`]))[0].id;
  const [{ id }] = await sql(
    "INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification) VALUES ($1, $2, 'READ', 30, 'Conferir divergência no relatório mensal') RETURNING id",
    [requesterId, resourceId],
  );
  return { id, resourceId: resourceId! };
}

describe('aprovar, rejeitar e cancelar pedidos', () => {
  let app: NestExpressApplication;
  const act = (cookie: string, id: string, verb: 'approve' | 'reject' | 'cancel', body: object = {}) =>
    request(app.getHttpServer()).post(`/api/requests/${id}/${verb}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('T-PAM-06 aprovar cria a concessão na mesma transação; se a concessão falha, o pedido continua pendente', async () => {
    const [requester, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const first = await pendingRequest(requester.id);
    const res = await act(approver.cookie, first.id, 'approve', { note: 'ok, pode seguir' }).expect(200);
    expect(res.body).toMatchObject({ id: first.id, status: 'APPROVED' });
    const [grant] = await sql(
      "SELECT user_id, round(extract(epoch FROM expires_at - starts_at) / 60) AS minutes FROM pam.access_grants WHERE request_id = $1", [first.id]);
    expect(grant).toEqual({ user_id: requester.id, minutes: '30' });

    // Segundo pedido do mesmo recurso: a EXCLUDE recusa a concessão sobreposta e o ROLLBACK desfaz a aprovação
    const second = await pendingRequest(requester.id, first.resourceId);
    expect((await act(approver.cookie, second.id, 'approve').expect(409)).body.message).toMatch(/concessão ativa/);
    const [after] = await sql('SELECT status::text, decided_by FROM pam.access_requests WHERE id = $1', [second.id]);
    expect(after).toEqual({ status: 'PENDING', decided_by: null });
    expect(await sql('SELECT 1 FROM pam.access_grants WHERE request_id = $1', [second.id])).toHaveLength(0);
  });

  it('T-PAM-03 e T-PAM-04 ninguém decide o próprio pedido, nem acumulando ADMIN e APPROVER', async () => {
    for (const roles of [['REQUESTER', 'APPROVER'], ['ADMIN', 'APPROVER']]) {
      const user = await loginAs(app, roles);
      const { id } = await pendingRequest(user.id);
      await act(user.cookie, id, 'approve').expect(403);
      await act(user.cookie, id, 'reject', { note: 'eu mesmo rejeito' }).expect(403);
      const [row] = await sql("SELECT outcome::text, reason FROM audit.audit_log WHERE action = 'pam.request_approve' AND resource_id = $1", [id]);
      expect(row).toEqual({ outcome: 'DENIED', reason: 'http:403' });
    }
  });

  it('T-PAM-05 rejeitar exige motivo; pedido decidido não é decidido de novo; só o dono cancela', async () => {
    const [requester, approver, other] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER']), await loginAs(app, ['REQUESTER'])];
    const rejected = await pendingRequest(requester.id);
    await act(approver.cookie, rejected.id, 'reject').expect(400);
    await act(approver.cookie, rejected.id, 'reject', { note: 'fora do escopo do chamado' }).expect(200);
    await act(approver.cookie, rejected.id, 'approve').expect(409);
    await act(approver.cookie, randomUUID(), 'approve').expect(404);
    expect((await sql('SELECT decision_note FROM pam.access_requests WHERE id = $1', [rejected.id]))[0].decision_note).toBe('fora do escopo do chamado');

    const pending = await pendingRequest(requester.id);
    await act(other.cookie, pending.id, 'cancel').expect(404);
    await act(requester.cookie, pending.id, 'cancel').expect(204);
    await act(requester.cookie, pending.id, 'cancel').expect(404);
    await act(approver.cookie, pending.id, 'approve').expect(409);
  });

  it('T-CONC-01 dez aprovadores ao mesmo tempo: exatamente 1 aprova, 9 recebem 409, uma concessão só', async () => {
    const requester = await loginAs(app, ['REQUESTER']);
    const approvers = await Promise.all(Array.from({ length: 10 }, () => loginAs(app, ['APPROVER'])));
    const { id } = await pendingRequest(requester.id);
    const results = await Promise.all(approvers.map((a) => act(a.cookie, id, 'approve')));
    expect(results.map((r) => r.status).sort()).toEqual([200, ...Array(9).fill(409)]);
    expect(await sql('SELECT 1 FROM pam.access_grants WHERE request_id = $1', [id])).toHaveLength(1);
  });

  it('deadlock real (40P01) é refeito automaticamente e só o resultado final vai para a auditoria', async () => {
    const audited = app.get(AuditedTransaction);
    const [x, y] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER'])];
    const marker = randomUUID();
    let attempts = 0;
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((r) => (release = r));
    const touch = (tx: Tx, id: string) => tx.$executeRaw`UPDATE iam.users SET updated_at = now() WHERE id = ${id}::uuid`;
    // Cada transação trava um usuário e espera a outra travar o seu; depois cada uma pede o da outra: ciclo
    const crossing = (first: string, second: string) =>
      audited.run({ action: 'test.deadlock_retry', resourceType: 'user', resourceId: marker }, async (tx) => {
        attempts += 1;
        await touch(tx, first);
        if (++arrived === 2) release();
        await barrier;
        await touch(tx, second);
      });
    await Promise.all([crossing(x.id, y.id), crossing(y.id, x.id)]);
    expect(attempts).toBe(3);
    const trail = await sql('SELECT outcome::text FROM audit.audit_log WHERE resource_id = $1', [marker]);
    expect(trail.map((t) => t.outcome)).toEqual(['SUCCESS', 'SUCCESS']);
  });
});
