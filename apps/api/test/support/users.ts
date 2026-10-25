import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../../src/auth/credentials';
import { ORIGIN } from './app';
import { withClient } from './db';

export const TEST_PASSWORD = 'senha-de-teste-forte';
let hash: Promise<string> | undefined;

// Cria um usuário com os papéis pedidos e devolve o cookie de uma sessão nova
export async function loginAs(app: NestExpressApplication, roles: string[]): Promise<{ id: string; email: string; cookie: string }> {
  hash ??= hashPassword(TEST_PASSWORD);
  const email = `${roles.join('-').toLowerCase() || 'sem-papel'}-${randomUUID()}@dbwatch.test`;
  const id = await withClient('admin', async (db) => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO iam.users (email, display_name, password_hash) VALUES ($1, 'Teste', $2) RETURNING id",
      [email, await hash],
    );
    await db.query('INSERT INTO iam.user_roles (user_id, role_id) SELECT $1, id FROM iam.roles WHERE code = ANY($2)', [rows[0]!.id, roles]);
    return rows[0]!.id;
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password: TEST_PASSWORD });
  return { id, email, cookie: (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]! };
}
