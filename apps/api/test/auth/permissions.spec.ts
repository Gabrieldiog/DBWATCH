import 'reflect-metadata';
import { Controller, Get } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, REQUIRED_PERMISSIONS } from '../../src/auth/permissions';
import { IS_PUBLIC } from '../../src/auth/public.decorator';
import { createApp } from '../support/app';
import { urlFor, withClient } from '../support/db';
import { loginAs } from '../support/users';

@Controller('esquecida')
class ForgottenController {
  @Get()
  secret() {
    return { segredo: true };
  }
}

describe('autorização: nega por padrão', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('T-SEC-01 toda rota registrada declara @Public, @Authenticated ou @RequirePermission', () => {
    const undeclared: string[] = [];
    let routes = 0;
    for (const mod of app.get(ModulesContainer).values()) {
      for (const { metatype } of mod.controllers.values()) {
        const proto = (metatype as new () => object).prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(proto)) {
          const handler = proto[name];
          if (typeof handler !== 'function' || Reflect.getMetadata(PATH_METADATA, handler) === undefined || name === 'constructor') continue;
          routes += 1;
          const declared = [IS_PUBLIC, REQUIRED_PERMISSIONS].some(
            (key) => Reflect.getMetadata(key, handler) !== undefined || Reflect.getMetadata(key, metatype as object) !== undefined,
          );
          if (!declared) undeclared.push(`${(metatype as { name: string }).name}.${name}`);
        }
      }
    }
    expect(routes).toBeGreaterThanOrEqual(6);
    expect(undeclared).toEqual([]);
  });

  it('rota que esqueceu o decorator é negada em execução, mesmo para quem tem sessão', async () => {
    const other = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' }, [ForgottenController]);
    try {
      const user = await loginAs(other, ['ADMIN', 'AUDITOR']);
      await request(other.getHttpServer()).get('/api/esquecida').expect(401);
      const res = await request(other.getHttpServer()).get('/api/esquecida').set('Cookie', user.cookie).expect(403);
      expect(JSON.stringify(res.body)).not.toContain('segredo');
    } finally {
      await other.close();
    }
  });

  it('o catálogo de permissões do código é o mesmo do banco', async () => {
    const codes = await withClient('admin', async (db) => (await db.query<{ code: string }>('SELECT code FROM iam.permissions')).rows);
    expect(codes.map((c) => c.code).sort()).toEqual([...PERMISSIONS].sort());
  });

  it('T-SEC-02 matriz rota × papel (anônimo, cada papel e sem papel)', async () => {
    const routes = ['/api/health', '/api/auth/me', '/api/audit', '/api/audit/verify'];
    const expected: Record<string, number[]> = {
      ANONIMO: [200, 401, 401, 401],
      SEM_PAPEL: [200, 200, 403, 403],
      ADMIN: [200, 200, 403, 403],
      APPROVER: [200, 200, 403, 403],
      REQUESTER: [200, 200, 403, 403],
      AUDITOR: [200, 200, 200, 200],
    };
    const actual: Record<string, number[]> = {};
    for (const who of Object.keys(expected)) {
      const cookie = who === 'ANONIMO' ? undefined : (await loginAs(app, who === 'SEM_PAPEL' ? [] : [who])).cookie;
      actual[who] = [];
      for (const route of routes) {
        const req = request(app.getHttpServer()).get(route);
        actual[who].push((await (cookie ? req.set('Cookie', cookie) : req)).status);
      }
    }
    expect(actual).toEqual(expected);
  });

  it('negação vira registro DENIED na auditoria, e o papel novo vale já na próxima requisição', async () => {
    const admin = await loginAs(app, ['ADMIN']);
    await request(app.getHttpServer()).get('/api/audit').set('Cookie', admin.cookie).expect(403);
    const [row] = await withClient('admin', async (db) =>
      (
        await db.query(
          "SELECT action, outcome::text, resource_id, reason FROM audit.audit_log WHERE actor_id = $1 AND action = 'authz.denied'",
          [admin.id],
        )
      ).rows,
    );
    expect(row).toEqual({ action: 'authz.denied', outcome: 'DENIED', resource_id: 'GET /api/audit', reason: 'audit:read' });

    await withClient('admin', (db) => db.query("INSERT INTO iam.user_roles (user_id, role_id) SELECT $1, id FROM iam.roles WHERE code = 'AUDITOR'", [admin.id]));
    await request(app.getHttpServer()).get('/api/audit').set('Cookie', admin.cookie).expect(200);
  });
});
