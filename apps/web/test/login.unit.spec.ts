import { describe, expect, it } from 'vitest';
import { loginErrorMessage, safeNext } from '../src/lib/login';

describe('safeNext (unitário)', () => {
  it('mantém caminhos internos', () => {
    expect(safeNext('/auditoria')).toBe('/auditoria');
    expect(safeNext('/pedidos?status=PENDING')).toBe('/pedidos?status=PENDING');
  });

  it('troca destino externo ou vazio pela visão geral', () => {
    for (const bad of [null, '', 'https://mal.example', '//mal.example', '/\\mal.example', 'javascript:alert(1)'])
      expect(safeNext(bad)).toBe('/');
  });
});

describe('loginErrorMessage (unitário)', () => {
  it('repassa o texto da API para erros do cliente', () => {
    expect(loginErrorMessage(401, { message: 'E-mail ou senha inválidos' })).toBe('E-mail ou senha inválidos');
    expect(loginErrorMessage(423, { message: 'Conta temporariamente bloqueada.' })).toBe('Conta temporariamente bloqueada.');
  });

  it('não mostra detalhe de erro interno nem quebra sem corpo', () => {
    expect(loginErrorMessage(500, { message: 'relation "iam.users" does not exist' })).not.toContain('relation');
    expect(loginErrorMessage(401, null)).toContain('servidor');
    expect(loginErrorMessage(0, null)).toContain('conexão');
  });
});
