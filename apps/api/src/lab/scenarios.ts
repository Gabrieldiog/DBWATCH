import type { LabRecorder } from './lab-recorder';

const BALANCES = 'SELECT id, owner, balance::float AS saldo FROM lab.accounts ORDER BY id';
const MOVE = (delta: number, id: number) => `UPDATE lab.accounts SET balance = balance ${delta < 0 ? '-' : '+'} ${Math.abs(delta)} WHERE id = ${id}`;

export interface Scenario {
  title: string;
  // Devolve se o comportamento esperado aconteceu de verdade no banco
  run(lab: LabRecorder): Promise<boolean>;
}

const ON_DUTY = 'SELECT count(*)::int AS n FROM lab.on_call WHERE on_duty';

// Lê o saldo da Ana duas vezes na mesma transação enquanto B muda o valor no meio
async function readTwice(lab: LabRecorder, level: string): Promise<boolean> {
  await lab.run('B', 'UPDATE lab.accounts SET balance = 100 WHERE id = 1');
  await lab.run('A', `BEGIN ISOLATION LEVEL ${level}`);
  const first = await lab.run('A', 'SELECT balance::float AS saldo FROM lab.accounts WHERE id = 1');
  await lab.run('B', MOVE(-30, 1));
  const second = await lab.run('A', 'SELECT balance::float AS saldo FROM lab.accounts WHERE id = 1');
  await lab.run('A', 'COMMIT');
  return first.rows[0]?.saldo === second.rows[0]?.saldo;
}

// Ana e Bruno de plantão; cada um confere que há 2 e sai. Linhas diferentes: nenhum lock segura a regra
async function bothLeave(lab: LabRecorder, level: string): Promise<{ left: number; failed: number }> {
  await lab.run('A', "UPDATE lab.on_call SET on_duty = true");
  for (const s of ['A', 'B'] as const) {
    await lab.run(s, `BEGIN ISOLATION LEVEL ${level}`);
    await lab.run(s, ON_DUTY);
  }
  const results = [await lab.run('A', 'UPDATE lab.on_call SET on_duty = false WHERE id = 1'), await lab.run('B', 'UPDATE lab.on_call SET on_duty = false WHERE id = 2')];
  results.push(await lab.run('A', 'COMMIT'), await lab.run('B', 'COMMIT'));
  const { rows } = await lab.run('A', ON_DUTY);
  return { left: Number(rows[0]?.n), failed: results.filter((r) => r.sqlstate === '40001').length };
}

// Contas começam sempre em Ana = 100 e Bruno = 50
export const SCENARIOS: Record<string, Scenario> = {
  'transferencia-falha': {
    title: 'Transferência de 150 com saldo 100: a CHECK barra e o ROLLBACK desfaz o crédito já feito',
    async run(lab) {
      await lab.run('A', 'BEGIN');
      await lab.run('A', MOVE(150, 2));
      const debit = await lab.run('A', MOVE(-150, 1));
      await lab.run('A', 'ROLLBACK');
      const { rows } = await lab.run('B', BALANCES);
      return debit.sqlstate === '23514' && rows[0]?.saldo === 100 && rows[1]?.saldo === 50;
    },
  },
  'espera-de-lock': {
    title: 'A e B atualizam a mesma linha: B espera A confirmar, e nenhuma atualização se perde',
    async run(lab) {
      await lab.run('A', 'BEGIN');
      await lab.run('A', MOVE(-10, 1));
      const blocked = lab.run('B', MOVE(-20, 1));
      await lab.waitForLock('B');
      await lab.pause(1_500);
      await lab.run('A', 'COMMIT');
      const b = await blocked;
      const { rows } = await lab.run('A', BALANCES);
      const waited = lab.steps.find((s) => s.session === 'B' && s.sql === MOVE(-20, 1))?.ms ?? 0;
      return !b.sqlstate && rows[0]?.saldo === 70 && waited >= 1_500;
    },
  },
  deadlock: {
    title: 'A trava Ana e B trava Bruno; cada um pede a do outro: o PostgreSQL derruba exatamente um (40P01)',
    async run(lab) {
      await lab.run('A', 'BEGIN');
      await lab.run('B', 'BEGIN');
      await lab.run('A', MOVE(-10, 1));
      await lab.run('B', MOVE(-10, 2));
      const aWaits = lab.run('A', MOVE(10, 2));
      await lab.waitForLock('A');
      const b = await lab.run('B', MOVE(10, 1));
      const a = await aWaits;
      await lab.run('A', a.sqlstate ? 'ROLLBACK' : 'COMMIT');
      await lab.run('B', b.sqlstate ? 'ROLLBACK' : 'COMMIT');
      return [a, b].filter((r) => r.sqlstate === '40P01').length === 1;
    },
  },
  'leitura-nao-repetivel': {
    title: 'A lê o mesmo saldo duas vezes enquanto B altera: muda em READ COMMITTED, não muda em REPEATABLE READ',
    async run(lab) {
      lab.note('A', 'Variante 1: READ COMMITTED (cada comando vê o que já foi confirmado)');
      const sameInReadCommitted = await readTwice(lab, 'READ COMMITTED');
      lab.note('A', 'Variante 2: REPEATABLE READ (a transação inteira vê a mesma foto)');
      const sameInRepeatableRead = await readTwice(lab, 'REPEATABLE READ');
      return !sameInReadCommitted && sameInRepeatableRead;
    },
  },
  'write-skew': {
    title: 'Regra "sempre alguém de plantão": quebra em READ COMMITTED; em SERIALIZABLE o banco derruba um (40001)',
    async run(lab) {
      lab.note('A', 'Variante 1: READ COMMITTED');
      const rc = await bothLeave(lab, 'READ COMMITTED');
      lab.note('A', `Ficaram ${rc.left} de plantão: a regra quebrou sem nenhum erro`);
      lab.note('A', 'Variante 2: SERIALIZABLE');
      const ser = await bothLeave(lab, 'SERIALIZABLE');
      lab.note('A', `Ficaram ${ser.left} de plantão; transações derrubadas com 40001: ${ser.failed}`);
      return rc.left === 0 && ser.left === 1 && ser.failed === 1;
    },
  },
};
