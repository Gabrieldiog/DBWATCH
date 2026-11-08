-- Banco-alvo de demonstração: dados 100% fictícios, gerados aqui. Idempotente (pode rodar de novo)
CREATE SCHEMA IF NOT EXISTS loja;

CREATE TABLE IF NOT EXISTS loja.produtos (
  id        int PRIMARY KEY,
  nome      text NOT NULL,
  categoria text NOT NULL,
  preco     numeric(10, 2) NOT NULL CHECK (preco > 0)
);
CREATE TABLE IF NOT EXISTS loja.clientes (
  id     int PRIMARY KEY,
  nome   text NOT NULL,
  email  text NOT NULL,
  cidade text NOT NULL
);
CREATE TABLE IF NOT EXISTS loja.pedidos (
  id         int PRIMARY KEY,
  cliente_id int NOT NULL REFERENCES loja.clientes (id),
  valor      numeric(10, 2) NOT NULL CHECK (valor > 0),
  criado_em  timestamptz NOT NULL
);

INSERT INTO loja.produtos
SELECT i, 'Produto ' || i, (ARRAY['Bebidas', 'Limpeza', 'Mercearia', 'Higiene'])[1 + i % 4], round((5 + (i * 37) % 200)::numeric, 2)
  FROM generate_series(1, 200) i
ON CONFLICT (id) DO NOTHING;

INSERT INTO loja.clientes
SELECT i, 'Cliente ' || i, 'cliente' || i || '@exemplo.test', (ARRAY['Goiânia', 'Anápolis', 'Brasília', 'Aparecida de Goiânia'])[1 + i % 4]
  FROM generate_series(1, 500) i
ON CONFLICT (id) DO NOTHING;

INSERT INTO loja.pedidos
SELECT i, 1 + (i * 7) % 500, round((20 + (i * 53) % 900)::numeric, 2), timestamptz '2026-01-01' + (i % 300) * interval '1 day'
  FROM generate_series(1, 5000) i
ON CONFLICT (id) DO NOTHING;

-- O papel das consultas só lê, e as transações dele já nascem somente leitura (ALTER ROLE no init)
GRANT USAGE ON SCHEMA loja TO dbwatch_target_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA loja TO dbwatch_target_ro;

-- PK-21: cada papel de escrita altera só a tabela do seu recurso; nada de DDL nem TRUNCATE, nada fora de loja.
-- Os papéis vêm do infra/postgres/init/02-papeis-escrita.sql (superusuário); sem eles, o console fica sem escrita
DO $$
DECLARE p text[];
BEGIN
  FOREACH p SLICE 1 IN ARRAY ARRAY[['dbwatch_rw_catalogo', 'produtos'], ['dbwatch_rw_clientes', 'clientes'], ['dbwatch_rw_financeiro', 'pedidos']] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = p[1]) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA loja TO %I', p[1]);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON loja.%I TO %I', p[2], p[1]);
    ELSE
      RAISE NOTICE 'Papel % não existe: rode infra/postgres/init/02-papeis-escrita.sql como superusuário', p[1];
    END IF;
  END LOOP;
END $$;
