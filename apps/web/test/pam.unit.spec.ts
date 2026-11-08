import { describe, expect, it } from 'vitest';
import { approvals, clock, errorMessage, liveAccess, minutes, when } from '../src/lib/pam';

describe('rótulos de PAM (unitário)', () => {
  it('duração em minutos e horas', () => {
    expect([5, 60, 90, 480].map(minutes)).toEqual(['5 min', '1 h', '1 h 30 min', '8 h']);
  });

  it('data no fuso de Goiás, mesmo com o servidor em UTC', () => {
    expect(when('2026-11-11T13:05:00Z')).toBe('11/11/2026, 10:05');
  });

  it('etapas de aprovação só para recurso HIGH pendente', () => {
    const high = { resource: { id: '1', name: 'Financeiro', sensitivity: 'HIGH' } };
    expect(approvals({ ...high, status: 'PENDING', firstApprovedAt: null })).toBe('0 de 2 aprovações');
    expect(approvals({ ...high, status: 'PENDING', firstApprovedAt: '2026-11-01T10:00:00Z' })).toBe('1 de 2 aprovações');
    expect(approvals({ ...high, status: 'APPROVED', firstApprovedAt: '2026-11-01T10:00:00Z' })).toBeNull();
    expect(approvals({ ...high, resource: { ...high.resource, sensitivity: 'LOW' }, status: 'PENDING', firstApprovedAt: null })).toBeNull();
  });

  it('mensagem de erro: a da API para 4xx, genérica para rede e 5xx', () => {
    expect(errorMessage(404, { message: 'Pedido pendente não encontrado' })).toBe('Pedido pendente não encontrado');
    expect(errorMessage(400, { message: ['a', 'b'] })).toBe('a; b');
    expect(errorMessage(500, { message: 'stack interna' })).toMatch(/Nada foi alterado/);
    expect(errorMessage(0, null)).toMatch(/Sem conexão/);
    // A API troca a mensagem de todo 5xx por "Erro interno"; tempo-limite e falha do banco-alvo são traduzidos aqui
    expect(errorMessage(504, { message: 'Erro interno. Informe o código de suporte.' })).toMatch(/tempo-limite/);
    expect(errorMessage(502, null)).toMatch(/banco-alvo/);
    expect(errorMessage(409, null)).toBe('Não foi possível concluir a ação.');
  });
});

describe('contagem regressiva (unitário)', () => {
  it('formata minutos e segundos, e horas quando passa de 60 min', () => {
    expect([0, 9, 754, 3600, 3725].map(clock)).toEqual(['00:00', '00:09', '12:34', '1:00:00', '1:02:05']);
  });

  it('nunca mostra tempo negativo', () => {
    expect(clock(-5)).toBe('00:00');
  });
});

describe('liveAccess (unitário)', () => {
  const g = (resource: string, state: string, expiresAt: string) => ({ state, expiresAt, resource: { id: resource, name: resource, sensitivity: 'LOW' } });
  it('acha o acesso vivo do recurso que vence por último e ignora os mortos e os de outro recurso', () => {
    const grants = [g('a', 'ACTIVE', '2026-11-08T10:00:00Z'), g('a', 'ACTIVE', '2026-11-08T11:00:00Z'), g('a', 'REVOKED', '2026-11-08T12:00:00Z'), g('b', 'ACTIVE', '2026-11-08T13:00:00Z')];
    expect(liveAccess(grants, 'a')?.expiresAt).toBe('2026-11-08T11:00:00Z');
    expect(liveAccess(grants, 'c')).toBeUndefined();
  });
});
