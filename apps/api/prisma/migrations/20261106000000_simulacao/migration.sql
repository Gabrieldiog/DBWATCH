-- Simulação de incidente (LAB): a narração de cada passo entra no mesmo fluxo de eventos do monitor, com fonte LAB
ALTER TABLE "monitor"."app_events"
  DROP CONSTRAINT "app_events_kind_check",
  ADD CONSTRAINT "app_events_kind_check" CHECK ("kind" IN ('TX_ROLLBACK', 'ALERT', 'LAB'));
