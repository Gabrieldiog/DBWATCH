-- LAB: experimentos de concorrência reais, isolados do produto (ADR-013). Fora do schema.prisma
CREATE SCHEMA "lab";

-- Contas fictícias: a CHECK é a regra de negócio que a transferência do T-LAB-01 tenta violar
CREATE TABLE "lab"."accounts" (
  "id"      INT PRIMARY KEY,
  "owner"   TEXT NOT NULL,
  "balance" NUMERIC(12, 2) NOT NULL CONSTRAINT "accounts_balance_ck" CHECK ("balance" >= 0)
);

-- Histórico das execuções: cada passo com sessão, SQL, tempo e SQLSTATE
CREATE TABLE "lab"."runs" (
  "id"          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "scenario"    TEXT NOT NULL CHECK ("scenario" ~ '^[a-z-]{3,40}$'),
  "started_by"  UUID NOT NULL,
  "started_at"  TIMESTAMPTZ NOT NULL,
  "finished_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "outcome"     TEXT NOT NULL CHECK ("outcome" IN ('OK', 'FAILED')),
  "steps"       JSONB NOT NULL CHECK (jsonb_typeof("steps") = 'array'),
  CHECK ("finished_at" >= "started_at")
);

-- O papel do lab só enxerga o schema lab: não lê iam, pam, audit nem monitor
REVOKE ALL ON SCHEMA "lab" FROM PUBLIC;
GRANT USAGE ON SCHEMA "lab" TO dbwatch_lab;
GRANT SELECT, INSERT, UPDATE ON "lab"."accounts" TO dbwatch_lab;
GRANT SELECT, INSERT ON "lab"."runs" TO dbwatch_lab;
