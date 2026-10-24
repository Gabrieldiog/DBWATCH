import { describe, expect, it } from 'vitest';
import { axisStart, barHeight, MAX_MARKS, type Mark, pushMark, summarize } from '../src/lib/ronda';

const up = (seq: number, latencyMs = 1): Mark => ({ seq, kind: 'up', latencyMs });

describe('barHeight (unitário)', () => {
  it('cresce com a latência sem estourar a faixa', () => {
    expect(barHeight(up(1, 1))).toBeLessThan(barHeight(up(2, 50)));
    expect(barHeight(up(3, 100_000))).toBe(56);
    expect(barHeight(up(4, -5))).toBe(8);
  });

  it('não satura antes de 1 s: picos de 70 ms e 400 ms têm alturas diferentes', () => {
    expect(barHeight(up(1, 70))).toBeLessThan(barHeight(up(2, 400)));
    expect(barHeight(up(3, 400))).toBeLessThan(56);
    expect(barHeight(up(4, 999))).toBe(56);
  });

  it('falha ocupa a altura toda e o vão quase nada', () => {
    expect(barHeight({ seq: 1, kind: 'down' })).toBe(56);
    expect(barHeight({ seq: 2, kind: 'unreachable' })).toBe(56);
    expect(barHeight({ seq: 3, kind: 'gap' })).toBe(3);
  });
});

describe('pushMark (unitário)', () => {
  it('guarda só as últimas 60 leituras', () => {
    let marks: Mark[] = [];
    for (let i = 1; i <= 75; i++) marks = pushMark(marks, up(i));
    expect(marks).toHaveLength(MAX_MARKS);
    expect(marks[0]!.seq).toBe(16);
  });

  it('não empilha dois vãos seguidos e não altera o array original', () => {
    const before = [up(1), { seq: 2, kind: 'gap' } as Mark];
    const after = pushMark(before, { seq: 3, kind: 'gap' });
    expect(after).toBe(before);
    expect(pushMark(before, up(4))).not.toBe(before);
    expect(before).toHaveLength(2);
  });
});

describe('summarize (unitário)', () => {
  it('conta leituras no ar e com falha, ignorando vãos', () => {
    const marks: Mark[] = [up(1), { seq: 2, kind: 'down' }, { seq: 3, kind: 'gap' }, { seq: 4, kind: 'unreachable' }, up(5)];
    expect(summarize(marks)).toEqual({ up: 2, failed: 2 });
  });
});

describe('axisStart (unitário)', () => {
  const fmt = (at: number) => `t${at}`;
  it('mostra a hora da primeira leitura enquanto a faixa não está cheia', () => {
    expect(axisStart([{ seq: 1, kind: 'up', at: 1000 }, { seq: 2, kind: 'up', at: 6000 }], fmt)).toBe('t1000');
    expect(axisStart([], fmt)).toBe('');
  });

  it('só diz "há 5 min" com as 60 leituras', () => {
    const full: Mark[] = Array.from({ length: MAX_MARKS }, (_, i) => ({ seq: i, kind: 'up', at: i * 5000 + 1 }));
    expect(axisStart(full, fmt)).toBe('há 5 min');
  });
});
