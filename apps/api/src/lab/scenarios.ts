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

// Uma hora de leituras (300 linhas de 200 mil); o mesmo SELECT nos três caminhos, com o plano real do PostgreSQL
const HOUR = "lida_em >= '2026-10-15 10:00:00-03' AND lida_em < '2026-10-15 11:00:00-03'";
type PlanNode = { 'Node Type': string; 'Index Name'?: string; 'Shared Hit Blocks'?: number; 'Shared Read Blocks'?: number; Plans?: PlanNode[] };
const nodes = (n: PlanNode): PlanNode[] => [n, ...(n.Plans ?? []).flatMap(nodes)];

async function measure(lab: LabRecorder, label: string, table: string, on: string[]) {
  // Um passo só com os três parâmetros do planejador (valem só nesta sessão); a tela mostra o que ficou ligado
  const flags = ['seqscan', 'indexscan', 'bitmapscan'].map((f) => `set_config('enable_${f}', '${on.includes(`enable_${f}`) ? 'on' : 'off'}', false) AS ${f}`);
  await lab.run('A', `SELECT ${flags.join(', ')}`);
  const { rows } = await lab.run('A', `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(*), round(avg(valor), 2) FROM lab.${table} WHERE ${HOUR}`);
  const [plan] = rows[0]?.['QUERY PLAN'] as [{ Plan: PlanNode; 'Execution Time': number }];
  const all = nodes(plan.Plan);
  const pages = (plan.Plan['Shared Hit Blocks'] ?? 0) + (plan.Plan['Shared Read Blocks'] ?? 0);
  const path = all.map((n) => n['Node Type'] + (n['Index Name'] ? ` (${n['Index Name']})` : '')).join(' → ');
  lab.note('A', `${label}: ${path}; ${plan['Execution Time'].toFixed(2)} ms e ${pages} páginas lidas`);
  return { types: all.map((n) => n['Node Type']), indexes: all.map((n) => n['Index Name']), pages };
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
      // O papel do lab desiste de lock em 5 s; só esta sessão B aceita esperar mais, e isso aparece na linha do tempo
      await lab.run('B', "SET lock_timeout = '10s'");
      await lab.run('A', 'BEGIN');
      await lab.run('A', MOVE(-10, 1));
      const blocked = lab.run('B', MOVE(-20, 1));
      await lab.waitForLock('B');
      // 6 s: mais que o intervalo de 5 s do coletor, para o grafo do monitor pegar o bloqueio ao vivo
      await lab.pause(6_000);
      await lab.run('A', 'COMMIT');
      const b = await blocked;
      const { rows } = await lab.run('A', BALANCES);
      const waited = lab.steps.find((s) => s.session === 'B' && s.sql === MOVE(-20, 1))?.ms ?? 0;
      return !b.sqlstate && rows[0]?.saldo === 70 && waited >= 6_000;
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
  indices: {
    title: 'Uma hora de leituras em 200 mil: sem índice, com B-tree e com BRIN (EXPLAIN ANALYZE de verdade)',
    async run(lab) {
      lab.note('A', 'A mesma consulta nos três caminhos; o planejador é forçado com enable_seqscan, enable_indexscan e enable_bitmapscan');
      const seq = await measure(lab, 'Sem índice', 'leituras', ['enable_seqscan']);
      const btree = await measure(lab, 'B-tree', 'leituras', ['enable_indexscan']);
      const brin = await measure(lab, 'BRIN', 'leituras_brin', ['enable_bitmapscan']);
      const { rows } = await lab.run(
        'A',
        `SELECT pg_size_pretty(pg_relation_size('lab.leituras')) AS tabela,
                pg_size_pretty(pg_relation_size('lab.leituras_lida_em_btree')) AS btree,
                pg_size_pretty(pg_relation_size('lab.leituras_brin_lida_em_brin')) AS brin,
                pg_relation_size('lab.leituras_brin_lida_em_brin') < pg_relation_size('lab.leituras_lida_em_btree') / 10 AS brin_menor`,
      );
      return (
        seq.types.includes('Seq Scan') &&
        btree.indexes.includes('leituras_lida_em_btree') &&
        brin.indexes.includes('leituras_brin_lida_em_brin') &&
        btree.pages < seq.pages / 10 &&
        brin.pages < seq.pages / 2 &&
        rows[0]?.brin_menor === true
      );
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
