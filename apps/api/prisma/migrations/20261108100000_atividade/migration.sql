-- PK-20c: toda ação auditada aparece ao vivo no Monitor. O evento nasce na mesma transação do registro de auditoria:
-- se a ação for desfeita, o evento também some; o Monitor nunca mostra algo que não aconteceu
ALTER TABLE "monitor"."app_events"
  DROP CONSTRAINT "app_events_kind_check",
  ADD CONSTRAINT "app_events_kind_check" CHECK ("kind" IN ('TX_ROLLBACK', 'ALERT', 'LAB', 'ACTIVITY'));

-- Só ação, resultado e motivo: quem fez e os metadados ficam na auditoria, para quem tem audit:read
CREATE FUNCTION "monitor"."activity_from_audit"() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO "monitor"."app_events" ("kind", "code", "severity", "operation", "correlation_id", "detail")
  VALUES ('ACTIVITY', 'AUDIT',
          CASE NEW."outcome"::text WHEN 'SUCCESS' THEN 'info' WHEN 'DENIED' THEN 'medium' ELSE 'high' END,
          NEW."action", NEW."correlation_id",
          jsonb_strip_nulls(jsonb_build_object('resultado', NEW."outcome"::text, 'motivo', NEW."reason")));
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION "monitor"."activity_from_audit"() FROM PUBLIC;

CREATE TRIGGER "audit_log_activity" AFTER INSERT ON "audit"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "monitor"."activity_from_audit"();
