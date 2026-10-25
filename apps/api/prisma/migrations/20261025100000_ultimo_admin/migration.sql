-- Regra: o sistema nunca fica sem ADMIN ativo. O ADMIN tem id fixo 1 no catálogo (migration do iam)
-- O advisory lock serializa quem mexe em administradores: sem ele, duas transações simultâneas
-- veriam a outra ainda como ADMIN e as duas passariam, zerando os administradores
CREATE FUNCTION "iam"."ensure_active_admin"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- IFs aninhados: num DELETE não existe NEW, e o PL/pgSQL não faz curto-circuito no AND
  IF TG_TABLE_NAME = 'users' THEN
    IF NOT EXISTS (SELECT 1 FROM "iam"."user_roles" WHERE "user_id" = NEW."id" AND "role_id" = 1) THEN
      RETURN NULL;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('iam.ultimo_admin'));
  -- Em READ COMMITTED, esta consulta tira um snapshot novo depois do lock e enxerga quem acabou de confirmar
  IF NOT EXISTS (
    SELECT 1 FROM "iam"."users" u JOIN "iam"."user_roles" ur ON ur."user_id" = u."id"
     WHERE ur."role_id" = 1 AND u."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'O sistema precisa de pelo menos um ADMIN ativo' USING ERRCODE = 'DW001';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "user_roles_ultimo_admin" AFTER DELETE ON "iam"."user_roles"
  FOR EACH ROW WHEN (OLD."role_id" = 1) EXECUTE FUNCTION "iam"."ensure_active_admin"();

CREATE TRIGGER "users_ultimo_admin" AFTER UPDATE OF "status" ON "iam"."users"
  FOR EACH ROW WHEN (OLD."status" = 'ACTIVE' AND NEW."status" <> 'ACTIVE') EXECUTE FUNCTION "iam"."ensure_active_admin"();
