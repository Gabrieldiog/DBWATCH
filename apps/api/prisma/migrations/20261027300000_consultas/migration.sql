-- CreateTable
CREATE TABLE "pam"."query_templates" (
    "code" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "access_level" "pam"."access_level" NOT NULL,
    "title" TEXT NOT NULL,
    "sql_text" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '[]',
    "max_rows" INTEGER NOT NULL,
    "timeout_ms" INTEGER NOT NULL,

    CONSTRAINT "query_templates_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "pam"."query_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_code" TEXT NOT NULL,
    "grant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "params" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "sqlstate" TEXT,
    "row_count" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_executions_user_id_executed_at_idx" ON "pam"."query_executions"("user_id", "executed_at" DESC);

-- AddForeignKey
ALTER TABLE "pam"."query_templates" ADD CONSTRAINT "query_templates_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "pam"."resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."query_executions" ADD CONSTRAINT "query_executions_template_code_fkey" FOREIGN KEY ("template_code") REFERENCES "pam"."query_templates"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."query_executions" ADD CONSTRAINT "query_executions_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "pam"."access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pam"."query_executions" ADD CONSTRAINT "query_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===== Escrito à mão: o que o schema.prisma não expressa =====

ALTER TABLE "pam"."query_templates"
  ADD CONSTRAINT "query_templates_limits_ck" CHECK ("max_rows" BETWEEN 1 AND 500 AND "timeout_ms" BETWEEN 100 AND 10000),
  ADD CONSTRAINT "query_templates_params_ck" CHECK (jsonb_typeof("params") = 'array');
ALTER TABLE "pam"."query_executions"
  ADD CONSTRAINT "query_executions_outcome_ck" CHECK ("outcome" IN ('SUCCESS', 'FAILURE')),
  ADD CONSTRAINT "query_executions_sqlstate_ck" CHECK (("outcome" = 'FAILURE') = ("sqlstate" IS NOT NULL));

-- Recursos fictícios do banco-alvo (antes vinham do seed); o catálogo depende deles
INSERT INTO "pam"."resources" ("name", "database_name", "sensitivity", "max_grant_minutes") VALUES
  ('Catálogo de produtos', 'dbwatch_target', 'LOW', 120),
  ('Clientes', 'dbwatch_target', 'MEDIUM', 60),
  ('Financeiro', 'dbwatch_target', 'HIGH', 30)
ON CONFLICT ("name") DO NOTHING;

-- Parâmetros sempre posicionais ($1, $2): o valor do usuário nunca vira texto SQL
INSERT INTO "pam"."query_templates" ("code", "resource_id", "access_level", "title", "sql_text", "params", "max_rows", "timeout_ms")
SELECT t.code, r."id", 'READ', t.title, t.sql_text, t.params::jsonb, t.max_rows, t.timeout_ms
  FROM (VALUES
    ('produtos_por_categoria', 'Catálogo de produtos', 'Produtos de uma categoria',
     'SELECT id, nome, preco FROM loja.produtos WHERE categoria = $1 ORDER BY nome', '[{"name":"categoria","type":"text"}]', 100, 2000),
    ('clientes_por_cidade', 'Clientes', 'Clientes de uma cidade (e-mail mascarado)',
     'SELECT id, nome, left(email, 3) || ''***'' AS email FROM loja.clientes WHERE cidade = $1 ORDER BY id', '[{"name":"cidade","type":"text"}]', 50, 2000),
    ('faturamento_mensal', 'Financeiro', 'Faturamento por mês',
     'SELECT to_char(date_trunc(''month'', criado_em), ''YYYY-MM'') AS mes, sum(valor) AS total FROM loja.pedidos GROUP BY 1 ORDER BY 1', '[]', 24, 3000),
    -- LAB: dorme de propósito para demonstrar o tempo-limite (57014)
    ('relatorio_lento', 'Catálogo de produtos', 'LAB: relatório que demora (tempo-limite de 1 s)',
     'SELECT pg_sleep($1::int) IS NULL AS dormiu', '[{"name":"segundos","type":"int"}]', 1, 1000)
  ) AS t(code, resource_name, title, sql_text, params, max_rows, timeout_ms)
  JOIN "pam"."resources" r ON r."name" = t.resource_name;

GRANT SELECT ON "pam"."query_templates" TO dbwatch_app;
-- Execução é registro histórico: a API insere e lê, nunca altera nem apaga
GRANT SELECT, INSERT ON "pam"."query_executions" TO dbwatch_app;
