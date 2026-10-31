-- LAB: plantão médico fictício para o write skew. Regra de negócio: sempre pelo menos uma pessoa de plantão
CREATE TABLE "lab"."on_call" (
  "id"      INT PRIMARY KEY,
  "name"    TEXT NOT NULL,
  "on_duty" BOOLEAN NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON "lab"."on_call" TO dbwatch_lab;
