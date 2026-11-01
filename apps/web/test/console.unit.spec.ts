import { describe, expect, it } from 'vitest';
import { initials, loginUrl, navFor } from '../src/lib/console';

const labels = (permissions: string[]) => navFor(permissions).flatMap((g) => g.items.map((i) => i.label));

describe('navFor (unitário)', () => {
  it('sem permissão nenhuma sobra só a visão geral', () => {
    expect(labels([])).toEqual(['Visão geral']);
  });

  it('solicitante não vê aprovações, auditoria nem usuários', () => {
    const seen = labels(['request:create', 'request:read:own', 'grant:read:own', 'query:execute']);
    expect(seen).toEqual(['Visão geral', 'Pedir acesso', 'Meus acessos', 'Consultas']);
  });

  it('auditora vê auditoria e monitor, e grupo vazio some', () => {
    const groups = navFor(['audit:read', 'audit:verify', 'monitor:read']);
    expect(groups.map((g) => g.group)).toEqual(['', 'Governança']);
    expect(labels(['audit:read', 'audit:verify', 'monitor:read'])).toEqual(['Visão geral', 'Monitor', 'Auditoria']);
  });

  it('qualquer uma das permissões listadas libera o item', () => {
    expect(labels(['role:assign'])).toContain('Usuários');
  });
});

describe('initials e loginUrl (unitário)', () => {
  it('pega primeira e última inicial', () => {
    expect(initials('Diego Solicitante')).toBe('DS');
    expect(initials('  ana  ')).toBe('A');
    expect(initials('')).toBe('?');
  });

  it('monta o retorno ao login com o caminho codificado', () => {
    expect(loginUrl('/pedidos?status=PENDING', false)).toBe('/entrar?next=%2Fpedidos%3Fstatus%3DPENDING');
    expect(loginUrl('/painel', true)).toBe('/entrar?next=%2Fpainel&motivo=expirou');
  });
});
