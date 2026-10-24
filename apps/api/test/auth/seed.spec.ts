import 'reflect-metadata';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AuditedTransaction } from '../../src/audit/audited-transaction';
import { DEMO_USERS, seedDemoUsers } from '../../src/auth/demo-users';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';

describe('seed dos usuários de demonstração', () => {
  it('é idempotente, troca as senhas e revoga as sessões antigas', async () => {
    const app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
    try {
      const audited = app.get(AuditedTransaction);
      const login = (email: string, password: string) =>
        request(app.getHttpServer()).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
      const first = await seedDemoUsers(audited);
      const diego = first.find((u) => u.role === 'REQUESTER')!;
      const cookie = (await login(diego.email, diego.password).expect(204)).headers['set-cookie'] as unknown as string[];

      const second = await seedDemoUsers(audited);
      expect(second.every((u) => !u.created)).toBe(true);
      const again = second.find((u) => u.email === diego.email)!;
      expect(again.password).not.toBe(diego.password);
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie[0]!.split(';')[0]!).expect(401);
      await login(diego.email, diego.password).expect(401);
      await login(again.email, again.password).expect(204);

      const roles = await withClient('admin', async (db) =>
        (
          await db.query<{ email: string; code: string }>(
            `SELECT u.email, r.code FROM iam.users u JOIN iam.user_roles ur ON ur.user_id = u.id
               JOIN iam.roles r ON r.id = ur.role_id WHERE u.email = ANY($1) ORDER BY u.email`,
            [DEMO_USERS.map((u) => u.email)],
          )
        ).rows,
      );
      expect(roles).toHaveLength(DEMO_USERS.length);
    } finally {
      await app.close();
    }
  });
});
