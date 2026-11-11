import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const sql = async (text: string, params: unknown[] = []) => withClient('admin', async (db) => (await db.query(text, params)).rows);
const target = async (text: string) => withClient('admin', async (db) => (await db.query(text)).rows, 'dbwatch_target');

// Concessão já aprovada (por outra pessoa) no recurso, com o nível pedido
async function grant(userId: string, approverId: string, resource: string, level: 'READ' | 'WRITE') {
  const [req] = await sql(
    `INSERT INTO pam.access_requests (requester_id, resource_id, access_level, requested_minutes, justification, status, decided_by, decided_at)
     SELECT $1, id, $4::pam.access_level, 15, 'Corrigir cadastro de demonstração', 'APPROVED', $2, now() FROM pam.resources WHERE name = $3
     RETURNING id, resource_id`, [userId, approverId, resource, level]);
  await sql(`INSERT INTO pam.access_grants (request_id, user_id, resource_id, access_level, starts_at, expires_at)
             VALUES ($1, $2, $3, $4::pam.access_level, now(), now() + interval '15 minutes')`, [req.id, userId, req.resource_id, level]);
  return req.resource_id as string;
}

describe('console SQL com leitura e escrita (PK-21, PK-23)', () => {
  let app: NestExpressApplication;
  let approver: { id: string };
  const run = (cookie: string, resourceId: string, text: string) =>
    request(app.getHttpServer()).post('/api/console/execute').set('Origin', ORIGIN).set('Cookie', cookie).send({ resourceId, sql: text });

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    approver = await loginAs(app, ['APPROVER']);
  });
  afterAll(() => app.close());

  it('T-CON-01 com Escrita em Clientes: altera de verdade, devolve linhas e grava o comando inteiro na auditoria', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const clientes = await grant(user.id, approver.id, 'Clientes', 'WRITE');
    const [antes] = await target('SELECT nome FROM loja.clientes WHERE id = 7');
    const res = await run(user.cookie, clientes, "UPDATE loja.clientes SET nome = 'Cliente 7 (corrigido)' WHERE id = 7 RETURNING id, nome").expect(200);
    expect(res.body).toMatchObject({ command: 'UPDATE', rowCount: 1, columns: ['id', 'nome'], rows: [{ id: 7, nome: 'Cliente 7 (corrigido)' }] });
    expect((await target('SELECT nome FROM loja.clientes WHERE id = 7'))[0].nome).toBe('Cliente 7 (corrigido)');
    const [audit] = await sql(
      "SELECT outcome::text, metadata->>'comando' AS comando FROM audit.audit_log WHERE actor_id = $1 AND action = 'pam.console_execute' ORDER BY chain_position DESC LIMIT 1", [user.id]);
    expect(audit).toEqual({ outcome: 'SUCCESS', comando: expect.stringContaining("SET nome = 'Cliente 7 (corrigido)'") });
    await run(user.cookie, clientes, `UPDATE loja.clientes SET nome = '${antes.nome}' WHERE id = 7`).expect(200);
  });

  it('T-CON-02 o papel do banco limita: outra tabela, DDL, dois comandos, DO e troca de papel são recusados pelo PostgreSQL', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const clientes = await grant(user.id, approver.id, 'Clientes', 'WRITE');
    // O código 42501 é genérico: a mensagem do PostgreSQL prova que a recusa foi pelo motivo certo
    const refused = async (text: string, sqlstate: string, why: string) =>
      expect((await run(user.cookie, clientes, text).expect(400)).body.message).toMatch(new RegExp(`SQLSTATE ${sqlstate}\\): .*${why}`));
    const [{ total }] = await target('SELECT count(*)::int AS total FROM loja.pedidos');
    await refused('DELETE FROM loja.pedidos', '42501', 'permission denied for table pedidos'); // Clientes não alcança o Financeiro
    await refused('DELETE FROM loja.clientes WHERE id = 7', '42501', 'permission denied for table clientes'); // PK-30: Escrita não apaga
    await refused('DROP TABLE loja.clientes', '42501', 'must be owner');
    await refused('TRUNCATE loja.clientes', '42501', 'permission denied for table clientes');
    await refused('CREATE TABLE loja.invasora (id int)', '42501', 'permission denied for schema loja');
    await refused("UPDATE loja.clientes SET nome = nome WHERE id = 1; DROP TABLE loja.clientes", '42601', 'multiple commands');
    await refused('DO $$ BEGIN SET ROLE dbwatch_rw_financeiro; DELETE FROM loja.pedidos; END $$', '42501', 'language plpgsql');
    // Trocar de papel num comando não dá privilégio a ele mesmo, e a conexão é descartada antes do próximo
    await run(user.cookie, clientes, "SELECT set_config('role', 'dbwatch_rw_financeiro', false)").expect(200);
    await refused('DELETE FROM loja.pedidos', '42501', 'permission denied for table pedidos');
    expect((await target('SELECT count(*)::int AS total FROM loja.pedidos'))[0].total).toBe(total);
    expect(await target("SELECT to_regclass('loja.clientes') IS NOT NULL AS existe")).toEqual([{ existe: true }]);
  });

  it('T-CON-03 com Leitura: SELECT funciona, mas a transação é READ ONLY e o banco recusa qualquer escrita', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const clientes = await grant(user.id, approver.id, 'Clientes', 'READ');
    const res = await run(user.cookie, clientes, "SELECT id, cidade FROM loja.clientes WHERE cidade = 'Goiânia' ORDER BY id LIMIT 3").expect(200);
    expect(res.body).toMatchObject({ level: 'READ', command: 'SELECT', rowCount: 3, columns: ['id', 'cidade'] });
    const [{ nome }] = await target('SELECT nome FROM loja.clientes WHERE id = 7');
    const refused = async (text: string, sqlstate: string, why: string) =>
      expect((await run(user.cookie, clientes, text).expect(400)).body.message).toMatch(new RegExp(`SQLSTATE ${sqlstate}\\): .*${why}`));
    await refused("UPDATE loja.clientes SET nome = 'x' WHERE id = 7", '25006', 'read-only transaction');
    await refused("WITH x AS (UPDATE loja.clientes SET nome = 'x' WHERE id = 7 RETURNING 1) SELECT * FROM x", '25006', 'read-only transaction');
    // Desligar o somente leitura não dá: a transação já fez consultas antes do comando da pessoa
    await refused('SET TRANSACTION READ WRITE', '25001', 'must be set before any query');
    await refused("SELECT set_config('transaction_read_only', 'off', true)", '25001', 'must be set before any query');
    await refused('SELECT count(*) FROM loja.pedidos', '42501', 'permission denied for table pedidos'); // só a tabela do recurso
    expect((await target('SELECT nome FROM loja.clientes WHERE id = 7'))[0].nome).toBe(nome);
    const [audit] = await sql(
      "SELECT outcome::text, metadata->>'nivel' AS nivel FROM audit.audit_log WHERE actor_id = $1 AND action = 'pam.console_execute' ORDER BY chain_position DESC LIMIT 1", [user.id]);
    expect(audit).toEqual({ outcome: 'FAILURE', nivel: 'READ' });
  });

  it('T-CON-04 sem nenhum acesso é 403 auditado; sem query:execute nem chega ao serviço', async () => {
    const user = await loginAs(app, ['REQUESTER']);
    const [{ id: catalogo }] = await sql("SELECT id FROM pam.resources WHERE name = 'Catálogo de produtos'");
    expect((await run(user.cookie, catalogo, 'SELECT 1').expect(403)).body.message).toMatch(/Leitura ou Escrita/);
    const [audit] = await sql(
      "SELECT outcome::text, reason FROM audit.audit_log WHERE actor_id = $1 AND action = 'pam.console_execute' ORDER BY chain_position DESC LIMIT 1", [user.id]);
    expect(audit).toEqual({ outcome: 'DENIED', reason: 'sem_concessao' });
    const auditor = await loginAs(app, ['AUDITOR']);
    await run(auditor.cookie, catalogo, 'SELECT 1').expect(403);
    await run(user.cookie, catalogo, '').expect(400);
  });
});
