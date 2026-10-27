-- AlterTable
ALTER TABLE "pam"."access_requests" ADD COLUMN     "first_approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "first_approved_by" UUID;

-- AddForeignKey
ALTER TABLE "pam"."access_requests" ADD CONSTRAINT "access_requests_first_approved_by_fkey" FOREIGN KEY ("first_approved_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

ALTER TABLE "pam"."access_requests"
  ADD CONSTRAINT "access_requests_first_approval_ck" CHECK (("first_approved_by" IS NULL) = ("first_approved_at" IS NULL)),
  ADD CONSTRAINT "access_requests_first_sod_ck" CHECK ("first_approved_by" IS NULL OR "first_approved_by" <> "requester_id"),
  ADD CONSTRAINT "access_requests_two_people_ck" CHECK ("first_approved_by" IS NULL OR "first_approved_by" <> "decided_by");

-- Recurso HIGH só é aprovado com duas pessoas diferentes; a regra cruza tabelas, por isso é trigger
CREATE FUNCTION "pam"."check_two_level_approval"() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."first_approved_by" IS NULL AND
     (SELECT "sensitivity" FROM "pam"."resources" WHERE "id" = NEW."resource_id") = 'HIGH' THEN
    RAISE EXCEPTION 'Recurso HIGH exige dois aprovadores diferentes' USING ERRCODE = 'DW004';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "access_requests_two_level" BEFORE UPDATE OF "status" ON "pam"."access_requests"
  FOR EACH ROW WHEN (NEW."status" = 'APPROVED' AND OLD."status" = 'PENDING')
  EXECUTE FUNCTION "pam"."check_two_level_approval"();

-- RLS: rede de segurança contra IDOR. Mesmo que a API esqueça o filtro do dono, o banco só devolve as linhas permitidas
-- A API declara quem é o usuário em cada transação com set_config(..., true), que vale só até o COMMIT
ALTER TABLE "pam"."access_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_visible" ON "pam"."access_requests" FOR SELECT TO dbwatch_app
  USING ("requester_id" = NULLIF(current_setting('app.user_id', true), '')::uuid OR current_setting('app.can_review', true) = 'on');
CREATE POLICY "requests_insert_own" ON "pam"."access_requests" FOR INSERT TO dbwatch_app
  WITH CHECK ("requester_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);
CREATE POLICY "requests_update" ON "pam"."access_requests" FOR UPDATE TO dbwatch_app
  USING ("requester_id" = NULLIF(current_setting('app.user_id', true), '')::uuid OR current_setting('app.can_review', true) = 'on');
