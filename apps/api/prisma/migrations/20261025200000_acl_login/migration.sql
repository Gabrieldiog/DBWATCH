-- CreateEnum
CREATE TYPE "iam"."acl_action" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "iam"."login_acl" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "priority" SMALLINT NOT NULL,
    "action" "iam"."acl_action" NOT NULL,
    "ip_range" INET,
    "user_id" UUID,
    "weekdays" SMALLINT[],
    "start_time" TIME(0),
    "end_time" TIME(0),
    "description" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_acl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_acl_ip_range_idx" ON "iam"."login_acl" USING GIST ("ip_range" inet_ops);

-- CreateIndex
CREATE INDEX "login_acl_priority_idx" ON "iam"."login_acl"("priority");

-- AddForeignKey
ALTER TABLE "iam"."login_acl" ADD CONSTRAINT "login_acl_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."login_acl" ADD CONSTRAINT "login_acl_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

-- O Prisma não suporta cidr; inet + esta CHECK dá a mesma garantia (faixa sem bits de host, ex.: 10.0.0.0/8)
ALTER TABLE "iam"."login_acl"
  ADD CONSTRAINT "login_acl_ip_range_ck" CHECK ("ip_range" IS NULL OR "ip_range" = network("ip_range")),
  ADD CONSTRAINT "login_acl_priority_ck" CHECK ("priority" BETWEEN 1 AND 1000),
  ADD CONSTRAINT "login_acl_weekdays_ck"
    CHECK ("weekdays" IS NULL OR (cardinality("weekdays") BETWEEN 1 AND 7 AND "weekdays" <@ '{1,2,3,4,5,6,7}'::smallint[])),
  ADD CONSTRAINT "login_acl_window_ck"
    CHECK (("start_time" IS NULL) = ("end_time" IS NULL) AND ("start_time" IS NULL OR "start_time" < "end_time")),
  ADD CONSTRAINT "login_acl_description_ck" CHECK (char_length(btrim("description")) BETWEEN 1 AND 200),
  -- Uma regra que nega tudo, para todos, sempre, trancaria o sistema inteiro
  ADD CONSTRAINT "login_acl_no_deny_all_ck" CHECK (
    "action" = 'ALLOW' OR "ip_range" IS NOT NULL OR "user_id" IS NOT NULL OR "weekdays" IS NOT NULL OR "start_time" IS NOT NULL
  );

-- A decisão fica no banco: a regra de menor prioridade que casar com usuário, IP e horário de Brasília vence
-- Sem regra que case, devolve vazio e o login segue (a ACL restringe, não substitui a senha)
CREATE FUNCTION "iam"."login_acl_decision"(p_user UUID, p_ip INET, p_at TIMESTAMPTZ DEFAULT now())
RETURNS TABLE ("action" "iam"."acl_action", "rule_id" UUID)
LANGUAGE sql STABLE AS $$
  SELECT a."action", a."id"
    FROM "iam"."login_acl" a,
         LATERAL (SELECT p_at AT TIME ZONE 'America/Sao_Paulo' AS local) t
   WHERE (a."ip_range" IS NULL OR a."ip_range" >>= p_ip)
     AND (a."user_id" IS NULL OR a."user_id" = p_user)
     AND (a."weekdays" IS NULL OR extract(isodow FROM t.local)::smallint = ANY (a."weekdays"))
     AND (a."start_time" IS NULL OR t.local::time >= a."start_time" AND t.local::time < a."end_time")
   ORDER BY a."priority", a."created_at"
   LIMIT 1
$$;

GRANT SELECT, INSERT, DELETE ON "iam"."login_acl" TO dbwatch_app;
REVOKE EXECUTE ON FUNCTION "iam"."login_acl_decision"(UUID, INET, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "iam"."login_acl_decision"(UUID, INET, TIMESTAMPTZ) TO dbwatch_app;
