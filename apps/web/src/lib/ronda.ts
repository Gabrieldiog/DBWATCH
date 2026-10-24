export type MarkKind = 'up' | 'down' | 'unreachable' | 'gap';
export type Mark = { seq: number; kind: MarkKind; latencyMs?: number; at?: number };

export const MAX_MARKS = 60;

// Escala logarítmica de 0 a 1 s: picos de 70 ms e de 400 ms precisam ter alturas diferentes
export function barHeight(mark: Mark): number {
  if (mark.kind === 'gap') return 3;
  if (mark.kind !== 'up') return 56;
  const ms = Math.max(0, mark.latencyMs ?? 0);
  return Math.min(56, Math.round(8 + 16 * Math.log10(1 + ms)));
}

// "há 5 min" só é verdade com a faixa cheia; antes disso, mostra a hora real da primeira leitura
export function axisStart(marks: Mark[], format: (at: number) => string): string {
  const first = marks.find((m) => m.at !== undefined);
  if (marks.length >= MAX_MARKS || !first?.at) return marks.length >= MAX_MARKS ? 'há 5 min' : '';
  return format(first.at);
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
