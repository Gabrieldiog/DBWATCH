import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, hashToken } from '../../src/auth/credentials';
import { createApp, ORIGIN } from '../support/app';
import { urlFor, withClient } from '../support/db';

const PASSWORD = 'senha-de-teste-forte';
let passwordHash: string;

async function newUser(status = 'ACTIVE'): Promise<{ id: string; email: string }> {
  const email = `login-${randomUUID()}@dbwatch.test`;
  const { rows } = await withClient('admin', (db) =>
    db.query<{ id: string }>(
      'INSERT INTO iam.users (email, display_name, password_hash, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, 'Usuária de Teste', passwordHash, status],
    ),
  );
  await withClient('admin', (db) => db.query('INSERT INTO iam.user_roles (user_id, role_id) VALUES ($1, 3)', [rows[0]!.id]));
  return { id: rows[0]!.id, email };
}

const sql = <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
  withClient('admin', async (db) => (await db.query<T>(text, params)).rows);

const auditOf = (userId: string) =>
  sql<{ action: string; outcome: string; reason: string | null }>(
    'SELECT action, outcome::text, reason FROM audit.audit_log WHERE actor_id = $1 ORDER BY chain_position',
    [userId],
  );

describe('login com sessão no servidor', () => {
  let app: NestExpressApplication;
  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer()).post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });
  const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  const me = (cookie?: string) => {
    const req = request(app.getHttpServer()).get('/api/auth/me');
    return cookie ? req.set('Cookie', cookie) : req;
  };

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
    app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '1000' });
  });
  afterAll(() => app.close());

  it('T-AUTH-01 login certo devolve cookie HttpOnly e o banco guarda só o hash do token', async () => {
    const user = await newUser();
    const res = await login(user.email.toUpperCase()).expect(204);
    const raw = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    const token = cookieOf(res).split('=')[1]!;
    const [session] = await sql<{ token_hash: Buffer }>('SELECT token_hash FROM iam.sessions WHERE user_id = $1', [user.id]);
    expect(session!.token_hash.equals(Buffer.from(hashToken(token)))).toBe(true);
    expect(session!.token_hash.toString()).not.toContain(token);

    const profile = await me(cookieOf(res)).expect(200);
    expect(profile.body).toMatchObject({ id: user.id, email: user.email, roles: ['REQUESTER'] });
    expect(profile.body.permissions).toContain('request:create');
    expect(profile.body).not.toHaveProperty('passwordHash');
    expect(await auditOf(user.id)).toEqual([{ action: 'auth.login', outcome: 'SUCCESS', reason: null }]);
  });

  it('T-AUTH-02 senha errada e e-mail inexistente recebem a mesma resposta genérica', async () => {
    const user = await newUser();
    const wrong = await login(user.email, 'errada').expect(401);
    const unknown = await login(`ninguem-${randomUUID()}@dbwatch.test`).expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    expect(wrong.headers['set-cookie']).toBeUndefined();
    const [row] = await sql<{ failed_login_count: number }>('SELECT failed_login_count FROM iam.users WHERE id = $1', [user.id]);
    expect(row!.failed_login_count).toBe(1);
    expect(await auditOf(user.id)).toEqual([{ action: 'auth.login', outcome: 'DENIED', reason: 'senha_incorreta' }]);
  });

  it('T-AUTH-05 e-mail inexistente também paga o custo do Argon2 (tempo não revela quem existe)', async () => {
    const user = await newUser();
    const timed = async (email: string, password: string) => {
      const start = performance.now();
      await login(email, password).expect(401);
      return performance.now() - start;
    };
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 3; i++) {
      known.push(await timed(user.email, `errada-${i}`));
      unknown.push(await timed(`ninguem-${randomUUID()}@dbwatch.test`, 'x'));
    }
    expect(Math.min(...unknown)).toBeGreaterThan(Math.min(...known) * 0.5);
  });

  it('T-AUTH-03 e T-AUTH-04 tentativas erradas simultâneas não se perdem e a 5ª bloqueia a conta', async () => {
    const user = await newUser();
    const results = await Promise.all(Array.from({ length: 4 }, () => login(user.email, 'errada')));
    expect(results.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    await login(user.email, 'errada').expect(401);
    const [row] = await sql<{ failed_login_count: number; locked: boolean }>(
      'SELECT failed_login_count, locked_until > now() AS locked FROM iam.users WHERE id = $1',
      [user.id],
    );
    expect(row).toEqual({ failed_login_count: 5, locked: true });

    // Bloqueada, nem a senha certa entra
    await login(user.email).expect(423);
    const actions = (await auditOf(user.id)).map((e) => `${e.action}:${e.reason}`);
    expect(actions.filter((a) => a === 'auth.login:senha_incorreta')).toHaveLength(5);
    expect(actions).toContain('auth.account_locked:5_falhas_seguidas');
    expect(actions.at(-1)).toBe('auth.login:conta_bloqueada');

    // Passado o bloqueio, a senha certa entra e o contador volta a zero
    await sql("UPDATE iam.users SET locked_until = now() - interval '1 second' WHERE id = $1", [user.id]);
    await login(user.email).expect(204);
    const [after] = await sql<{ failed_login_count: number }>('SELECT failed_login_count FROM iam.users WHERE id = $1', [user.id]);
    expect(after!.failed_login_count).toBe(0);
  });

  it('conta desativada não entra, mesmo com a senha certa', async () => {
    const user = await newUser('DISABLED');
    await login(user.email).expect(401);
    expect((await auditOf(user.id)).at(-1)).toMatchObject({ outcome: 'DENIED', reason: 'conta_desativada' });
  });

  it('T-AUTH-06 /me nega sem sessão, com token inventado, após logout e com sessão expirada ou ociosa', async () => {
    await me().expect(401);
    await me('dbwatch_session=token-inventado').expect(401);

    const user = await newUser();
    const cookie = cookieOf(await login(user.email).expect(204));
    await me(cookie).expect(200);
    const out = await request(app.getHttpServer()).post('/api/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie).expect(204);
    expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/dbwatch_session=;/);
    await me(cookie).expect(401);
    const [revoked] = await sql<{ revoked: boolean }>('SELECT revoked_at IS NOT NULL AS revoked FROM iam.sessions WHERE user_id = $1', [user.id]);
    expect(revoked!.revoked).toBe(true);
    expect((await auditOf(user.id)).at(-1)).toMatchObject({ action: 'auth.logout', outcome: 'SUCCESS' });

    const idle = cookieOf(await login(user.email).expect(204));
    await sql("UPDATE iam.sessions SET last_seen_at = now() - interval '31 minutes' WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
    await me(idle).expect(401);

    const expired = cookieOf(await login(user.email).expect(204));
    await me(expired).expect(200);
    await sql(
      "UPDATE iam.sessions SET created_at = now() - interval '9 hours', expires_at = now() - interval '1 hour' WHERE token_hash = $1",
      [Buffer.from(hashToken(expired.split('=')[1]!))],
    );
    await me(expired).expect(401);
  });

  it('sessão de usuário desativado depois do login deixa de valer', async () => {
    const user = await newUser();
    const cookie = cookieOf(await login(user.email).expect(204));
    await sql("UPDATE iam.users SET status = 'DISABLED' WHERE id = $1", [user.id]);
    await me(cookie).expect(401);
  });

  it('T-SEC-04 POST sem Origin ou de outra origem é recusado (CSRF)', async () => {
    const user = await newUser();
    const server = app.getHttpServer();
    await request(server).post('/api/auth/login').send({ email: user.email, password: PASSWORD }).expect(403);
    const evil = await request(server)
      .post('/api/auth/login')
      .set('Origin', 'https://site-malicioso.example')
      .send({ email: user.email, password: PASSWORD })
      .expect(403);
    expect(evil.body.message).toBe('Origem não permitida');
    expect(await auditOf(user.id)).toEqual([]);
  });

  it('corpo inválido ou com campos extras vira 400', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'nao-e-email', password: 'x' }).expect(400);
    await request(server).post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'a@b.co', password: 'x', isAdmin: true }).expect(400);
  });

  it('T-AUTH-07 cookie plantado antes do login é ignorado e um token novo é emitido', async () => {
    const user = await newUser();
    const planted = 'dbwatch_session=token-escolhido-pelo-atacante';
    const res = await login(user.email).set('Cookie', planted).expect(204);
    expect(cookieOf(res)).not.toBe(planted);
    await me(planted).expect(401);
    await me(cookieOf(res)).expect(200);
  });

  it('a auditoria nunca guarda senha nem token', async () => {
    const user = await newUser();
    const token = cookieOf(await login(user.email).expect(204)).split('=')[1]!;
    await login(user.email, 'senha-errada-unica').expect(401);
    const rows = await sql<{ row: string }>('SELECT row_to_json(a)::text AS row FROM audit.audit_log a WHERE actor_id = $1', [user.id]);
    const dump = rows.map((r) => r.row).join('\n');
    expect(dump).not.toContain(PASSWORD);
    expect(dump).not.toContain('senha-errada-unica');
    expect(dump).not.toContain(token);
  });
});

describe('limite de tentativas e logs', () => {
  it('excesso de tentativas por IP recebe 429; T-AUTH-08 os logs não têm senha, token nem cookie', async () => {
    passwordHash ??= await hashPassword(PASSWORD);
    const user = await newUser();
    const app = await createApp(urlFor('dbwatch_app'), { LOGIN_RATE_LIMIT: '3' });
    const lines: string[] = [];
    const capture = (...args: unknown[]) => void lines.push(args.map((a) => JSON.stringify(a)).join(' '));
    app.useLogger({ log: capture, error: capture, warn: capture, debug: capture, verbose: capture, fatal: capture });
    try {
      const attempt = (password: string) =>
        request(app.getHttpServer()).post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password });
      const ok = await attempt(PASSWORD);
      const token = (ok.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!.split('=')[1]!;
      const statuses = [ok.status, (await attempt('errada-no-log')).status, (await attempt('x')).status, (await attempt('y')).status];
      expect(statuses).toEqual([204, 401, 401, 429]);
      expect(lines.join('\n')).toMatch(/Limite de tentativas/);
      for (const secret of [PASSWORD, 'errada-no-log', token]) expect(lines.join('\n')).not.toContain(secret);
    } finally {
      await app.close();
    }
  });
});
