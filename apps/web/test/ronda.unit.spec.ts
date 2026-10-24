import { describe, expect, it } from 'vitest';
import { barHeight, MAX_MARKS, type Mark, pushMark, summarize } from '../src/lib/ronda';

const up = (seq: number, latencyMs = 1): Mark => ({ seq, kind: 'up', latencyMs });

describe('barHeight (unitário)', () => {
  it('cresce com a latência sem estourar a faixa', () => {
    expect(barHeight(up(1, 1))).toBeLessThan(barHeight(up(2, 50)));
    expect(barHeight(up(3, 100_000))).toBe(56);
    expect(barHeight(up(4, -5))).toBe(8);
  });

  it('falha ocupa a altura toda e o vão quase nada', () => {
    expect(barHeight({ seq: 1, kind: 'down' })).toBe(56);
    expect(barHeight({ seq: 2, kind: 'unreachable' })).toBe(56);
    expect(barHeight({ seq: 3, kind: 'gap' })).toBe(4);
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
