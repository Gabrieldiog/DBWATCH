-- PK-26: quem pede escolhe quem aprova, e só essa pessoa decide. A API exige a escolha em todo pedido novo; o banco
-- garante as regras mesmo se a API falhar. Pedidos antigos e os de emergência (break-glass) ficam sem aprovador
-- escolhido (NULL) e seguem a regra de antes
ALTER TABLE "pam"."access_requests" ADD COLUMN "approver_id" UUID;
ALTER TABLE "pam"."access_requests"
  ADD CONSTRAINT "access_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "iam"."users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Ninguém escolhe a si mesmo para aprovar
  ADD CONSTRAINT "access_requests_approver_not_requester_ck" CHECK ("approver_id" IS NULL OR "approver_id" <> "requester_id"),
  -- Aprovar ou rejeitar só vale se quem decidiu é a pessoa escolhida. O PostgreSQL confere as CHECK em ordem de nome:
  -- este nome vem depois de access_requests_sod_ck, então a autoaprovação continua barrada pela separação de funções
  ADD CONSTRAINT "access_requests_somente_escolhido_ck"
    CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR "approver_id" IS NULL OR "decided_by" = "approver_id"),
  -- Sensibilidade alta: a escolhida dá a aprovação final, então a primeira precisa ser de outra pessoa
  ADD CONSTRAINT "access_requests_first_not_approver_ck"
    CHECK ("first_approved_by" IS NULL OR "approver_id" IS NULL OR "first_approved_by" <> "approver_id");

-- A fila de cada aprovador: os pedidos pendentes que chegaram para ele
CREATE INDEX "access_requests_approver_pending_idx" ON "pam"."access_requests" ("approver_id") WHERE "status" = 'PENDING';
