// PK-24: o console fala com quem não é de TI. O erro do PostgreSQL continua aparecendo (é a prova de quem recusou),
// mas embaixo de uma frase que diz o que aconteceu e o que fazer

// A tabela que o papel de cada recurso alcança (infra/target/schema.sql)
export const TABELA: Record<string, string> = { Clientes: 'clientes', 'Catálogo de produtos': 'produtos', Financeiro: 'pedidos' };

const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
export const hora = (iso: string) => HORA.format(new Date(iso));

export type Explicado = { titulo: string; texto: string; banco?: string };

// A API devolve "O banco recusou (SQLSTATE 25006): cannot execute UPDATE in a read-only transaction"
export function explicarErro(message: string, recurso: string): Explicado {
  const m = /SQLSTATE (\w{5})\): (.*)$/s.exec(message);
  if (!m) return { titulo: 'Não deu para executar', texto: message };
  const [, code, original] = m as unknown as [string, string, string];
  const banco = `SQLSTATE ${code}: ${original}`;
  const minha = TABELA[recurso];
  const outra = /permission denied for table (\w+)/.exec(original)?.[1];
  const r = (titulo: string, texto: string): Explicado => ({ titulo, texto, banco });

  if (code === '25006')
    return r(`Seu acesso a ${recurso} é de Leitura`, `Dá para consultar, mas não para alterar dados. Se precisar mudar algo, peça acesso de Escrita.`);
  if (code === '42501' && outra && outra !== minha)
    return r(`A tabela ${outra} não faz parte de ${recurso}`, `Seu acesso a ${recurso} só alcança a tabela loja.${minha}. Para mexer em ${outra}, peça acesso ao recurso dela.`);
  if (code === '42501' && /must be owner|permission denied for schema/.test(original))
    return r('Criar ou apagar tabelas não é permitido', 'Pelo console ninguém muda a estrutura do banco: só os dados da tabela do recurso.');
  if (code === '42501' && outra)
    return r(`Esse comando não é permitido em ${outra}`, 'Dá para consultar, incluir, alterar e apagar linhas; esvaziar a tabela inteira de uma vez (TRUNCATE) não.');
  if (code === '42501') return r('O banco não deu permissão para isso', 'O papel do seu acesso não pode executar esse comando.');
  if (code === '42601' && /multiple commands/.test(original))
    return r('Mande um comando por vez', 'O console executa um comando de cada vez. Separe e execute um depois do outro.');
  if (code === '42601') return r('O banco não entendeu o comando', 'Confira a escrita perto do trecho que o banco apontou abaixo.');
  if (code === '42P01') return r('Essa tabela não existe', `A tabela de ${recurso} é loja.${minha}.`);
  if (code === '42703') return r('Essa coluna não existe', `Confira o nome da coluna na tabela loja.${minha}.`);
  if (code === '57014') return r('O comando demorou demais', 'Passou de 3 segundos e o banco cancelou. Tente filtrar mais (WHERE) ou usar LIMIT.');
  if (code === '55P03') return r('Alguém está mexendo nessas linhas agora', 'O banco esperou 3 segundos pela liberação e desistiu. Tente de novo em instantes.');
  if (code === '23514') return r('O valor quebra uma regra da tabela', 'Por exemplo, preço e valor precisam ser maiores que zero.');
  if (code === '23505') return r('Já existe um registro com esse código', 'O id precisa ser único na tabela.');
  if (code === '23503') return r('O registro ligado não existe', 'Por exemplo, o cliente do pedido precisa existir em loja.clientes.');
  if (code === '23502') return r('Falta preencher um campo obrigatório', 'Confira as colunas que não aceitam ficar vazias.');
  return r('O banco recusou o comando', 'A resposta original do PostgreSQL está logo abaixo.');
}

const FEITO: Record<string, (n: number) => string> = {
  SELECT: (n) => `Consulta pronta: ${n} ${n === 1 ? 'linha' : 'linhas'}`,
  UPDATE: (n) => `${n} ${n === 1 ? 'linha alterada' : 'linhas alteradas'}`,
  INSERT: (n) => `${n} ${n === 1 ? 'linha incluída' : 'linhas incluídas'}`,
  DELETE: (n) => `${n} ${n === 1 ? 'linha apagada' : 'linhas apagadas'}`,
};

