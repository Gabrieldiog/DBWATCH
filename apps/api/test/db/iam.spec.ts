import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { sqlState, urlFor, withClient } from '../support/db';

const newEmail = () => `u-${randomUUID()}@dbwatch.test`;

async function createUser(client: Client, email = newEmail()): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO iam.users (email, display_name, password_hash) VALUES ($1, 'Teste', 'hash') RETURNING id",
    [email],
  );
  return rows[0]!.id;
}

describe('iam: integridade garantida pelo banco', () => {
  it('T-DB-01 e-mail é único sem diferenciar maiúsculas', async () => {
    await withClient('dbwatch_app', async (db) => {
      const email = newEmail();
      await createUser(db, email);
      expect(await sqlState(createUser(db, email.toUpperCase()))).toBe('23505');
    });
  });

  it('rejeita e-mail malformado e contador de falhas negativo', async () => {
    await withClient('dbwatch_app', async (db) => {
      expect(await sqlState(createUser(db, ' espaco@x.com'))).toBe('23514');
      expect(await sqlState(createUser(db, 'sem-arroba'))).toBe('23514');
      const id = await createUser(db);
      const update = db.query('UPDATE iam.users SET failed_login_count = -1 WHERE id = $1', [id]);
      expect(await sqlState(update)).toBe('23514');
    });
  });

  it('T-DB-02 usuário com papel não pode ser apagado (FK RESTRICT)', async () => {
    await withClient('dbwatch_migrator', async (db) => {
      const id = await createUser(db);
      await db.query('INSERT INTO iam.user_roles (user_id, role_id) VALUES ($1, 3)', [id]);
      expect(await sqlState(db.query('DELETE FROM iam.users WHERE id = $1', [id]))).toBe('23503');
    });
  });

  it('ninguém atribui papel a si mesmo', async () => {
    await withClient('dbwatch_app', async (db) => {
      const id = await createUser(db);
      const selfGrant = db.query(
        'INSERT INTO iam.user_roles (user_id, role_id, granted_by) VALUES ($1, 1, $1)',
        [id],
      );
      expect(await sqlState(selfGrant)).toBe('23514');
    });
  });

  it('catálogo versionado: 4 papéis e o ADMIN não lê a auditoria', async () => {
    await withClient('dbwatch_app', async (db) => {
      const { rows } = await db.query<{ code: string; perms: string[] }>(
        `SELECT r.code, array_agg(rp.permission_code ORDER BY rp.permission_code) AS perms
           FROM iam.roles r JOIN iam.role_permissions rp ON rp.role_id = r.id
          GROUP BY r.code`,
      );
      const byRole = Object.fromEntries(rows.map((r) => [r.code, r.perms]));
      expect(Object.keys(byRole).sort()).toEqual(['ADMIN', 'APPROVER', 'AUDITOR', 'REQUESTER']);
      expect(byRole.ADMIN).not.toContain('audit:read');
      expect(byRole.AUDITOR).toEqual(['audit:read', 'audit:verify', 'monitor:read']);
    });
  });
});

describe('T-DB-12 menor privilégio por papel', () => {
  it('dbwatch_app não apaga usuários, não altera o catálogo e não cria tabelas', async () => {
    await withClient('dbwatch_app', async (db) => {
      const denied = [
        'DELETE FROM iam.users',
        "INSERT INTO iam.permissions VALUES ('x:y', 'x')",
        'UPDATE iam.role_permissions SET role_id = 1',
        'CREATE TABLE iam.invasora (id int)',
      ];
      for (const sql of denied) expect(await sqlState(db.query(sql))).toBe('42501');
    });
  });

  it('dbwatch_monitor e dbwatch_lab não enxergam o schema iam', async () => {
    for (const role of ['dbwatch_monitor', 'dbwatch_lab'] as const) {
      await withClient(role, async (db) => {
        expect(await sqlState(db.query('SELECT 1 FROM iam.users LIMIT 1'))).toBe('42501');
      });
    }
  });

  it('dbwatch_target_ro não conecta no banco do produto e só lê o banco-alvo', async () => {
    expect(await sqlState(withClient('dbwatch_target_ro', async () => undefined))).toBe('42501');
    await withClient(
      'dbwatch_target_ro',
      async (db) => {
        expect(await sqlState(db.query('CREATE TABLE public.x (id int)'))).toBe('25006');
      },
      'dbwatch_target',
    );
  });
});

describe('migrations', () => {
  it('T-MIG-01 o banco migrado bate com o schema.prisma', () => {
    const diff = () =>
      execFileSync(
        'node_modules/.bin/prisma',
        ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
        { env: { ...process.env, MIGRATOR_DATABASE_URL: urlFor('dbwatch_migrator') }, stdio: 'pipe' },
      );
    expect(diff).not.toThrow();
  });
});
