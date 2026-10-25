import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../support/app';
import { urlFor } from '../support/db';
import { loginAs } from '../support/users';

describe('rotas da auditoria', () => {
  let app: NestExpressApplication;
  let auditor: { id: string; cookie: string };
  const get = (query: Record<string, string | number>) =>
    request(app.getHttpServer()).get('/api/audit').query(query).set('Cookie', auditor.cookie);

  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    auditor = await loginAs(app, ['AUDITOR']);
  });
  afterAll(() => app.close());

  it('lista do mais recente ao mais antigo, com o e-mail do ator', async () => {
    const res = await get({ actorId: auditor.id }).expect(200);
    expect(res.body.items[0]).toMatchObject({ action: 'auth.login', outcome: 'SUCCESS', actorId: auditor.id });
    expect(res.body.items[0].actorEmail).toMatch(/^auditor-/);
    expect(res.body.items[0]).not.toHaveProperty('row_hash');
  });

  it('o cursor percorre todas as páginas sem repetir nem pular linhas', async () => {
    for (let i = 0; i < 6; i++) await request(app.getHttpServer()).get('/api/audit/verify').set('Cookie', auditor.cookie).expect(200);
    const ids = (r: request.Response) => r.body.items.map((i: { chainPosition: number }) => i.chainPosition) as number[];
    const all = ids(await get({ limit: 7 }).expect(200));
    const seen: number[] = [];
    let cursor: number | null = null;
    for (let page = 0; page < 3; page++) {
      const res: request.Response = await get(cursor ? { limit: 3, cursor } : { limit: 3 }).expect(200);
      seen.push(...ids(res));
      cursor = res.body.nextCursor;
    }
    expect(seen.slice(0, 7)).toEqual(all);
    expect(all).toEqual([...all].sort((x, y) => y - x));
  });

  it('filtra por resultado e por período', async () => {
    const res = await get({ outcome: 'DENIED', from: new Date(Date.now() - 3_600_000).toISOString() }).expect(200);
    expect(res.body.items.every((i: { outcome: string }) => i.outcome === 'DENIED')).toBe(true);
    await get({ from: new Date(Date.now() + 60_000).toISOString() }).expect(200, { items: [], nextCursor: null });
  });

  it('T-SEC-06 injeção nos filtros é tratada como valor ou recusada pelo schema', async () => {
    const res = await get({ resourceId: "' OR 1=1 --" }).expect(200);
    expect(res.body.items).toEqual([]);
    await get({ resourceId: '"; DROP TABLE audit.audit_log; --' }).expect(200, { items: [], nextCursor: null });
    await get({ action: "auth.login' OR '1'='1" }).expect(400);
    await get({ actorId: '1 OR 1=1' }).expect(400);
    await get({ limit: 1000 }).expect(400);
    await get({ orderBy: 'row_hash' }).expect(400);
    expect((await get({ limit: 1 }).expect(200)).body.items).toHaveLength(1);
  });

  it('verificar a cadeia responde íntegra e deixa rastro na própria auditoria', async () => {
    const res = await request(app.getHttpServer()).get('/api/audit/verify').set('Cookie', auditor.cookie).expect(200);
    expect(res.body).toMatchObject({ intact: true, firstBrokenPosition: null });
    expect(res.body.checked).toBeGreaterThan(0);
    const trail = await get({ actorId: auditor.id, action: 'audit.verify' }).expect(200);
    expect(trail.body.items[0]).toMatchObject({ reason: 'cadeia_integra', metadata: { checked: res.body.checked } });
  });
});
