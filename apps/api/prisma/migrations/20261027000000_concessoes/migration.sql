-- CreateTable
CREATE TABLE "pam"."access_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "access_level" "pam"."access_level" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_grants_request_id_key" ON "pam"."access_grants"("request_id");

-- AddForeignKey
ALTER TABLE "pam"."access_grants" ADD CONSTRAINT "access_grants_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "pam"."access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."access_grants" ADD CONSTRAINT "access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."access_grants" ADD CONSTRAINT "access_grants_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "pam"."resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

-- btree_gist deixa o mesmo índice GiST misturar igualdade (=) com sobreposição de intervalos (&&)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "pam"."access_grants"
  ADD CONSTRAINT "access_grants_period_ck" CHECK ("expires_at" > "starts_at"),
  ADD CONSTRAINT "access_grants_revoked_ck" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "starts_at"),
  -- A EXCLUDE generaliza o UNIQUE: proíbe duas concessões vivas da mesma pessoa no mesmo recurso com períodos que se cruzam
  ADD CONSTRAINT "access_grants_no_overlap" EXCLUDE USING gist (
    "user_id" WITH =,
    "resource_id" WITH =,
    tstzrange("starts_at", "expires_at", '[)') WITH &&
  ) WHERE ("revoked_at" IS NULL);

GRANT SELECT, INSERT, UPDATE ON "pam"."access_grants" TO dbwatch_app;
