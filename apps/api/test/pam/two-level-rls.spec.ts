import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
async function pending(requesterId: string, sensitivity: 'MEDIUM' | 'HIGH'): Promise<string> {
  const [res] = await sql("INSERT INTO pam.resources (name, database_name, sensitivity, max_grant_minutes) VALUES ($1, 'dbwatch_target', $2, 30) RETURNING id", [`rec-${randomUUID()}`, sensitivity]);
  const [req] = await sql(
    "INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification) VALUES ($1, $2, 'READ', 15, 'Auditoria trimestral das contas a pagar') RETURNING id",
    [requesterId, res.id],
  );
  return req.id;
}

describe('aprovação em 2 níveis e RLS', () => {
  let app: NestExpressApplication;
  const approve = (cookie: string, id: string) =>
    request(app.getHttpServer()).post(`/api/requests/${id}/approve`).set('Origin', ORIGIN).set('Cookie', cookie).send({});

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('recurso HIGH precisa de dois aprovadores diferentes; a concessão só sai na segunda', async () => {
    const [requester, a, b] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER']), await loginAs(app, ['APPROVER'])];
    const id = await pending(requester.id, 'HIGH');
    expect((await approve(a.cookie, id).expect(200)).body).toEqual({ id, status: 'PENDING', approvals: 1, required: 2 });
    expect(await sql('SELECT 1 FROM pam.access_grants WHERE request_id = $1', [id])).toHaveLength(0);
    expect((await approve(a.cookie, id).expect(403)).body.message).toMatch(/outra pessoa/);
    expect((await approve(b.cookie, id).expect(200)).body).toMatchObject({ status: 'APPROVED', approvals: 2, required: 2 });
    const [row] = await sql('SELECT first_approved_by, decided_by FROM pam.access_requests WHERE id = $1', [id]);
    expect(row).toEqual({ first_approved_by: a.id, decided_by: b.id });
    expect(await sql('SELECT 1 FROM pam.access_grants WHERE request_id = $1', [id])).toHaveLength(1);
    // Recurso MEDIUM continua com um aprovador só
    expect((await approve(a.cookie, await pending(requester.id, 'MEDIUM')).expect(200)).body).toMatchObject({ status: 'APPROVED', required: 1 });
  });

  it('o banco recusa aprovar HIGH sem o primeiro aprovador ou com a mesma pessoa duas vezes', async () => {
    const [requester, a] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const id = await pending(requester.id, 'HIGH');
    const finish = () => sql("UPDATE pam.access_requests SET status = 'APPROVED', decided_by = $2, decided_at = now() WHERE id = $1", [id, a.id]);
    expect(await sqlState(finish())).toBe('DW004');
    await sql('UPDATE pam.access_requests SET first_approved_by = $2, first_approved_at = now() WHERE id = $1', [id, a.id]);
    expect(await sqlState(finish())).toBe('23514');
  });

  it('T-SEC-03 pedido de outra pessoa responde 404; o dono e o aprovador enxergam', async () => {
    const [alice, bob, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const id = await pending(alice.id, 'MEDIUM');
    const get = (cookie: string) => request(app.getHttpServer()).get(`/api/requests/${id}`).set('Cookie', cookie);
    await get(bob.cookie).expect(404);
    expect((await get(alice.cookie).expect(200)).body.id).toBe(id);
    await get(approver.cookie).expect(200);
    await request(app.getHttpServer()).get('/api/requests/queue').set('Cookie', approver.cookie).expect(200);
  });

  it('RLS: sem filtro nenhum no SQL, o banco só devolve as linhas de quem se declarou', async () => {
    const [alice, bob] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER'])];
    const id = await pending(alice.id, 'MEDIUM');
    await withClient('dbwatch_app', async (db) => {
      const as = async (userId: string, review = 'off') => {
        await db.query("SELECT set_config('app.user_id', $1, false), set_config('app.can_review', $2, false)", [userId, review]);
        return (await db.query('SELECT id FROM pam.access_requests WHERE id = $1', [id])).rowCount;
      };
      expect(await as('')).toBe(0);
      expect(await as(bob.id)).toBe(0);
      expect(await as(alice.id)).toBe(1);
      expect(await as(bob.id, 'on')).toBe(1);
      await as(bob.id);
      expect((await db.query("UPDATE pam.access_requests SET status = 'CANCELLED' WHERE id = $1", [id])).rowCount).toBe(0);
      // Bob tenta criar um pedido em nome da Alice: a política WITH CHECK recusa
      const [res] = await sql("INSERT INTO pam.resources (name, database_name, sensitivity, max_grant_minutes) VALUES ($1, 'dbwatch_target', 'LOW', 30) RETURNING id", [`rec-${randomUUID()}`]);
      const forged = db.query(
        "INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification) VALUES ($1, $2, 'READ', 10, 'Pedido forjado em nome de outra pessoa')",
        [alice.id, res.id],
      );
      expect(await sqlState(forged)).toBe('42501');
    });
  });
});
