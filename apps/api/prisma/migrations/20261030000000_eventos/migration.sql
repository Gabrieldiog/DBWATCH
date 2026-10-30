-- Eventos da aplicação (rollbacks) e alertas do coletor, num único fluxo para a tela ao vivo
CREATE TABLE "monitor"."app_events" (
  "id"             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "occurred_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "kind"           TEXT NOT NULL CHECK ("kind" IN ('TX_ROLLBACK', 'ALERT')),
  "code"           TEXT NOT NULL CHECK ("code" ~ '^[A-Z_]{3,30}$'),
  "severity"       TEXT NOT NULL CHECK ("severity" IN ('info', 'medium', 'high')),
  "operation"      TEXT CHECK (char_length("operation") <= 60),
  "sqlstate"       TEXT CHECK ("sqlstate" ~ '^[0-9A-Z]{5}$'),
  "correlation_id" UUID,
  "detail"         JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof("detail") = 'object')
);
CREATE INDEX "app_events_time_brin" ON "monitor"."app_events" USING brin ("occurred_at");
CREATE INDEX "app_events_code_idx" ON "monitor"."app_events" ("code", "occurred_at" DESC);

-- Cada evento novo é anunciado no canal dbwatch_events; quem fez LISTEN recebe sem precisar consultar a tabela
CREATE FUNCTION "monitor"."notify_event"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('dbwatch_events', row_to_json(NEW)::text);
  RETURN NULL;
END $$;

CREATE TRIGGER "app_events_notify" AFTER INSERT ON "monitor"."app_events"
  FOR EACH ROW EXECUTE FUNCTION "monitor"."notify_event"();

-- A API só registra eventos; o coletor registra alertas, lê e aplica a retenção
GRANT USAGE ON SCHEMA "monitor" TO dbwatch_app;
GRANT INSERT ON "monitor"."app_events" TO dbwatch_app;
GRANT SELECT, INSERT, DELETE ON "monitor"."app_events" TO dbwatch_monitor;
