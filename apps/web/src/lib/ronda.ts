export type MarkKind = 'up' | 'down' | 'unreachable' | 'gap';
export type Mark = { seq: number; kind: MarkKind; latencyMs?: number };

export const MAX_MARKS = 60;

// Escala logarítmica: 1 ms e 400 ms precisam caber na mesma faixa de 64px
export function barHeight(mark: Mark): number {
  if (mark.kind === 'gap') return 4;
  if (mark.kind !== 'up') return 56;
  const ms = Math.max(0, mark.latencyMs ?? 0);
  return Math.min(56, Math.round(8 + 8 * Math.log2(1 + ms)));
}

export function pushMark(marks: Mark[], mark: Mark): Mark[] {
  // Dois vãos seguidos não dizem nada novo: a aba só ficou escondida mais tempo
  if (mark.kind === 'gap' && marks.at(-1)?.kind === 'gap') return marks;
  return [...marks, mark].slice(-MAX_MARKS);
}

export function summarize(marks: Mark[]): { up: number; failed: number } {
  return {
    up: marks.filter((m) => m.kind === 'up').length,
    failed: marks.filter((m) => m.kind === 'down' || m.kind === 'unreachable').length,
  };
}
