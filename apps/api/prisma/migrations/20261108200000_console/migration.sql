-- PK-21: o console SQL com escrita. Cada recurso diz qual papel do banco-alvo ele pode "vestir" (SET ROLE);
-- o nome vem só daqui, nunca da requisição, e a CHECK impede apontar para outro papel qualquer
ALTER TABLE "pam"."resources" ADD COLUMN "write_role" TEXT;
ALTER TABLE "pam"."resources" ADD CONSTRAINT "resources_write_role_ck"
  CHECK ("write_role" IS NULL OR "write_role" ~ '^dbwatch_rw_[a-z]+$');
UPDATE "pam"."resources" SET "write_role" = 'dbwatch_rw_catalogo' WHERE "name" = 'Catálogo de produtos';
UPDATE "pam"."resources" SET "write_role" = 'dbwatch_rw_clientes' WHERE "name" = 'Clientes';
UPDATE "pam"."resources" SET "write_role" = 'dbwatch_rw_financeiro' WHERE "name" = 'Financeiro';
