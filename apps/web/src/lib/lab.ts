import type { Tone } from './pam';

// Formato devolvido pela API do laboratório (um passo por comando, com o tempo medido no servidor)
export type Step = { at: number; session: 'A' | 'B'; sql?: string; note?: string; ms?: number; result?: 'ok' | 'erro'; sqlstate?: string; rows?: Record<string, unknown>[] };
export type Run = { id: number; scenario: string; outcome: string; steps: Step[] };
export type Scenario = { name: string; title: string };
export type RunRow = { id: number; scenario: string; startedAt: string; outcome: string; steps: number };

export const OUTCOME: Record<string, [string, Tone]> = {
  OK: ['Comportamento confirmado no banco', 'ok'],
  FAILED: ['O banco não se comportou como o esperado', 'bad'],
};

const SQLSTATE: Record<string, string> = {
  '23514': 'a CHECK barrou',
  '40P01': 'deadlock: o PostgreSQL derrubou esta sessão',
  '40001': 'conflito de serialização',
  '55P03': 'desistiu de esperar o lock',
};

// Um passo que levou 1 s ou mais quase sempre ficou parado esperando lock: a tela destaca
export const slow = (s: Step) => (s.ms ?? 0) >= 1_000;

export function outcomeOf(s: Step): string {
  const took = `${s.ms} ms${slow(s) ? ', esperando' : ''}`;
  if (s.result === 'erro') return `erro ${s.sqlstate} (${SQLSTATE[s.sqlstate ?? ''] ?? 'veja o código no manual do PostgreSQL'}) em ${took}`;
  return `ok em ${took}`;
}

// O que o SELECT enxergou é a prova do experimento: "saldo 100" e depois "saldo 70"
export const rowsText = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' · ')).join(' / ');

// O que cada experimento prova, em linguagem de sala de aula, com um exemplo do mundo real
export const CONCEPT: Record<string, string> = {
  'transferencia-falha':
    'Atomicidade: a transação é tudo ou nada. O crédito no Bruno já tinha acontecido, mas a CHECK barrou o débito na Ana e o ROLLBACK desfez os dois. Na vida real, um Pix que falha no meio não pode criar dinheiro do nada.',
  'espera-de-lock':
    'Lock de linha: quem altera uma linha segura o lock até o COMMIT, e a outra transação espera em vez de sobrescrever. Por isso a Ana termina com 70 (100 − 10 − 20): nenhuma atualização se perde, como dois caixas mexendo na mesma conta.',
  deadlock:
    'Deadlock: cada sessão espera um lock que a outra segura. O PostgreSQL detecta o ciclo em cerca de 1 s (deadlock_timeout) e derruba uma vítima com 40P01. A aplicação precisa tentar de novo a transação derrubada.',
  'leitura-nao-repetivel':
    'Níveis de isolamento: em READ COMMITTED cada comando vê o que já foi confirmado, então a mesma leitura muda no meio da transação. Em REPEATABLE READ a transação inteira enxerga a mesma foto, como um relatório que precisa fechar a conta.',
  indices:
    'Índices: sem índice, o banco lê a tabela inteira para achar uma hora de leituras. O B-tree vai direto às linhas e lê poucas páginas, mas ocupa megabytes. O BRIN guarda só o mínimo e o máximo de cada faixa de páginas: lê um pouco a mais e cabe em kilobytes, ótimo para dados que chegam em ordem, como logs e sensores.',
  'write-skew':
    'Write skew: cada transação lê que há 2 de plantão e tira uma pessoa diferente. Nenhum lock é disputado, então em READ COMMITTED a regra quebra sem erro. Em SERIALIZABLE o PostgreSQL percebe a dependência e derruba uma com 40001.',
};
