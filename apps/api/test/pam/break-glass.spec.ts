import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { sqlState, urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const JUSTIFICATIVA = 'Incidente em produção: fechamento travado, preciso conferir os pedidos agora';
const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
const resource = async (name: string) => (await sql('SELECT id FROM pam.resources WHERE name = $1', [name]))[0].id as string;

describe('break-glass: acesso de emergência', () => {
  let app: NestExpressApplication;
  const post = (cookie: string, url: string, body: object) => request(app.getHttpServer()).post(url).set('Origin', ORIGIN).set('Cookie', cookie).send(body);
  const open = (cookie: string, body: object) => post(cookie, '/api/break-glass', body);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('ADMIN abre acesso imediato, mesmo em recurso HIGH, e já consegue consultar; tudo auditado como alerta', async () => {
    const admin = await loginAs(app, ['ADMIN']);
    const resourceId = await resource('Financeiro');
    const res = await open(admin.cookie, { resourceId, minutes: 10, justification: JUSTIFICATIVA }).expect(201);
    expect(res.body.grant.id).toMatch(/^[0-9a-f-]{36}$/);
    await post(admin.cookie, '/api/queries/faturamento_mensal/execute', {}).expect(200);
    const [req] = await sql('SELECT status::text, decided_by, break_glass, requested_minutes FROM pam.access_requests WHERE id = $1', [res.body.requestId]);
    expect(req).toEqual({ status: 'APPROVED', decided_by: admin.id, break_glass: true, requested_minutes: 10 });
    const [audit] = await sql("SELECT actor_id, metadata FROM audit.audit_log WHERE action = 'pam.break_glass' AND resource_id = $1", [res.body.requestId]);
    expect(audit).toEqual({ actor_id: admin.id, metadata: { recurso: resourceId, minutos: 10, alerta: true } });
    // Já existe uma concessão viva: abrir outra no mesmo recurso esbarra na EXCLUDE
    await open(admin.cookie, { resourceId, minutes: 5, justification: JUSTIFICATIVA }).expect(409);
  });

  it('limites: mais de 15 min, justificativa curta e quem não é ADMIN são recusados', async () => {
    const [admin, requester] = [await loginAs(app, ['ADMIN']), await loginAs(app, ['REQUESTER'])];
    const resourceId = await resource('Clientes');
    await open(admin.cookie, { resourceId, minutes: 20, justification: JUSTIFICATIVA }).expect(400);
    await open(admin.cookie, { resourceId, minutes: 10, justification: 'urgente' }).expect(400);
    await open(requester.cookie, { resourceId, minutes: 10, justification: JUSTIFICATIVA }).expect(403);
  });

  it('o banco garante: sem permissão (DW006), prazo e justificativa (CHECK) e pedido comum já aprovado (DW005)', async () => {
    const [requester, admin] = [await loginAs(app, ['REQUESTER']), await loginAs(app, ['ADMIN'])];
    const resourceId = await resource('Catálogo de produtos');
    await withClient('dbwatch_app', async (db) => {
      const insert = (userId: string, minutes: number, breakGlass: boolean, status: string) =>
        db.query(
          `INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification, status, decided_by, decided_at, break_glass)
           VALUES ($1, $2, 'READ', $3, $4, $5::pam.request_status, CASE WHEN $5::text = 'APPROVED' THEN $1::uuid END,
                   CASE WHEN $5::text = 'APPROVED' THEN now() END, $6)`,
          [userId, resourceId, minutes, JUSTIFICATIVA, status, breakGlass]);
      const as = (id: string) => db.query("SELECT set_config('app.user_id', $1, false)", [id]);
      await as(requester.id);
      expect(await sqlState(insert(requester.id, 10, true, 'APPROVED'))).toBe('DW006');
      expect(await sqlState(insert(requester.id, 10, false, 'APPROVED'))).toBe('DW005');
      await as(admin.id);
      expect(await sqlState(insert(admin.id, 16, true, 'APPROVED'))).toBe('23514');
    });
  });

  it('revisão posterior: outra pessoa revisa uma vez; quem abriu não revisa o próprio', async () => {
    const [admin, approver] = [await loginAs(app, ['ADMIN', 'APPROVER']), await loginAs(app, ['APPROVER'])];
    const { requestId } = (await open(admin.cookie, { resourceId: await resource('Clientes'), minutes: 5, justification: JUSTIFICATIVA }).expect(201)).body;
    const pending = (await request(app.getHttpServer()).get('/api/break-glass/pending').set('Cookie', approver.cookie).expect(200)).body;
    expect(pending.find((p: { id: string }) => p.id === requestId).requester.id).toBe(admin.id);
    await post(admin.cookie, `/api/break-glass/${requestId}/review`, { note: 'eu mesmo reviso' }).expect(403);
    await post(approver.cookie, `/api/break-glass/${requestId}/review`, { note: 'incidente confirmado com a equipe' }).expect(200);
    await post(approver.cookie, `/api/break-glass/${requestId}/review`, { note: 'de novo' }).expect(409);
    await post(approver.cookie, `/api/break-glass/${randomUUID()}/review`, { note: 'não existe' }).expect(404);
    const after = (await request(app.getHttpServer()).get('/api/break-glass/pending').set('Cookie', approver.cookie)).body;
    expect(after.map((p: { id: string }) => p.id)).not.toContain(requestId);
  });
});
