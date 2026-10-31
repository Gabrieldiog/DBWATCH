-- LAB 01 · Transferência que falha: a CHECK barra e o ROLLBACK desfaz o crédito já feito
-- [A] 1 · credita 150 no Bruno e tenta debitar 150 da Ana (saldo 100) → ERROR 23514 (check_violation)
BEGIN;
UPDATE lab.accounts SET balance = balance + 150 WHERE id = 2;
UPDATE lab.accounts SET balance = balance - 150 WHERE id = 1;
-- [A] 2 · desfaz tudo
ROLLBACK;
-- [B] 3 · saldos continuam 100 e 50
SELECT id, owner, balance FROM lab.accounts ORDER BY id;
