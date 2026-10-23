-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "iam";

-- CreateEnum
CREATE TYPE "iam"."user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "iam"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "iam"."user_status" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."roles" (
    "id" SMALLINT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."permissions" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "iam"."role_permissions" (
    "role_id" SMALLINT NOT NULL,
    "permission_code" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_code")
);

-- CreateTable
CREATE TABLE "iam"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" SMALLINT NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "iam"."roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "iam"."user_roles"("role_id");

-- AddForeignKey
ALTER TABLE "iam"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "iam"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."role_permissions" ADD CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "iam"."permissions"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "iam"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== Escrito à mão: o que o schema.prisma não expressa =====

-- Ana@x.com e ana@x.com são a mesma conta; o índice também atende o login
CREATE UNIQUE INDEX "users_email_lower_uk" ON "iam"."users" (lower("email"));

ALTER TABLE "iam"."users"
  ADD CONSTRAINT "users_email_format_ck"
    CHECK ("email" = btrim("email") AND char_length("email") BETWEEN 3 AND 254 AND position('@' IN "email") > 1),
  ADD CONSTRAINT "users_display_name_ck" CHECK (char_length(btrim("display_name")) BETWEEN 1 AND 120),
  ADD CONSTRAINT "users_failed_login_count_ck" CHECK ("failed_login_count" >= 0);

-- Separação de funções: ninguém atribui papel a si mesmo
ALTER TABLE "iam"."user_roles"
  ADD CONSTRAINT "user_roles_no_self_grant_ck" CHECK ("granted_by" IS NULL OR "granted_by" <> "user_id");

-- Catálogo de papéis e permissões (docs/SECURITY.md §5), versionado junto com o schema
INSERT INTO "iam"."roles" ("id", "code", "name") VALUES
  (1, 'ADMIN', 'Administrador'),
  (2, 'APPROVER', 'Aprovador'),
  (3, 'REQUESTER', 'Solicitante'),
  (4, 'AUDITOR', 'Auditor');

INSERT INTO "iam"."permissions" ("code", "description") VALUES
  ('request:create', 'Criar solicitação de acesso'),
  ('request:read:own', 'Ver as próprias solicitações'),
  ('request:review', 'Ver a fila e aprovar ou rejeitar solicitações'),
  ('grant:read:own', 'Ver as próprias concessões'),
  ('grant:revoke', 'Revogar concessões'),
  ('query:execute', 'Executar consultas do catálogo com concessão ativa'),
  ('user:manage', 'Gerenciar usuários'),
  ('role:assign', 'Atribuir e remover papéis'),
  ('audit:read', 'Consultar a trilha de auditoria'),
  ('audit:verify', 'Verificar a integridade da auditoria'),
  ('monitor:read', 'Ver o monitor do banco'),
  ('lab:run', 'Executar experimentos do laboratório');

-- O ADMIN não lê a auditoria: quem administra não fiscaliza
INSERT INTO "iam"."role_permissions" ("role_id", "permission_code")
SELECT r.id, p.code
FROM (VALUES
  ('ADMIN', 'request:create'), ('ADMIN', 'request:read:own'), ('ADMIN', 'grant:read:own'),
  ('ADMIN', 'grant:revoke'), ('ADMIN', 'query:execute'), ('ADMIN', 'user:manage'),
  ('ADMIN', 'role:assign'), ('ADMIN', 'monitor:read'), ('ADMIN', 'lab:run'),
  ('APPROVER', 'request:create'), ('APPROVER', 'request:read:own'), ('APPROVER', 'request:review'),
  ('APPROVER', 'grant:read:own'), ('APPROVER', 'grant:revoke'), ('APPROVER', 'query:execute'),
  ('APPROVER', 'monitor:read'),
  ('REQUESTER', 'request:create'), ('REQUESTER', 'request:read:own'), ('REQUESTER', 'grant:read:own'),
  ('REQUESTER', 'query:execute'),
  ('AUDITOR', 'audit:read'), ('AUDITOR', 'audit:verify'), ('AUDITOR', 'monitor:read')
) AS m(role_code, permission_code)
JOIN "iam"."roles" r ON r.code = m.role_code
JOIN "iam"."permissions" p ON p.code = m.permission_code;

-- Menor privilégio: usuários nunca são apagados e o catálogo só muda por migration
REVOKE ALL ON SCHEMA "iam" FROM PUBLIC;
GRANT USAGE ON SCHEMA "iam" TO dbwatch_app;
GRANT SELECT, INSERT, UPDATE ON "iam"."users" TO dbwatch_app;
GRANT SELECT, INSERT, DELETE ON "iam"."user_roles" TO dbwatch_app;
GRANT SELECT ON "iam"."roles", "iam"."permissions", "iam"."role_permissions" TO dbwatch_app;
