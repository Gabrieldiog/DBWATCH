-- LAB 06 · Índices: uma hora de leituras em 200 mil, sem índice, com B-tree e com BRIN (só o terminal A)
-- [A] 1 · Sem índice: o planejador só pode varrer a tabela inteira (Seq Scan); veja "Buffers" e "Execution Time"
SET enable_indexscan = off; SET enable_bitmapscan = off; SET enable_seqscan = on;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*), round(avg(valor), 2) FROM lab.leituras
 WHERE lida_em >= '2026-10-15 10:00:00-03' AND lida_em < '2026-10-15 11:00:00-03';
-- [A] 2 · B-tree: vai direto às 300 linhas (Index Scan em leituras_lida_em_btree)
SET enable_seqscan = off; SET enable_indexscan = on;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*), round(avg(valor), 2) FROM lab.leituras
 WHERE lida_em >= '2026-10-15 10:00:00-03' AND lida_em < '2026-10-15 11:00:00-03';
-- [A] 3 · BRIN: guarda só o mínimo e o máximo de cada bloco de páginas; lê um pouco a mais, mas quase não ocupa espaço
SET enable_indexscan = off; SET enable_bitmapscan = on;
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*), round(avg(valor), 2) FROM lab.leituras_brin
 WHERE lida_em >= '2026-10-15 10:00:00-03' AND lida_em < '2026-10-15 11:00:00-03';
-- [A] 4 · Tamanho de cada um: o BRIN cabe em poucos kB, o B-tree passa de 4 MB
SELECT pg_size_pretty(pg_relation_size('lab.leituras')) AS tabela,
       pg_size_pretty(pg_relation_size('lab.leituras_lida_em_btree')) AS btree,
       pg_size_pretty(pg_relation_size('lab.leituras_brin_lida_em_brin')) AS brin;
RESET enable_seqscan; RESET enable_indexscan; RESET enable_bitmapscan;
