import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sqlState, withClient } from '../support/db';

const insertSession = (tokenBytes: number) =>
  withClient('dbwatch_app', async (db) => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO iam.users (email, display_name, password_hash) VALUES ($1, 'Sessão', 'hash') RETURNING id",
      [`s-${randomBytes(6).toString('hex')}@dbwatch.test`],
    );
    return db.query(
      "INSERT INTO iam.sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour') RETURNING id",
      [rows[0]!.id, randomBytes(tokenBytes)],
    );
  });

describe('iam.sessions: regras no banco', () => {
  it('só aceita hash SHA-256 (32 bytes), nunca o token em si', async () => {
    expect(await sqlState(insertSession(32))).toBeUndefined();
    expect(await sqlState(insertSession(43))).toBe('23514');
  });

  it('o papel da API não apaga sessões: logout é revogação, o histórico fica', async () => {
    const { rows } = await insertSession(32);
    await withClient('dbwatch_app', async (db) => {
      expect(await sqlState(db.query('DELETE FROM iam.sessions WHERE id = $1', [rows[0].id]))).toBe('42501');
    });
  });

  it('expiração antes da criação é rejeitada', async () => {
    const { rows } = await insertSession(32);
    await withClient('dbwatch_app', async (db) => {
      const update = db.query("UPDATE iam.sessions SET expires_at = created_at - interval '1 second' WHERE id = $1", [rows[0].id]);
      expect(await sqlState(update)).toBe('23514');
    });
  });
});
