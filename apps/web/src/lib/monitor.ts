// Formatos do monitor; tudo puro para ser testado sem navegador
export type Overview = {
  sampledAt: string | null;
  active: number;
  idle: number;
  idleInTransaction: number;
  waitingOnLock: number;
  blockedPairs: number;
};
// O pg devolve bigint e numeric como texto; null = contador zerou entre amostras (reinício), nunca taxa negativa
export type RawPoint = { sampledAt: string; commits: string | null; rollbacks: string | null; cacheHitPct: string | null };
export type Point = { t: string; v: number | null };

export const pick = (rows: RawPoint[], key: 'commits' | 'rollbacks' | 'cacheHitPct'): Point[] =>
  rows.map((r) => ({ t: r.sampledAt, v: r[key] === null ? null : Number(r[key]) }));

// Coleta parada = três intervalos sem amostra nova; o monitor diz isso em vez de mostrar número velho
export function staleFor(sampledAt: string | null, now: number, everySeconds: number): number | null {
  if (!sampledAt) return null;
  const age = Math.round((now - Date.parse(sampledAt)) / 1000);
  return age > everySeconds * 3 ? age : 0;
}

// Linha do gráfico em coordenadas do SVG; um null quebra a linha em vez de inventar o ponto
export function linePath(points: Point[], width: number, height: number, max: number): string {
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  let d = '';
  let pen = 'M';
  points.forEach((p, i) => {
    if (p.v === null) return void (pen = 'M');
    d += `${pen}${(i * step).toFixed(1)} ${(height - (p.v / max) * height).toFixed(1)}`;
    pen = 'L';
  });
  return d;
}

// Teto do eixo arredondado para cima (1, 2 ou 5 vezes uma potência de 10), nunca abaixo de 1
export function niceMax(values: (number | null)[]): number {
  const top = Math.max(1, ...values.filter((v): v is number => v !== null));
  const pow = 10 ** Math.floor(Math.log10(top));
  return [1, 2, 5, 10].map((m) => m * pow).find((m) => m >= top)!;
}

export function summary(points: Point[], unit: string): string {
  const values = points.map((p) => p.v).filter((v): v is number => v !== null);
  if (!values.length) return 'Sem amostras no período.';
  return `Último intervalo: ${values.at(-1)} ${unit}. Máximo no período: ${Math.max(...values)} ${unit}.`;
}

const TIME = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium', timeZone: 'America/Sao_Paulo' });
export const time = (iso: string) => TIME.format(new Date(iso));
