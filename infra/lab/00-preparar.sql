-- LAB · Preparar (rode antes de cada cenário, em qualquer terminal)
-- Terminais: docker compose exec postgres psql -U dbwatch_lab -d dbwatch
INSERT INTO lab.accounts VALUES (1, 'Ana', 100), (2, 'Bruno', 50)
  ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, balance = EXCLUDED.balance;
INSERT INTO lab.on_call VALUES (1, 'Ana', true), (2, 'Bruno', true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, on_duty = EXCLUDED.on_duty;
