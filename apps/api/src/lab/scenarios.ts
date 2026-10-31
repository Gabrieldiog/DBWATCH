import type { LabRecorder } from './lab-recorder';

const BALANCES = 'SELECT id, owner, balance::float AS saldo FROM lab.accounts ORDER BY id';
const MOVE = (delta: number, id: number) => `UPDATE lab.accounts SET balance = balance ${delta < 0 ? '-' : '+'} ${Math.abs(delta)} WHERE id = ${id}`;

export interface Scenario {
  title: string;
  // Devolve se o comportamento esperado aconteceu de verdade no banco
  run(lab: LabRecorder): Promise<boolean>;
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
};
