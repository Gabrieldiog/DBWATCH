import { describe, expect, it } from 'vitest';
import { linePath, niceMax, pick, staleFor, summary } from '../src/lib/monitor';

describe('monitor (unitário)', () => {
  it('converte o texto do pg em número e mantém o null do contador reiniciado', () => {
    const rows = [{ sampledAt: 't1', commits: '12', rollbacks: null, cacheHitPct: '99.5' }];
    expect(pick(rows, 'commits')).toEqual([{ t: 't1', v: 12 }]);
    expect(pick(rows, 'rollbacks')).toEqual([{ t: 't1', v: null }]);
  });

  it('coleta parada só depois de três intervalos sem amostra', () => {
    const now = Date.parse('2026-11-11T13:00:20Z');
    expect(staleFor(null, now, 5)).toBeNull();
    expect(staleFor('2026-11-11T13:00:05Z', now, 5)).toBe(0);
    expect(staleFor('2026-11-11T13:00:00Z', now, 5)).toBe(20);
  });

  it('um null quebra a linha em vez de ligar os pontos vizinhos', () => {
    const points = [3, null, 6, 0].map((v, i) => ({ t: String(i), v }));
    expect(linePath(points, 300, 100, 6)).toBe('M0.0 50.0M200.0 0.0L300.0 100.0');
  });

  it('teto do eixo arredondado e nunca abaixo de 1', () => {
    expect([[0], [null], [3], [7], [12], [480]].map(niceMax)).toEqual([1, 1, 5, 10, 20, 500]);
  });

  it('resumo para leitor de tela', () => {
    const points = [4, 9, 2].map((v, i) => ({ t: String(i), v }));
    expect(summary(points, 'commits')).toBe('Último intervalo: 2 commits. Máximo no período: 9 commits.');
    expect(summary([], 'commits')).toBe('Sem amostras no período.');
  });
});
