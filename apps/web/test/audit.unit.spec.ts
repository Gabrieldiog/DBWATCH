import { describe, expect, it } from 'vitest';
import { auditQuery, toQuery } from '../src/lib/audit';

const id = '3f2b9c1e-8d4a-4c3b-9e2f-1a2b3c4d5e6f';

describe('filtro da auditoria (unitário)', () => {
  it('monta a query só com os campos preenchidos e sem espaços', () => {
    const { qs, error } = auditQuery({ correlationId: ` ${id} `, action: '', outcome: 'DENIED' });
    expect(error).toBeNull();
    expect(qs).toBe(`correlationId=${id}&outcome=DENIED`);
  });

  it('recusa o que a API recusaria, antes de chamar a API', () => {
    expect(auditQuery({ correlationId: 'abc' }).error).toMatch(/UUID/);
    expect(auditQuery({ action: "pam'; DROP" }).error).toMatch(/area\.acao/);
    expect(auditQuery({ outcome: 'TALVEZ' }).error).toMatch(/desconhecido/);
    expect(auditQuery({ cursor: '-1' }).error).toMatch(/Página/);
  });

  it('período no fuso de Goiás e pessoa pelo e-mail', () => {
    const { qs, error } = auditQuery({ actorEmail: 'eva@dbwatch.test', from: '2026-11-11T09:00', to: '2026-11-11T12:30' });
    expect(error).toBeNull();
    expect(new URLSearchParams(qs).get('from')).toBe('2026-11-11T09:00:00-03:00');
    expect(new URLSearchParams(qs).get('to')).toBe('2026-11-11T12:30:00-03:00');
    expect(auditQuery({ from: 'ontem' }).error).toMatch(/Data/);
    expect(auditQuery({ actorEmail: 'eva' }).error).toMatch(/e-mail/);
  });

  it('parâmetro repetido na URL usa o primeiro valor', () => {
    expect(auditQuery({ outcome: ['FAILURE', 'SUCCESS'] }).filter.outcome).toBe('FAILURE');
  });

  it('a página seguinte mantém os filtros e troca o cursor', () => {
    expect(toQuery({ action: 'pam.query_execute', cursor: '120' })).toBe('action=pam.query_execute&cursor=120');
  });
});
