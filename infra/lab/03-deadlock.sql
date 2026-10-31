-- LAB 03 · Deadlock: cada sessão trava uma conta e pede a da outra
-- [A] 1 · trava Ana
BEGIN;
UPDATE lab.accounts SET balance = balance - 10 WHERE id = 1;
-- [B] 2 · trava Bruno
BEGIN;
UPDATE lab.accounts SET balance = balance - 10 WHERE id = 2;
-- [A] 3 (fica esperando) · pede Bruno
UPDATE lab.accounts SET balance = balance + 10 WHERE id = 2;
-- [B] 4 · pede Ana → em ~1 s um dos dois recebe ERROR 40P01 (deadlock detected)
UPDATE lab.accounts SET balance = balance + 10 WHERE id = 1;
-- [A] 5 · encerra (se A foi a vítima, o COMMIT vira ROLLBACK sozinho)
COMMIT;
-- [B] 6 · encerra
COMMIT;
