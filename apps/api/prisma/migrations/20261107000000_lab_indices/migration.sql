-- LAB: 200 mil leituras de sensores fictícios, uma a cada 12 s, em ordem de horário (a ordem física acompanha o tempo).
-- Duas cópias iguais: uma com B-tree e outra com BRIN em lida_em, para o planejador não escolher entre os dois
CREATE TABLE "lab"."leituras" (
  "id"      BIGINT PRIMARY KEY,
  "sensor"  INT NOT NULL,
  "lida_em" TIMESTAMPTZ NOT NULL,
  "valor"   NUMERIC(6, 2) NOT NULL
);
INSERT INTO "lab"."leituras"
SELECT g, g % 50, TIMESTAMPTZ '2026-10-01 00:00:00-03' + g * INTERVAL '12 seconds', round((20 + (g % 97) / 10.0)::numeric, 2)
  FROM generate_series(1, 200000) AS g;

CREATE TABLE "lab"."leituras_brin" (LIKE "lab"."leituras" INCLUDING ALL);
INSERT INTO "lab"."leituras_brin" SELECT * FROM "lab"."leituras";

CREATE INDEX "leituras_lida_em_btree" ON "lab"."leituras" USING btree ("lida_em");
CREATE INDEX "leituras_brin_lida_em_brin" ON "lab"."leituras_brin" USING brin ("lida_em");
ANALYZE "lab"."leituras";
ANALYZE "lab"."leituras_brin";

GRANT SELECT ON "lab"."leituras", "lab"."leituras_brin" TO dbwatch_lab;
