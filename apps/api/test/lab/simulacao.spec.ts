import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditedTransaction } from '../../src/audit/audited-transaction';
import { seedDemoUsers } from '../../src/auth/demo-users';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('LAB: o bot da simulação (acesso, incidente e verificação)', () => {
  let app: NestExpressApplication;
  const start = (cookie: string) => request(app.getHttpServer()).post('/api/lab/simulacao').set('Origin', ORIGIN).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    // Os personagens do bot são os do seed (Diego, Bruno e Eva)
    await seedDemoUsers(app.get(AuditedTransaction));
  });
  afterAll(() => app.close());

  it('T-LAB-07 roda sozinha com conexões reais, narra cada passo e termina com as contas consistentes', async () => {
    const admin = await loginAs(app, ['ADMIN']);
    const requester = await loginAs(app, ['REQUESTER']);
    await start(requester.cookie).expect(403);
    const since = (await withClient('admin', (db) => db.query<{ id: string }>('SELECT coalesce(max(id), 0)::text AS id FROM monitor.app_events'))).rows[0]!.id;
    await start(admin.cookie).expect(202);
    // Um experimento por vez: a simulação segura o mesmo advisory lock do laboratório
    await start(admin.cookie).expect(409);
    await request(app.getHttpServer()).post('/api/lab/deadlock/run').set('Origin', ORIGIN).set('Cookie', admin.cookie).expect(409);

    const steps = async () =>
      (
        await withClient('admin', (db) =>
          db.query<{ titulo: string; texto: string; cid: string | null }>(
            "SELECT detail->>'titulo' AS titulo, detail->>'texto' AS texto, correlation_id::text AS cid FROM monitor.app_events WHERE kind = 'LAB' AND id > $1 ORDER BY id",
            [since],
          ),
        )
      ).rows;
    for (let i = 0; i < 180 && !(await steps()).some((s) => /concluída|parou/.test(s.titulo)); i++) await pause(500);
    const all = await steps();
    const text = all.map((s) => `${s.titulo}: ${s.texto}`).join('\n');
    expect(all[0]!.titulo).toBe('Simulação iniciada');
    // Ato 1: as duas camadas barram a autoaprovação; a aprovação de outra pessoa e a consulta passam
    expect(text).toContain('A API recusou: Ninguém decide o próprio pedido');
    expect(text).toContain('o PostgreSQL recusou com 23514, regra access_requests_sod_ck');
    expect(text).toContain('Bruno aprovou');
    expect(text).toMatch(/Diego consultou os clientes: \d+ linha\(s\)/);
    // Ato 2: o incidente
    expect(text).toContain('55P03'); // o caixa desistiu pelo lock_timeout
    expect(text).toContain('idle_in_transaction_session_timeout'); // o banco derrubou o relatório esquecido
    expect(text).toContain('Erro 40P01'); // deadlock com uma vítima, que foi repetida
    // 100 + 50 - 10 do débito do caixa; as transferências cruzadas só trocam dinheiro de lugar
    expect(all.find((s) => s.titulo === 'Incidente resolvido')!.texto).toContain('total das contas 140.00');
    // Ato 3: a verificação da trilha
    expect(text).toMatch(/Cadeia íntegra: \d+ registros conferidos/);
    expect(all.at(-1)!.titulo).toBe('Simulação concluída');

    // Cada ação do bot está na auditoria com o autor certo, ligada ao evento pelo código da execução e marcada como simulação
    const linked = all.filter((s) => s.cid).map((s) => s.cid!);
    expect(linked.length).toBeGreaterThanOrEqual(6);
    const audit = (await withClient('admin', (db) => db.query<{ action: string; outcome: string; email: string; sim: string | null }>(
      `SELECT a.action, a.outcome::text, u.email, a.metadata->>'simulacao' AS sim
         FROM audit.audit_log a JOIN iam.users u ON u.id = a.actor_id WHERE a.correlation_id = ANY($1::uuid[]) ORDER BY a.chain_position`,
      [linked],
    ))).rows;
    expect(audit.map((r) => [r.action, r.outcome, r.email.split('.')[0]])).toEqual([
      ['pam.request_create', 'SUCCESS', 'diego'],
      ['pam.request_approve', 'DENIED', 'diego'],
      ['pam.request_approve', 'FAILURE', 'diego'],
      ['pam.request_approve', 'SUCCESS', 'bruno'],
      ['pam.query_execute', 'SUCCESS', 'diego'],
      ['audit.verify', 'SUCCESS', 'eva'],
    ]);
    expect(new Set(audit.map((r) => r.sim))).toEqual(new Set([admin.email]));
  }, 120_000);

  it('T-LAB-08 passo a passo: o bot para depois de cada ação e só segue no próximo clique, até o fim', async () => {
    const admin = await loginAs(app, ['ADMIN']);
    const requester = await loginAs(app, ['REQUESTER']);
    const next = (cookie: string) => request(app.getHttpServer()).post('/api/lab/simulacao/proximo').set('Origin', ORIGIN).set('Cookie', cookie);
    await next(admin.cookie).expect(409); // nada em andamento
    const since = (await withClient('admin', (db) => db.query<{ id: string }>('SELECT coalesce(max(id), 0)::text AS id FROM monitor.app_events'))).rows[0]!.id;
    const titles = async () => (await withClient('admin', (db) => db.query<{ t: string }>(
      "SELECT detail->>'titulo' AS t FROM monitor.app_events WHERE kind = 'LAB' AND id > $1 ORDER BY id", [since]))).rows.map((r) => r.t);
    // A conexão guardiã da rodada anterior pode estar fechando: tenta de novo por alguns segundos
    let started = await request(app.getHttpServer()).post('/api/lab/simulacao?modo=passo').set('Origin', ORIGIN).set('Cookie', admin.cookie);
    for (let i = 0; i < 10 && started.status === 409; i++) {
      await pause(500);
      started = await request(app.getHttpServer()).post('/api/lab/simulacao?modo=passo').set('Origin', ORIGIN).set('Cookie', admin.cookie);
    }
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ status: 'passo a passo', parado: true, terminou: false });
    await pause(1_000);
    expect(await titles()).toEqual(['Simulação iniciada']); // parado de verdade, esperando
    await next(requester.cookie).expect(403);
    expect((await next(admin.cookie).expect(200)).body).toEqual({ terminou: false, parado: true });
    expect(await titles()).toEqual(['Simulação iniciada', 'Ato 1: um acesso do começo ao fim']);

    let last = { terminou: false };
    for (let i = 0; i < 40 && !last.terminou; i++) last = (await next(admin.cookie).expect(200)).body;
    expect(last.terminou).toBe(true);
    const all = await titles();
    expect(all).toContain('Incidente resolvido');
    expect(all.at(-1)).toBe('Simulação concluída');
    await next(admin.cookie).expect(409);
  }, 180_000);
});
