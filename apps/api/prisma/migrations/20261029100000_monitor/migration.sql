-- Monitor por amostragem (ADR-012). Fora do schema.prisma, como a auditoria: acesso só por SQL explícito
CREATE SCHEMA "monitor";

-- Contadores acumulados de pg_stat_database; as taxas saem depois com LAG()
CREATE TABLE "monitor"."db_samples" (
  "sampled_at"    TIMESTAMPTZ NOT NULL,
  "datname"       TEXT NOT NULL,
  "numbackends"   INT NOT NULL,
  "xact_commit"   BIGINT NOT NULL,
  "xact_rollback" BIGINT NOT NULL,
  "deadlocks"     BIGINT NOT NULL,
  "blks_hit"      BIGINT NOT NULL,
  "blks_read"     BIGINT NOT NULL,
  "temp_files"    BIGINT NOT NULL,
  "stats_reset"   TIMESTAMPTZ,
  PRIMARY KEY ("datname", "sampled_at")
);

-- Sessões sem o texto da query: só o primeiro comando (SELECT, UPDATE...), nunca literais
CREATE TABLE "monitor"."activity_samples" (
  "sampled_at"       TIMESTAMPTZ NOT NULL,
  "pid"              INT NOT NULL,
  "datname"          TEXT,
  "usename"          TEXT,
  "application_name" TEXT,
  "state"            TEXT,
  "wait_event_type"  TEXT,
  "wait_event"       TEXT,
  "xact_age_ms"      BIGINT,
  "command"          TEXT CHECK ("command" ~ '^[A-Z]{1,12}$'),
  PRIMARY KEY ("sampled_at", "pid")
);

-- Quem espera quem: pares bloqueado/bloqueador de pg_blocking_pids()
CREATE TABLE "monitor"."lock_samples" (
  "sampled_at"   TIMESTAMPTZ NOT NULL,
  "blocked_pid"  INT NOT NULL,
  "blocking_pid" INT NOT NULL,
  "datname"      TEXT,
  "locktype"     TEXT,
  "mode"         TEXT,
  "relation"     TEXT,
  "wait_ms"      BIGINT,
  "blocked_app"  TEXT,
  "blocking_app" TEXT,
  PRIMARY KEY ("sampled_at", "blocked_pid", "blocking_pid")
);

-- Séries temporais só crescem no tempo: o BRIN fica minúsculo e atende filtros por período e a retenção
CREATE INDEX "db_samples_time_brin" ON "monitor"."db_samples" USING brin ("sampled_at");
CREATE INDEX "activity_samples_time_brin" ON "monitor"."activity_samples" USING brin ("sampled_at");
CREATE INDEX "lock_samples_time_brin" ON "monitor"."lock_samples" USING brin ("sampled_at");

-- O coletor (dbwatch_monitor) grava, lê e aplica a retenção; não enxerga iam nem pam
REVOKE ALL ON SCHEMA "monitor" FROM PUBLIC;
GRANT USAGE ON SCHEMA "monitor" TO dbwatch_monitor;
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA "monitor" TO dbwatch_monitor;
