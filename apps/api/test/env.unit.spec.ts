import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

describe('loadEnv', () => {
  it('aplica padrões seguros', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
    expect(env.API_HOST).toBe('127.0.0.1');
    expect(env.API_PORT).toBe(4000);
  });

  it('recusa configuração inválida sem revelar valores', () => {
    const run = () => loadEnv({ DATABASE_URL: 'mysql://admin:segredo123@db/x', API_PORT: 'abc' });
    expect(run).toThrow(/DATABASE_URL, API_PORT|API_PORT, DATABASE_URL/);
    expect(run).not.toThrow(/segredo123/);
  });
});
