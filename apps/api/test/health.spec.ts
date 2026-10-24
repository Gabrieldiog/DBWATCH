import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Public } from '../src/auth/public.decorator';
import { createApp } from './support/app';
import { urlFor } from './support/db';

const UUID = /^[0-9a-f-]{36}$/;
// A API roda com o papel de menor privilégio, como em produção
const databaseUrl = urlFor('dbwatch_app');

@Controller('boom')
class BoomController {
  @Public()
  @Get()
  fail(): never {
    throw new Error('senha=segredo123 vazou');
  }
}

describe('API com PostgreSQL real', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createApp(databaseUrl, {}, [BoomController]);
  });
  afterAll(() => app.close());

  it('GET /api/health responde 200 quando o banco está no ar, com cabeçalhos de segurança (T-SEC-07)', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: { status: 'up' } });
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it('propaga um X-Request-Id válido e descarta um malicioso', async () => {
    const id = randomUUID();
    const ok = await request(app.getHttpServer()).get('/api/health').set('X-Request-Id', id);
    expect(ok.headers['x-request-id']).toBe(id);
    const bad = await request(app.getHttpServer()).get('/api/health').set('X-Request-Id', 'x FAKE-LOG');
    expect(bad.headers['x-request-id']).toMatch(UUID);
  });

  it('erro inesperado vira 500 genérico, sem vazar detalhes', async () => {
    const res = await request(app.getHttpServer()).get('/api/boom').expect(500);
    expect(res.body.correlationId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/segredo123|Error|at /);
  });

  it('Swagger em /api/docs descreve as rotas de autenticação', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/health', '/api/auth/login', '/api/auth/me']));
    const page = await request(app.getHttpServer()).get('/api/docs').expect(200);
    expect(page.headers['content-security-policy']).toBeUndefined();
  });

  it('rota inexistente responde 404 com correlationId', async () => {
    const res = await request(app.getHttpServer()).get('/api/nao-existe').expect(404);
    expect(res.body.correlationId).toMatch(UUID);
  });

  it('SET LOCAL application_name aparece em pg_stat_activity só durante a transação', async () => {
    const [tx, observer] = [new Client(databaseUrl), new Client(databaseUrl)];
    await Promise.all([tx.connect(), observer.connect()]);
    const name = `dbwatch:${randomUUID()}`;
    const sessions = async () =>
      (await observer.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = $1', [name])).rows[0].n;
    try {
      await tx.query('BEGIN');
      await tx.query("SELECT set_config('application_name', $1, true)", [name]);
      expect(await sessions()).toBe(1);
      await tx.query('COMMIT');
      expect(await sessions()).toBe(0);
    } finally {
      await Promise.all([tx.end(), observer.end()]);
    }
  });
});

describe('API com o banco fora do ar', () => {
  it('GET /api/health responde 503 sem detalhes do erro', async () => {
    const app = await createApp('postgres://ninguem:x@127.0.0.1:1/nada');
    try {
      const res = await request(app.getHttpServer()).get('/api/health').expect(503);
      expect(res.body).toEqual({ status: 'degraded', database: { status: 'down' } });
    } finally {
      await app.close();
    }
  });
});
