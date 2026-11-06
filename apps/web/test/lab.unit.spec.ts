import { describe, expect, it } from 'vitest';
import { CONCEPT, outcomeOf, rowsText } from '../src/lib/lab';

describe('laboratório (unitário)', () => {
  it('resultado do passo com o significado do SQLSTATE e a espera destacada', () => {
    expect(outcomeOf({ at: 0, session: 'A', ms: 12, result: 'ok' })).toBe('ok em 12 ms');
    expect(outcomeOf({ at: 0, session: 'B', ms: 6012, result: 'ok' })).toBe('ok em 6012 ms, esperando');
    expect(outcomeOf({ at: 0, session: 'A', ms: 1003, result: 'erro', sqlstate: '40P01' })).toBe(
      'erro 40P01 (deadlock: o PostgreSQL derrubou esta sessão) em 1003 ms, esperando',
    );
  });

  it('o que o SELECT leu, linha por linha', () => {
    expect(rowsText([{ id: 1, saldo: 100 }, { id: 2, saldo: 50 }])).toBe('id 1 · saldo 100 / id 2 · saldo 50');
  });

  it('todo cenário da API tem a explicação do conceito', () => {
    expect(Object.keys(CONCEPT).sort()).toEqual(['deadlock', 'espera-de-lock', 'leitura-nao-repetivel', 'transferencia-falha', 'write-skew']);
  });
});
