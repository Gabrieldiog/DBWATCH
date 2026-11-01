import { describe, expect, it } from 'vitest';
import { approvals, errorMessage, minutes, when } from '../src/lib/pam';

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
    expect(errorMessage(409, null)).toBe('Não foi possível concluir a ação.');
  });
});
