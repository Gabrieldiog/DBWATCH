import { describe, expect, it } from 'vitest';
import { explicarErro, resumo } from '../src/lib/console-sql';

const banco = (code: string, msg: string) => `O banco recusou (SQLSTATE ${code}): ${msg}`;

describe('explicarErro: o console fala com quem não é de TI (PK-24)', () => {
  it('Leitura tentando alterar: diz o nível e o que fazer, e guarda a resposta do banco', () => {
    expect(explicarErro(banco('25006', 'cannot execute UPDATE in a read-only transaction'), 'Clientes')).toEqual({
      titulo: 'Seu acesso a Clientes é de Leitura',
      texto: expect.stringContaining('peça acesso de Escrita'),
      banco: 'SQLSTATE 25006: cannot execute UPDATE in a read-only transaction',
    });
  });

  it('42501 separa outra tabela, mudança de estrutura e comando proibido na própria tabela', () => {
    const outra = explicarErro(banco('42501', 'permission denied for table clientes'), 'Catálogo de produtos');
    expect(outra.titulo).toBe('A tabela clientes não faz parte de Catálogo de produtos');
    expect(outra.texto).toContain('só alcança a tabela loja.produtos');
    expect(explicarErro(banco('42501', 'must be owner of table clientes'), 'Clientes').titulo).toBe('Criar ou apagar tabelas não é permitido');
    expect(explicarErro(banco('42501', 'permission denied for schema loja'), 'Clientes').titulo).toBe('Criar ou apagar tabelas não é permitido');
    expect(explicarErro(banco('42501', 'permission denied for table pedidos'), 'Financeiro').texto).toContain('TRUNCATE');
  });

  it('erros comuns de quem está aprendendo SQL viram uma frase; o desconhecido não inventa motivo', () => {
    expect(explicarErro(banco('42601', 'cannot insert multiple commands into a prepared statement'), 'Clientes').titulo).toBe('Mande um comando por vez');
    expect(explicarErro(banco('42601', 'syntax error at or near "SELEC"'), 'Clientes').titulo).toBe('O banco não entendeu o comando');
    expect(explicarErro(banco('42P01', 'relation "loja.cliente" does not exist'), 'Clientes').texto).toBe('A tabela de Clientes é loja.clientes.');
    expect(explicarErro(banco('57014', 'canceling statement due to statement timeout'), 'Clientes').titulo).toBe('O comando demorou demais');
    expect(explicarErro(banco('XX999', 'algo raro'), 'Clientes')).toMatchObject({ titulo: 'O banco recusou o comando', banco: 'SQLSTATE XX999: algo raro' });
  });

  it('mensagem que não veio do banco (sem acesso, sem conexão) passa como está', () => {
    expect(explicarErro('Seu acesso a este recurso expirou; peça de novo', 'Clientes')).toEqual({
      titulo: 'Não deu para executar', texto: 'Seu acesso a este recurso expirou; peça de novo',
    });
  });

  it('resumo do resultado em português, com singular e plural', () => {
    expect(resumo('SELECT', 20)).toBe('Consulta pronta: 20 linhas');
    expect(resumo('UPDATE', 1)).toBe('1 linha alterada');
    expect(resumo('INSERT', 0)).toBe('0 linhas incluídas');
    expect(resumo('MERGE', 2)).toBe('MERGE executado');
  });
});
