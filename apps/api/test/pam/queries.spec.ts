import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
// Concessão no recurso de demonstração `resource`, começando há `startedAgo` min e durando `lasts` min
async function grantOn(userId: string, resource: string, startedAgo = 0, lasts = 30): Promise<string> {
  const [{ id: deciderId }] = await sql("SELECT id FROM iam.users WHERE id <> $1 LIMIT 1", [userId]);
  const [req] = await sql(
    `INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification, status, decided_by, decided_at)
     SELECT $1, id, 'READ', 30, 'Conferência dos dados de demonstração', 'APPROVED', $2, now() FROM pam.resources WHERE name = $3 RETURNING id, resource_id`, [userId, deciderId, resource]);
  const [g] = await sql(
    `INSERT INTO pam.access_grants (request_id, user_id, resource_id, access_level, starts_at, expires_at)
     VALUES ($1, $2, $3, 'READ', now() - make_interval(mins => $4), now() - make_interval(mins => $4) + make_interval(mins => $5)) RETURNING id`,
    [req.id, userId, req.resource_id, startedAgo, lasts]);
  return g.id;
}

describe('consultas controladas no banco-alvo', () => {
  let app: NestExpressApplication;
  const run = (cookie: string, code: string, params?: object) =>
    request(app.getHttpServer()).post(`/api/queries/${code}/execute`).set('Origin', ORIGIN).set('Cookie', cookie).send(params ? { params } : {});
  const lastAudit = async (userId: string) =>
    (await sql("SELECT outcome::text, reason FROM audit.audit_log WHERE actor_id = $1 AND action = 'pam.query_execute' ORDER BY chain_position DESC LIMIT 1", [userId]))[0];

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('com concessão ativa: executa só leitura, limita linhas, mascara e registra a execução', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const catalog = (await request(app.getHttpServer()).get('/api/queries').set('Cookie', user.cookie).expect(200)).body;
    expect(catalog.map((t: { code: string }) => t.code)).toContain('produtos_por_categoria');
    expect(JSON.stringify(catalog)).not.toMatch(/SELECT|sqlText/);
    const grantId = await grantOn(user.id, 'Catálogo de produtos');
    const res = await run(user.cookie, 'produtos_por_categoria', { categoria: 'Bebidas' }).expect(200);
    expect(res.body).toMatchObject({ columns: ['id', 'nome', 'preco'], rowCount: 50, truncated: false });
    const [exec] = await sql('SELECT outcome, row_count, sqlstate FROM pam.query_executions WHERE grant_id = $1', [grantId]);
    expect(exec).toEqual({ outcome: 'SUCCESS', row_count: 50, sqlstate: null });

    await grantOn(user.id, 'Clientes');
    const clients = (await run(user.cookie, 'clientes_por_cidade', { cidade: 'Goiânia' }).expect(200)).body;
    expect(clients).toMatchObject({ rowCount: 50, truncated: true });
    expect(clients.rows.every((r: { email: string }) => /^\w{3}\*\*\*$/.test(r.email))).toBe(true);
  });

  it('T-PAM-07 e T-PAM-08 sem concessão, expirada ou revogada: 403 auditado com o motivo', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    await run(user.cookie, 'faturamento_mensal').expect(403);
    expect(await lastAudit(user.id)).toEqual({ outcome: 'DENIED', reason: 'sem_concessao' });
    await grantOn(user.id, 'Financeiro', 60, 30);
    expect((await run(user.cookie, 'faturamento_mensal').expect(403)).body.message).toMatch(/expirou/);
    expect(await lastAudit(user.id)).toEqual({ outcome: 'DENIED', reason: 'grant_expired' });
    const live = await grantOn(user.id, 'Financeiro');
    await run(user.cookie, 'faturamento_mensal').expect(200);
    await sql("UPDATE pam.access_grants SET revoked_at = now(), revoked_by = user_id, revoke_reason = 'teste de revogação' WHERE id = $1", [live]);
    await run(user.cookie, 'faturamento_mensal').expect(403);
    expect(await lastAudit(user.id)).toEqual({ outcome: 'DENIED', reason: 'grant_revoked' });
  });

  it('T-PAM-09 consulta acima do tempo-limite: o banco cancela (57014), resposta 504, falha registrada', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const grantId = await grantOn(user.id, 'Catálogo de produtos');
    await run(user.cookie, 'relatorio_lento', { segundos: 3 }).expect(504);
    expect((await sql('SELECT outcome, sqlstate FROM pam.query_executions WHERE grant_id = $1', [grantId]))[0]).toEqual({ outcome: 'FAILURE', sqlstate: '57014' });
    expect(await lastAudit(user.id)).toEqual({ outcome: 'FAILURE', reason: 'sqlstate:57014' });
  });

  it('T-SEC-06 parâmetro com injeção é só um valor; parâmetro extra ou de tipo errado é 400', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    await grantOn(user.id, 'Catálogo de produtos');
    expect((await run(user.cookie, 'produtos_por_categoria', { categoria: "' OR 1=1 --" }).expect(200)).body.rowCount).toBe(0);
    await run(user.cookie, 'produtos_por_categoria', { categoria: 'Bebidas', extra: 1 }).expect(400);
    await run(user.cookie, 'relatorio_lento', { segundos: '1; DROP TABLE loja.produtos' }).expect(400);
    await run(user.cookie, 'nao_existe').expect(404);
  });
});
