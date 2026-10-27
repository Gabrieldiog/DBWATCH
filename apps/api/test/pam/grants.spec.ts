import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GrantsService } from '../../src/pam/grants.service';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
// Concessão que começou há `startedAgo` minutos e dura `lasts` minutos, num recurso novo
async function grant(userId: string, deciderId: string, startedAgo: number, lasts: number): Promise<string> {
  const [res] = await sql("INSERT INTO pam.resources (name, database_name, sensitivity, max_grant_minutes) VALUES ($1, 'dbwatch_target', 'LOW', 60) RETURNING id", [`rec-${randomUUID()}`]);
  const [req] = await sql(
    `INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification, status, decided_by, decided_at)
     VALUES ($1, $2, 'READ', 30, 'Conferência mensal dos lançamentos', 'APPROVED', $3, now()) RETURNING id`, [userId, res.id, deciderId]);
  const [g] = await sql(
    `INSERT INTO pam.access_grants (request_id, user_id, resource_id, access_level, starts_at, expires_at)
     VALUES ($1, $2, $3, 'READ', now() - make_interval(mins => $4), now() - make_interval(mins => $4) + make_interval(mins => $5)) RETURNING id`,
    [req.id, userId, res.id, startedAgo, lasts]);
  return g.id;
}

describe('concessões: estado pelo tempo, revogação e expiração', () => {
  let app: NestExpressApplication;
  const get = (cookie: string, url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie);
  const revoke = (cookie: string, id: string, body: object = { reason: 'acesso não é mais necessário' }) =>
    request(app.getHttpServer()).post(`/api/grants/${id}/revoke`).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('"meus acessos": estado calculado pelo relógio do banco e aviso de expiração em breve', async () => {
    const [user, other, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const ids = { active: await grant(user.id, approver.id, 0, 30), soon: await grant(user.id, approver.id, 0, 3), expired: await grant(user.id, approver.id, 60, 30) };
    await grant(other.id, approver.id, 0, 30);
    const mine = (await get(user.cookie, '/api/grants/mine').expect(200)).body as { id: string; state: string; secondsLeft: number; expiresSoon: boolean }[];
    const byId = Object.fromEntries(mine.map((g) => [g.id, g]));
    expect(mine).toHaveLength(3);
    expect(byId[ids.active]).toMatchObject({ state: 'ACTIVE', expiresSoon: false });
    expect(byId[ids.active]!.secondsLeft).toBeGreaterThan(1700);
    expect(byId[ids.soon]).toMatchObject({ state: 'ACTIVE', expiresSoon: true });
    expect(byId[ids.expired]).toMatchObject({ state: 'EXPIRED', expiresSoon: false, secondsLeft: 0 });
    await get(user.cookie, '/api/grants/active').expect(403);
  });

  it('revogar vale na hora; revogar de novo ou depois de expirar é 409; o motivo vai para a auditoria', async () => {
    const [user, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const [live, expired] = [await grant(user.id, approver.id, 0, 30), await grant(user.id, approver.id, 60, 30)];
    expect((await get(approver.cookie, '/api/grants/active').expect(200)).body.map((g: { id: string }) => g.id)).toContain(live);
    await revoke(approver.cookie, live, {}).expect(400);
    expect((await revoke(approver.cookie, live).expect(200)).body).toEqual({ id: live, state: 'REVOKED' });
    await revoke(approver.cookie, live).expect(409);
    await revoke(approver.cookie, expired).expect(409);
    await revoke(approver.cookie, randomUUID()).expect(404);
    await revoke(user.cookie, live).expect(403);
    const states = (await get(user.cookie, '/api/grants/mine')).body.map((g: { id: string; state: string }) => `${g.id === live ? 'viva' : 'vencida'}:${g.state}`);
    expect(states.sort()).toEqual(['vencida:EXPIRED', 'viva:REVOKED']);
    const [row] = await sql("SELECT actor_id, metadata FROM audit.audit_log WHERE action = 'pam.grant_revoke' AND resource_id = $1 AND outcome = 'SUCCESS'", [live]);
    expect(row).toEqual({ actor_id: approver.id, metadata: { motivo: 'acesso não é mais necessário' } });
  });

  it('o job só audita expirações, uma vez cada; ignora concessões vivas e revogadas', async () => {
    const [user, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const [expired, live, revokedLate] = [await grant(user.id, approver.id, 60, 30), await grant(user.id, approver.id, 0, 30), await grant(user.id, approver.id, 60, 30)];
    await sql("UPDATE pam.access_grants SET revoked_at = starts_at + interval '1 minute', revoked_by = $2, revoke_reason = 'revogada antes de vencer' WHERE id = $1", [revokedLate, approver.id]);
    const job = app.get(GrantsService);
    expect(await job.sweepExpired()).toBeGreaterThanOrEqual(1);
    await job.sweepExpired();
    const audited = await sql("SELECT resource_id, actor_id FROM audit.audit_log WHERE action = 'pam.grant_expired' AND resource_id = ANY($1)", [[expired, live, revokedLate]]);
    expect(audited).toEqual([{ resource_id: expired, actor_id: null }]);
  });

  it('RLS nas concessões: sem permissão, o banco não mostra nem altera concessão alheia', async () => {
    const [alice, bob, approver] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['REQUESTER']), await loginAs(app, ['APPROVER'])];
    const id = await grant(alice.id, approver.id, 0, 30);
    await withClient('dbwatch_app', async (db) => {
      await db.query("SELECT set_config('app.user_id', $1, false), set_config('app.can_revoke', 'off', false)", [bob.id]);
      expect((await db.query('SELECT 1 FROM pam.access_grants WHERE id = $1', [id])).rowCount).toBe(0);
      expect((await db.query('UPDATE pam.access_grants SET expiry_audited_at = now() WHERE id = $1', [id])).rowCount).toBe(0);
      await db.query("SELECT set_config('app.user_id', $1, false)", [alice.id]);
      expect((await db.query('SELECT 1 FROM pam.access_grants WHERE id = $1', [id])).rowCount).toBe(1);
    });
  });
});
