-- LAB 05 · Write skew: regra "sempre alguém de plantão" com Ana e Bruno de plantão
-- Parte 1: READ COMMITTED (rode 00-preparar.sql antes)
-- [A] 1 · Ana confere quantos estão de plantão (2)
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT count(*) FROM lab.on_call WHERE on_duty;
-- [B] 2 · Bruno confere (2)
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT count(*) FROM lab.on_call WHERE on_duty;
-- [A] 3 · Ana sai e confirma
UPDATE lab.on_call SET on_duty = false WHERE id = 1;
COMMIT;
-- [B] 4 · Bruno sai e confirma: linhas diferentes, nenhum lock, nenhum erro
UPDATE lab.on_call SET on_duty = false WHERE id = 2;
COMMIT;
-- [A] 5 · ninguém de plantão (0): a regra quebrou
SELECT count(*) FROM lab.on_call WHERE on_duty;
UPDATE lab.on_call SET on_duty = true;
-- Parte 2: SERIALIZABLE
-- [A] 6
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM lab.on_call WHERE on_duty;
-- [B] 7
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM lab.on_call WHERE on_duty;
-- [A] 8
UPDATE lab.on_call SET on_duty = false WHERE id = 1;
COMMIT;
-- [B] 9 · o banco percebe o conflito → ERROR 40001 (could not serialize access); faça ROLLBACK
UPDATE lab.on_call SET on_duty = false WHERE id = 2;
COMMIT;
-- [A] 10 · continua 1 de plantão: a regra foi protegida
SELECT count(*) FROM lab.on_call WHERE on_duty;
