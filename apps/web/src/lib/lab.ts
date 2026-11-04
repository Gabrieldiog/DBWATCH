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
