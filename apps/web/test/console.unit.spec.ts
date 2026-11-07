import { describe, expect, it } from 'vitest';
import { aclWhen, device, forbiddenPath, initials, loginUrl, navFor } from '../src/lib/console';

const labels = (permissions: string[]) => navFor(permissions).flatMap((g) => g.items.map((i) => i.label));

describe('navFor (unitário)', () => {
  it('sem permissão nenhuma sobram a visão geral e as próprias sessões', () => {
    expect(labels([])).toEqual(['Visão geral', 'Minhas sessões']);
  });

  it('solicitante não vê aprovações, auditoria nem usuários', () => {
    const seen = labels(['request:create', 'request:read:own', 'grant:read:own', 'query:execute']);
    expect(seen).toEqual(['Visão geral', 'Minhas sessões', 'Pedir acesso', 'Meus acessos', 'Consultas']);
  });

  it('auditora vê auditoria e monitor, e grupo vazio some', () => {
    const groups = navFor(['audit:read', 'audit:verify', 'monitor:read']);
    expect(groups.map((g) => g.group)).toEqual(['', 'Governança']);
    expect(labels(['audit:read', 'audit:verify', 'monitor:read'])).toEqual(['Visão geral', 'Monitor', 'Minhas sessões', 'Auditoria']);
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

describe('device (unitário)', () => {
  it('resume navegador e sistema, e não inventa quando não reconhece', () => {
    expect(device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge no Windows');
    expect(device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1')).toBe('Safari no iOS');
    expect(device('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Firefox no Linux');
    expect(device('curl/8.5.0')).toBe('curl/8.5.0');
    expect(device(null)).toBe('Navegador desconhecido');
  });
});

describe('forbiddenPath (unitário)', () => {
  it('nega tela fora do papel, inclusive subcaminho e com query, e libera as telas de todo mundo', () => {
    expect(forbiddenPath('/usuarios', ['audit:read'])).toBe(true);
    expect(forbiddenPath('/auditoria?acao=x', ['request:create'])).toBe(true);
    expect(forbiddenPath('/acessos/123', ['grant:revoke'])).toBe(false);
    expect(forbiddenPath('/sessoes', [])).toBe(false);
    expect(forbiddenPath('/painelzinho', [])).toBe(false); // não é a tela /painel; quem responde é o 404 do Next
  });
});

describe('aclWhen (unitário)', () => {
  it('descreve a regra com dias ISO e trata nulo como qualquer', () => {
    expect(aclWhen({ ipRange: '10.0.0.0/8', weekdays: [1, 7], startTime: '22:00', endTime: '23:59' })).toBe('IP em 10.0.0.0/8, Seg, Dom, das 22:00 às 23:59');
    expect(aclWhen({ ipRange: null, weekdays: null, startTime: null, endTime: null })).toBe('qualquer IP, todos os dias, o dia todo');
  });
});
