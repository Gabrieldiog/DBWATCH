-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pam";

-- CreateEnum
CREATE TYPE "pam"."sensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "pam"."access_level" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "pam"."request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pam"."resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "database_name" TEXT NOT NULL,
    "sensitivity" "pam"."sensitivity" NOT NULL,
    "max_grant_minutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pam"."access_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "access_level" "pam"."access_level" NOT NULL,
    "requested_minutes" INTEGER NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "pam"."request_status" NOT NULL DEFAULT 'PENDING',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resources_name_key" ON "pam"."resources"("name");

-- CreateIndex
CREATE INDEX "access_requests_requester_id_created_at_idx" ON "pam"."access_requests"("requester_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "pam"."access_requests" ADD CONSTRAINT "access_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."access_requests" ADD CONSTRAINT "access_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."access_requests" ADD CONSTRAINT "access_requests_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "pam"."resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

ALTER TABLE "pam"."resources"
  ADD CONSTRAINT "resources_name_ck" CHECK (char_length(btrim("name")) BETWEEN 3 AND 80),
  ADD CONSTRAINT "resources_max_grant_ck" CHECK ("max_grant_minutes" BETWEEN 5 AND 480);

ALTER TABLE "pam"."access_requests"
  ADD CONSTRAINT "access_requests_justification_ck" CHECK (char_length(btrim("justification")) BETWEEN 20 AND 500),
  ADD CONSTRAINT "access_requests_minutes_ck" CHECK ("requested_minutes" BETWEEN 5 AND 480),
  -- Separação de funções: quem pede nunca decide, nem que um bug na API deixe passar
  ADD CONSTRAINT "access_requests_sod_ck" CHECK ("decided_by" IS NULL OR "decided_by" <> "requester_id"),
  ADD CONSTRAINT "access_requests_decision_ck"
    CHECK (("status" IN ('APPROVED', 'REJECTED')) = ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL));

-- Um pedido pendente por pessoa e recurso: o UNIQUE só vale para as linhas PENDING
CREATE UNIQUE INDEX "access_requests_one_pending_uk" ON "pam"."access_requests" ("requester_id", "resource_id")
  WHERE "status" = 'PENDING';
-- A fila do aprovador é pequena; o índice parcial também
CREATE INDEX "access_requests_queue_idx" ON "pam"."access_requests" ("created_at") WHERE "status" = 'PENDING';

-- Regra que cruza tabelas (CHECK não enxerga outra tabela): recurso ativo e duração dentro do máximo dele
CREATE FUNCTION "pam"."check_request_limits"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE r "pam"."resources";
BEGIN
  SELECT * INTO r FROM "pam"."resources" WHERE "id" = NEW."resource_id";
  IF NOT r."active" THEN
    RAISE EXCEPTION 'Recurso inativo' USING ERRCODE = 'DW002';
  END IF;
  IF NEW."requested_minutes" > r."max_grant_minutes" THEN
    RAISE EXCEPTION 'Duração acima do máximo do recurso (% min)', r."max_grant_minutes" USING ERRCODE = 'DW003';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "access_requests_limits" BEFORE INSERT ON "pam"."access_requests"
  FOR EACH ROW EXECUTE FUNCTION "pam"."check_request_limits"();

REVOKE ALL ON SCHEMA "pam" FROM PUBLIC;
GRANT USAGE ON SCHEMA "pam" TO dbwatch_app;
GRANT SELECT, INSERT, UPDATE ON "pam"."resources" TO dbwatch_app;
-- Pedido nunca é apagado: vira REJECTED ou CANCELLED, e o histórico fica
GRANT SELECT, INSERT, UPDATE ON "pam"."access_requests" TO dbwatch_app;
