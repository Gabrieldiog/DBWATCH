-- LAB 04 · Leitura não repetível: a mesma leitura muda no meio da transação?
-- [A] 1 · READ COMMITTED: primeira leitura (100)
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT balance FROM lab.accounts WHERE id = 1;
-- [B] 2 · B tira 30 e confirma (comando avulso)
UPDATE lab.accounts SET balance = balance - 30 WHERE id = 1;
-- [A] 3 · mesma leitura, mesma transação: agora 70
SELECT balance FROM lab.accounts WHERE id = 1;
COMMIT;
-- [A] 4 · REPEATABLE READ: primeira leitura (70)
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM lab.accounts WHERE id = 1;
-- [B] 5 · B tira mais 30 e confirma
UPDATE lab.accounts SET balance = balance - 30 WHERE id = 1;
-- [A] 6 · continua 70: a transação inteira enxerga a mesma foto
SELECT balance FROM lab.accounts WHERE id = 1;
COMMIT;
