import type { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { sqlState, withClient } from '../support/db';

async function insertAudit(db: Client, action = 'test.audit'): Promise<number> {
  const { rows } = await db.query<{ chain_position: string }>(
    "INSERT INTO audit.audit_log (action, outcome) VALUES ($1, 'SUCCESS') RETURNING chain_position",
    [action],
  );
  return Number(rows[0]!.chain_position);
}

const verify = (db: Client) =>
  db
    .query<{ broken: string | null }>('SELECT first_broken_position AS broken FROM audit.verify_chain()')
    .then((r) => (r.rows[0]!.broken === null ? null : Number(r.rows[0]!.broken)));

describe('auditoria: append-only garantido pelo banco', () => {
  it('T-DB-07 nem o dono da tabela consegue UPDATE ou DELETE (trigger)', async () => {
    await withClient('dbwatch_migrator', async (db) => {
      await insertAudit(db);
      await expect(db.query("UPDATE audit.audit_log SET reason = 'x'")).rejects.toThrow(/append-only/);
      await expect(db.query('DELETE FROM audit.audit_log')).rejects.toThrow(/append-only/);
    });
  });

  it('T-DB-08 TRUNCATE é barrado pelo trigger', async () => {
    await withClient('dbwatch_migrator', async (db) => {
      await expect(db.query('TRUNCATE audit.audit_log')).rejects.toThrow(/append-only: TRUNCATE/);
    });
  });

  it('T-DB-09 dbwatch_app só insere e lê; monitor só lê', async () => {
    await withClient('dbwatch_app', async (db) => {
      await insertAudit(db);
      for (const sql of ['UPDATE audit.audit_log SET reason = NULL', 'DELETE FROM audit.audit_log']) {
        await expect(db.query(sql)).rejects.toThrow(/permission denied/);
      }
    });
    await withClient('dbwatch_monitor', async (db) => {
      await db.query('SELECT count(*) FROM audit.audit_log');
      expect(await sqlState(insertAudit(db))).toBe('42501');
    });
  });

  it('valida o formato da ação, o ator e os metadados', async () => {
    await withClient('dbwatch_app', async (db) => {
      expect(await sqlState(insertAudit(db, 'SemPonto'))).toBe('23514');
      const unknownActor = db.query(
        "INSERT INTO audit.audit_log (actor_id, action, outcome) VALUES (gen_random_uuid(), 'a.b', 'SUCCESS')",
      );
      expect(await sqlState(unknownActor)).toBe('23503');
      const arrayMeta = db.query(
        "INSERT INTO audit.audit_log (action, outcome, metadata) VALUES ('a.b', 'SUCCESS', '[1]')",
      );
      expect(await sqlState(arrayMeta)).toBe('23514');
    });
  });
});

describe('auditoria: cadeia de hash', () => {
  it('T-DB-10 superusuário adultera e o verificador aponta a linha exata, em qualquer fuso', async () => {
    const positions = await withClient('dbwatch_app', async (db) => [
      await insertAudit(db),
      await insertAudit(db),
      await insertAudit(db),
    ]);
    await withClient('admin', async (db) => {
      expect(await verify(db)).toBeNull();
      // DDL é transacional no PostgreSQL: a adulteração inteira é desfeita no ROLLBACK
      await db.query('BEGIN');
      try {
        await db.query('ALTER TABLE audit.audit_log DISABLE TRIGGER audit_log_no_update_delete');
        await db.query("SET LOCAL TimeZone = 'Asia/Tokyo'");
        await db.query("UPDATE audit.audit_log SET outcome = 'DENIED' WHERE chain_position = $1", [positions[1]]);
        expect(await verify(db)).toBe(positions[1]);
      } finally {
        await db.query('ROLLBACK');
      }
      expect(await verify(db)).toBeNull();
    });
  });

  it('T-DB-10 apagar uma linha do meio quebra o elo seguinte', async () => {
    const positions = await withClient('dbwatch_app', async (db) => [await insertAudit(db), await insertAudit(db)]);
    await withClient('admin', async (db) => {
      await db.query('BEGIN');
      try {
        await db.query('ALTER TABLE audit.audit_log DISABLE TRIGGER audit_log_no_update_delete');
        await db.query('DELETE FROM audit.audit_log WHERE chain_position = $1', [positions[0]]);
        expect(await verify(db)).toBe(positions[1]);
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });

  it('T-DB-11 a inserção é recusada fora de READ COMMITTED', async () => {
    await withClient('dbwatch_app', async (db) => {
      await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      expect(await sqlState(insertAudit(db))).toBe('25000');
      await db.query('ROLLBACK');
    });
  });

  it('T-DB-11 20 inserções concorrentes em 4 conexões formam uma cadeia contínua', async () => {
    const workers = Array.from({ length: 4 }, () =>
      withClient('dbwatch_app', async (db) => {
        const mine: number[] = [];
        for (let i = 0; i < 5; i++) mine.push(await insertAudit(db, 'test.concurrent'));
        return mine;
      }),
    );
    const positions = (await Promise.all(workers)).flat().sort((a, b) => a - b);
    expect(new Set(positions).size).toBe(20);
    expect(positions.at(-1)! - positions[0]!).toBe(19);
    await withClient('dbwatch_app', async (db) => expect(await verify(db)).toBeNull());
  });
});