export function resumo(command: string, rowCount: number): string {
  return FEITO[command]?.(rowCount) ?? `${command} executado`;
}

// SQL pronto para a apresentação, em três grupos: o que a Leitura faz, o que só a Escrita faz e o que o banco recusa
// sempre (outra tabela, DDL). São só atalhos para o campo de texto; quem decide é o banco
export type Grupo = { nome: string; dica: string; tom: 'ler' | 'alterar' | 'recusa'; itens: [string, string][] };
export const EXEMPLOS: Record<string, Grupo[]> = {
  Clientes: [
    { nome: 'Ler', dica: 'Consultas: não mudam nada', tom: 'ler', itens: [
      ['Clientes de Goiânia', "SELECT id, nome, email FROM loja.clientes WHERE cidade = 'Goiânia' ORDER BY id LIMIT 20"],
      ['Clientes por cidade', 'SELECT cidade, count(*) AS clientes FROM loja.clientes GROUP BY cidade ORDER BY clientes DESC'],
      ['Ver o cliente 7', 'SELECT id, nome, cidade FROM loja.clientes WHERE id = 7'],
    ] },
    { nome: 'Alterar', dica: 'Mudam dados de verdade: precisam de Escrita', tom: 'alterar', itens: [
      ['Mudar a cidade de um cliente', "UPDATE loja.clientes SET cidade = 'Anápolis' WHERE id = 7 RETURNING id, nome, cidade"],
    ] },
    { nome: 'O banco recusa', dica: 'Para ver a proteção funcionando', tom: 'recusa', itens: [
      ['Apagar pedidos (outra tabela)', 'DELETE FROM loja.pedidos WHERE id = 1'],
      ['Apagar a tabela', 'DROP TABLE loja.clientes'],
    ] },
  ],
  'Catálogo de produtos': [
    { nome: 'Ler', dica: 'Consultas: não mudam nada', tom: 'ler', itens: [
      ['Produtos mais caros', 'SELECT id, nome, categoria, preco FROM loja.produtos ORDER BY preco DESC LIMIT 10'],
      ['Preço médio por categoria', 'SELECT categoria, count(*) AS produtos, round(avg(preco), 2) AS preco_medio FROM loja.produtos GROUP BY categoria ORDER BY categoria'],
    ] },
    { nome: 'Alterar', dica: 'Mudam dados de verdade: precisam de Escrita', tom: 'alterar', itens: [
      ['Reajustar Bebidas em 10%', "UPDATE loja.produtos SET preco = round(preco * 1.1, 2) WHERE categoria = 'Bebidas' RETURNING id, nome, preco"],
    ] },
    { nome: 'O banco recusa', dica: 'Para ver a proteção funcionando', tom: 'recusa', itens: [
      ['Mexer nos clientes (outra tabela)', "UPDATE loja.clientes SET nome = 'x' WHERE id = 1"],
    ] },
  ],
  Financeiro: [
    { nome: 'Ler', dica: 'Consultas: não mudam nada', tom: 'ler', itens: [
      ['Faturamento por mês', "SELECT date_trunc('month', criado_em)::date AS mes, count(*) AS pedidos, sum(valor) AS total FROM loja.pedidos GROUP BY 1 ORDER BY 1"],
      ['Maiores pedidos', 'SELECT id, cliente_id, valor, criado_em FROM loja.pedidos ORDER BY valor DESC LIMIT 10'],
    ] },
    { nome: 'Alterar', dica: 'Mudam dados de verdade: precisam de Escrita', tom: 'alterar', itens: [
      ['Lançar um pedido', 'INSERT INTO loja.pedidos (id, cliente_id, valor, criado_em) VALUES (9001, 7, 99.90, now()) ON CONFLICT (id) DO NOTHING RETURNING *'],
    ] },
    { nome: 'O banco recusa', dica: 'Para ver a proteção funcionando', tom: 'recusa', itens: [
      ['Pedidos com o nome do cliente (outra tabela)', 'SELECT p.id, c.nome, p.valor FROM loja.pedidos p JOIN loja.clientes c ON c.id = p.cliente_id LIMIT 10'],
      ['Esvaziar a tabela', 'TRUNCATE loja.pedidos'],
    ] },
  ],
};
