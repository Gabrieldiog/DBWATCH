-- CreateTable
CREATE TABLE "iam"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "ip" INET,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "iam"."sessions"("token_hash");

-- AddForeignKey
ALTER TABLE "iam"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== Escrito à mão =====

-- O token nunca é guardado: só o SHA-256 dele (32 bytes)
ALTER TABLE "iam"."sessions"
  ADD CONSTRAINT "sessions_token_hash_len_ck" CHECK (octet_length("token_hash") = 32),
  ADD CONSTRAINT "sessions_period_ck" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "sessions_revoked_ck" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
  ADD CONSTRAINT "sessions_user_agent_ck" CHECK (char_length("user_agent") <= 256);

-- Indexa só as sessões vivas: "encerrar todas as sessões do usuário" não varre o histórico
CREATE INDEX "sessions_user_active_idx" ON "iam"."sessions" ("user_id") WHERE "revoked_at" IS NULL;

-- Sessão é revogada, nunca apagada: o histórico de logins é evidência
GRANT SELECT, INSERT, UPDATE ON "iam"."sessions" TO dbwatch_app;
