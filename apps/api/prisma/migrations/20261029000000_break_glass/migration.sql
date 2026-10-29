-- AlterTable
ALTER TABLE "pam"."access_requests" ADD COLUMN     "break_glass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by" UUID;

-- AddForeignKey
ALTER TABLE "pam"."access_requests" ADD CONSTRAINT "access_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

-- Break-glass: acesso de emergência sem aprovação prévia, só para quem tem a permissão (ADMIN)
INSERT INTO "iam"."permissions" ("code", "description") VALUES ('breakglass:use', 'Acesso de emergência sem aprovação prévia');
INSERT INTO "iam"."role_permissions" ("role_id", "permission_code") SELECT "id", 'breakglass:use' FROM "iam"."roles" WHERE "code" = 'ADMIN';

-- A única exceção à separação de funções: o próprio usuário "decide" um break-glass, curto e muito bem justificado
ALTER TABLE "pam"."access_requests"
  DROP CONSTRAINT "access_requests_sod_ck",
  ADD CONSTRAINT "access_requests_sod_ck" CHECK ("decided_by" IS NULL OR "decided_by" <> "requester_id" OR "break_glass"),
  ADD CONSTRAINT "access_requests_break_glass_ck"
    CHECK (NOT "break_glass" OR ("requested_minutes" <= 15 AND char_length(btrim("justification")) >= 40)),
  -- A revisão posterior é de outra pessoa, e só existe para break-glass
  ADD CONSTRAINT "access_requests_review_ck" CHECK (
    ("reviewed_by" IS NULL) = ("reviewed_at" IS NULL)
    AND ("reviewed_by" IS NULL OR ("break_glass" AND "reviewed_by" <> "requester_id" AND char_length(btrim("review_note")) >= 5))
  );

CREATE INDEX "access_requests_break_glass_unreviewed_idx" ON "pam"."access_requests" ("created_at")
  WHERE "break_glass" AND "reviewed_by" IS NULL;

-- Vale para a API (dbwatch_app): pedido comum nasce PENDING, e break-glass exige a permissão no catálogo
CREATE FUNCTION "pam"."check_new_request"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user <> 'dbwatch_app' THEN
    RETURN NEW;
  END IF;
  IF NOT NEW."break_glass" AND NEW."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'Pedido comum precisa nascer pendente' USING ERRCODE = 'DW005';
  END IF;
  IF NEW."break_glass" AND NOT EXISTS (
    SELECT 1 FROM "iam"."user_roles" ur JOIN "iam"."role_permissions" rp ON rp."role_id" = ur."role_id"
     WHERE ur."user_id" = NEW."requester_id" AND rp."permission_code" = 'breakglass:use'
  ) THEN
    RAISE EXCEPTION 'Sem permissão de break-glass' USING ERRCODE = 'DW006';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "access_requests_new" BEFORE INSERT ON "pam"."access_requests"
  FOR EACH ROW EXECUTE FUNCTION "pam"."check_new_request"();

-- Na aprovação comum, quem revisa cria a concessão; no break-glass, o próprio usuário cria a dele
DROP POLICY "grants_insert_on_approval" ON "pam"."access_grants";
CREATE POLICY "grants_insert" ON "pam"."access_grants" FOR INSERT TO dbwatch_app WITH CHECK (
  current_setting('app.can_review', true) = 'on'
  OR ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND EXISTS (SELECT 1 FROM "pam"."access_requests" r WHERE r."id" = "request_id" AND r."break_glass"))
);
