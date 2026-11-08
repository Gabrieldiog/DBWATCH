-- PK-20a: o catálogo se explica. Cada consulta ganha uma descrição, e cada parâmetro um rótulo e os valores aceitos;
-- a API recusa valor fora da lista (a tela só mostra a lista, quem nega é a API)
ALTER TABLE "pam"."query_templates" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

UPDATE "pam"."query_templates" SET
  "description" = 'Nome e e-mail mascarado dos clientes de uma cidade.',
  "params" = '[{"name":"cidade","label":"Cidade","type":"text","options":["Goiânia","Aparecida de Goiânia","Anápolis","Brasília"]}]'
 WHERE "code" = 'clientes_por_cidade';
UPDATE "pam"."query_templates" SET
  "description" = 'Produtos e preços de uma categoria do catálogo.',
  "params" = '[{"name":"categoria","label":"Categoria","type":"text","options":["Bebidas","Higiene","Limpeza","Mercearia"]}]'
 WHERE "code" = 'produtos_por_categoria';
UPDATE "pam"."query_templates" SET "description" = 'Total vendido em cada mês, somando todos os pedidos.' WHERE "code" = 'faturamento_mensal';
UPDATE "pam"."query_templates" SET
  "description" = 'LAB: dorme de propósito para mostrar o banco cancelando a consulta no tempo-limite (57014).',
  "params" = '[{"name":"segundos","label":"Segundos de espera","type":"int","min":0,"max":5}]'
 WHERE "code" = 'relatorio_lento';

INSERT INTO "pam"."query_templates" ("code", "resource_id", "access_level", "title", "description", "sql_text", "params", "max_rows", "timeout_ms")
SELECT t.code, r."id", 'READ', t.title, t.description, t.sql_text, t.params::jsonb, t.max_rows, t.timeout_ms
  FROM (VALUES
    ('clientes_por_cidade_total', 'Clientes', 'Quantos clientes em cada cidade', 'Contagem de clientes por cidade, sem dado pessoal nenhum.',
     'SELECT cidade, count(*) AS clientes FROM loja.clientes GROUP BY cidade ORDER BY clientes DESC, cidade', '[]', 10, 2000),
    ('resumo_por_categoria', 'Catálogo de produtos', 'Resumo do catálogo por categoria', 'Quantidade de produtos e preço médio, mínimo e máximo de cada categoria.',
     'SELECT categoria, count(*) AS produtos, round(avg(preco), 2) AS preco_medio, min(preco) AS mais_barato, max(preco) AS mais_caro FROM loja.produtos GROUP BY categoria ORDER BY categoria', '[]', 10, 2000),
    ('pedidos_de_um_cliente', 'Financeiro', 'Pedidos de um cliente', 'Valor e data de cada pedido de um cliente (números de 1 a 500).',
     'SELECT id, valor, to_char(criado_em, ''DD/MM/YYYY'') AS data FROM loja.pedidos WHERE cliente_id = $1 ORDER BY criado_em DESC', '[{"name":"cliente","label":"Número do cliente","type":"int","min":1,"max":500}]', 50, 2000),
    ('maiores_clientes', 'Financeiro', 'Os 10 clientes que mais compraram (e-mail mascarado)', 'Ranking por valor total dos pedidos; junta Clientes e Pedidos.',
     'SELECT c.id, c.nome, left(c.email, 3) || ''***'' AS email, count(*) AS pedidos, sum(p.valor) AS total FROM loja.pedidos p JOIN loja.clientes c ON c.id = p.cliente_id GROUP BY c.id ORDER BY total DESC LIMIT 10', '[]', 10, 3000)
  ) AS t(code, resource_name, title, description, sql_text, params, max_rows, timeout_ms)
  JOIN "pam"."resources" r ON r."name" = t.resource_name
ON CONFLICT ("code") DO NOTHING;
