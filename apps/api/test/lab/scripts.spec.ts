import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { urlFor, withClient } from '../support/db';

type Block = { session: 'A' | 'B'; waits: boolean; sql: string };

// Lê os blocos "-- [A] 1" / "-- [B] 2 (fica esperando)" exatamente como uma pessoa faria nos dois terminais
function blocks(file: string): Block[] {
  const text = readFileSync(resolve(process.cwd(), '../../infra/lab', file), 'utf8');
  return text.split(/^(?=-- \[[AB]\])/m).slice(1).map((chunk) => ({
    session: chunk.startsWith('-- [A]') ? 'A' : 'B',
    waits: chunk.split('\n')[0]!.includes('(fica esperando)'),
    sql: chunk.split('\n').filter((l) => !l.startsWith('--')).join('\n').trim(),
  }));
}

async function play(file: string): Promise<string[]> {
  const [a, b] = [new Client(urlFor('dbwatch_lab')), new Client(urlFor('dbwatch_lab'))];
  await Promise.all([a.connect(), b.connect()]);
  const errors: string[] = [];
  const pending: Promise<unknown>[] = [];
  const exec = (c: Client, sql: string) => c.query(sql).catch((err: { code?: string }) => void errors.push(err.code ?? '?'));
  try {
    await a.query(readFileSync(resolve(process.cwd(), '../../infra/lab/00-preparar.sql'), 'utf8'));
    for (const block of blocks(file)) {
      const [me, other] = block.session === 'A' ? [a, b] : [b, a];
      if (!block.waits) {
        await exec(me, block.sql);
        continue;
      }
      const pid = (await me.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending.push(exec(me, block.sql));
      for (let i = 0; i < 100; i++) {
        if ((await other.query("SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [pid])).rowCount) break;
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    await Promise.all(pending);
    return errors;
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
}

const read = async (sql: string) => (await withClient('admin', (db) => db.query(sql))).rows.map((r) => Object.values(r)[0]);

describe('LAB: os scripts de infra/lab rodam como prometem, em dois terminais', () => {
  it('01 transferência: 23514 e saldos intactos', async () => {
    expect(await play('01-transferencia-falha.sql')).toEqual(['23514']);
    expect(await read('SELECT balance::float FROM lab.accounts ORDER BY id')).toEqual([100, 50]);
  });

  it('02 espera de lock: B destrava no COMMIT de A e a Ana fica com 70', async () => {
    expect(await play('02-espera-de-lock.sql')).toEqual([]);
    expect(await read('SELECT balance::float FROM lab.accounts WHERE id = 1')).toEqual([70]);
  });

  it('03 deadlock: exatamente um 40P01', async () => {
    expect(await play('03-deadlock.sql')).toEqual(['40P01']);
  });

  it('04 leitura não repetível: roda sem erro e termina em 40 (100 - 30 - 30)', async () => {
    expect(await play('04-leitura-nao-repetivel.sql')).toEqual([]);
    expect(await read('SELECT balance::float FROM lab.accounts WHERE id = 1')).toEqual([40]);
  });

  it('05 write skew: um 40001 na parte SERIALIZABLE e 1 pessoa de plantão no fim', async () => {
    expect(await play('05-write-skew.sql')).toEqual(['40001']);
    expect(await read('SELECT count(*)::int FROM lab.on_call WHERE on_duty')).toEqual([1]);
  });
});
