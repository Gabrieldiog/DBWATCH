-- LAB 02 · Espera de lock: B espera A confirmar, e nenhuma atualização se perde
-- [A] 1 · trava a linha da Ana
BEGIN;
UPDATE lab.accounts SET balance = balance - 10 WHERE id = 1;
-- [B] 2 (fica esperando) · tenta mexer na mesma linha
UPDATE lab.accounts SET balance = balance - 20 WHERE id = 1;
-- [A] 3 · confirma: o terminal B destrava na hora
COMMIT;
-- [A] 4 · Ana ficou com 70 (100 - 10 - 20)
SELECT id, owner, balance FROM lab.accounts ORDER BY id;
