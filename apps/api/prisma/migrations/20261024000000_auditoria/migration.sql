-- Auditoria append-only com cadeia de hash (docs/DATA_MODEL.md §3.6 e §3.7).
-- Fica fora do schema.prisma de propósito: é acessada só por SQL explícito, sem update/delete no ORM.

CREATE SCHEMA "audit";

CREATE TYPE "audit"."audit_outcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

CREATE TABLE "audit"."audit_log" (
  "id"             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "chain_position" BIGINT NOT NULL UNIQUE,
  "occurred_at"    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  "actor_id"       UUID REFERENCES "iam"."users" ("id") ON DELETE RESTRICT,
  "action"         TEXT NOT NULL CHECK ("action" ~ '^[a-z]+(\.[a-z_]+)+$'),
  "resource_type"  TEXT CHECK (char_length("resource_type") <= 60),
  "resource_id"    TEXT CHECK (char_length("resource_id") <= 120),
  "outcome"        "audit"."audit_outcome" NOT NULL,
  "reason"         TEXT CHECK (char_length("reason") <= 200),
  "correlation_id" UUID,
  "ip"             INET,
  "metadata"       JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof("metadata") = 'object'),
  "prev_hash"      BYTEA,
  "row_hash"       BYTEA NOT NULL
);

-- Append-only e correlacionado com o tempo: o BRIN fica minúsculo
CREATE INDEX "audit_log_occurred_at_brin" ON "audit"."audit_log" USING brin ("occurred_at");
CREATE INDEX "audit_log_actor_idx" ON "audit"."audit_log" ("actor_id", "occurred_at" DESC);
CREATE INDEX "audit_log_correlation_idx" ON "audit"."audit_log" ("correlation_id");

-- Uma única fórmula de hash, usada pelo trigger e pelo verificador
CREATE FUNCTION "audit"."row_digest"(r "audit"."audit_log") RETURNS BYTEA
LANGUAGE sql STABLE AS $$
  SELECT sha256(convert_to(concat_ws('|',
    encode(coalesce(r.prev_hash, '\x'::bytea), 'hex'), r.chain_position,
    extract(epoch FROM r.occurred_at), r.actor_id, r.action, r.resource_type, r.resource_id,
    r.outcome, r.reason, r.correlation_id, r.ip, r.metadata::text), 'UTF8'))
$$;

CREATE FUNCTION "audit"."chain_row"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  last_hash BYTEA;
  last_pos  BIGINT;
BEGIN
  -- Em REPEATABLE READ o snapshot não veria a última linha confirmada e a cadeia se bifurcaria
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'auditoria exige READ COMMITTED' USING ERRCODE = 'invalid_transaction_state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('audit.audit_log.chain'));
  SELECT row_hash, chain_position INTO last_hash, last_pos
    FROM "audit"."audit_log" ORDER BY chain_position DESC LIMIT 1;
  NEW.chain_position := coalesce(last_pos, 0) + 1;
  NEW.prev_hash := last_hash;
  NEW.row_hash := "audit"."row_digest"(NEW);
  RETURN NEW;
END $$;

CREATE FUNCTION "audit"."forbid_mutation"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_log é append-only: % não é permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER "audit_log_chain" BEFORE INSERT ON "audit"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit"."chain_row"();
CREATE TRIGGER "audit_log_no_update_delete" BEFORE UPDATE OR DELETE ON "audit"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit"."forbid_mutation"();
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit"."audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit"."forbid_mutation"();

-- Detecta conteúdo alterado, elo quebrado (linha apagada no meio) e buraco na numeração
CREATE FUNCTION "audit"."verify_chain"()
RETURNS TABLE ("checked" BIGINT, "first_broken_position" BIGINT)
LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT l.chain_position, l.row_hash, l.prev_hash,
           lag(l.row_hash) OVER w AS expected_prev,
           coalesce(lag(l.chain_position) OVER w, 0) + 1 AS expected_position,
           "audit"."row_digest"(l) AS recomputed
      FROM "audit"."audit_log" l
    WINDOW w AS (ORDER BY l.chain_position)
  )
  SELECT count(*),
         min(chain_position) FILTER (
           WHERE row_hash <> recomputed
              OR prev_hash IS DISTINCT FROM expected_prev
              OR chain_position <> expected_position)
    FROM ordered
$$;

REVOKE ALL ON SCHEMA "audit" FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA "audit" FROM PUBLIC;
GRANT USAGE ON SCHEMA "audit" TO dbwatch_app, dbwatch_monitor;
GRANT INSERT, SELECT ON "audit"."audit_log" TO dbwatch_app;
GRANT SELECT ON "audit"."audit_log" TO dbwatch_monitor;
GRANT EXECUTE ON FUNCTION "audit"."row_digest"("audit"."audit_log"), "audit"."verify_chain"()
  TO dbwatch_app, dbwatch_monitor;
