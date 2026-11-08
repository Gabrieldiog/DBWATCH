-- PK-21: um papel de escrita por recurso, sem login. A conexão das consultas (dbwatch_target_ro) só pode
-- "vestir" um deles com SET ROLE (INHERIT FALSE): sem o SET ROLE, ela continua sem escrever nada.
-- Roda sozinho em banco novo; em banco que já existe, rode uma vez como superusuário (idempotente):
--   psql -U postgres -d dbwatch -f infra/postgres/init/02-papeis-escrita.sql
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['dbwatch_rw_catalogo', 'dbwatch_rw_clientes', 'dbwatch_rw_financeiro'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
    EXECUTE format('GRANT %I TO dbwatch_target_ro WITH INHERIT FALSE, SET TRUE', r);
  END LOOP;
END $$;

-- O SET ROLE é conferido contra o usuário da conexão, não contra o papel vestido: com um bloco DO, quem tem escrita
-- em Clientes poderia trocar para o Financeiro no meio. Sem plpgsql no banco-alvo, não há DO; e a API manda um
-- comando por vez (cada comando tem as permissões conferidas antes de rodar)
\connect dbwatch_target
REVOKE USAGE ON LANGUAGE plpgsql FROM PUBLIC;
GRANT USAGE ON LANGUAGE plpgsql TO dbwatch_migrator; -- só quem prepara a loja (pnpm db:target)
