-- AlterTable
ALTER TABLE "pam"."access_grants" ADD COLUMN     "expiry_audited_at" TIMESTAMPTZ(6),
ADD COLUMN     "revoke_reason" TEXT,
ADD COLUMN     "revoked_by" UUID;

-- AddForeignKey
ALTER TABLE "pam"."access_grants" ADD CONSTRAINT "access_grants_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

-- Revogação sempre tem autor e motivo; a expiração é auditada uma vez só, e só depois de acontecer
ALTER TABLE "pam"."access_grants"
  ADD CONSTRAINT "access_grants_revoke_ck"
    CHECK (("revoked_at" IS NULL) = ("revoked_by" IS NULL) AND ("revoked_at" IS NULL) = ("revoke_reason" IS NULL)),
  ADD CONSTRAINT "access_grants_revoke_reason_ck" CHECK (char_length(btrim("revoke_reason")) BETWEEN 5 AND 500),
  ADD CONSTRAINT "access_grants_expiry_audit_ck" CHECK ("expiry_audited_at" IS NULL OR "expiry_audited_at" >= "expires_at");

-- O job de expiração só olha concessões vencidas e ainda não auditadas
CREATE INDEX "access_grants_expiry_pending_idx" ON "pam"."access_grants" ("expires_at")
  WHERE "revoked_at" IS NULL AND "expiry_audited_at" IS NULL;

-- RLS: cada um vê as próprias concessões; quem pode revogar vê todas; quem revisa pedidos cria (na aprovação)
ALTER TABLE "pam"."access_grants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grants_visible" ON "pam"."access_grants" FOR SELECT TO dbwatch_app
  USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid OR current_setting('app.can_revoke', true) = 'on');
CREATE POLICY "grants_insert_on_approval" ON "pam"."access_grants" FOR INSERT TO dbwatch_app
  WITH CHECK (current_setting('app.can_review', true) = 'on');
CREATE POLICY "grants_update" ON "pam"."access_grants" FOR UPDATE TO dbwatch_app
  USING (current_setting('app.can_revoke', true) = 'on');
