import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('LAB: simulação do incidente "fechamento do mês"', () => {
  let app: NestExpressApplication;
  const start = (cookie: string) => request(app.getHttpServer()).post('/api/lab/simulacao').set('Origin', ORIGIN).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
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
          db.query<{ titulo: string; texto: string }>(
            "SELECT detail->>'titulo' AS titulo, detail->>'texto' AS texto FROM monitor.app_events WHERE kind = 'LAB' AND id > $1 ORDER BY id",
            [since],
          ),
        )
      ).rows;
    for (let i = 0; i < 120 && !(await steps()).some((s) => /concluída|parou/.test(s.titulo)); i++) await pause(500);
    const all = await steps();
    const text = all.map((s) => `${s.titulo}: ${s.texto}`).join('\n');
    expect(all[0]!.titulo).toBe('Simulação iniciada: fechamento do mês');
    expect(text).toContain('55P03'); // o caixa desistiu pelo lock_timeout
    expect(text).toContain('idle_in_transaction_session_timeout'); // o banco derrubou o relatório esquecido
    expect(text).toContain('Erro 40P01'); // deadlock com uma vítima, que foi repetida
    expect(all.at(-1)!.titulo).toBe('Simulação concluída');
    // 100 + 50 - 10 do débito do caixa; as transferências cruzadas só trocam dinheiro de lugar
    expect(all.at(-1)!.texto).toContain('total das contas 140.00');
  }, 70_000);
});
