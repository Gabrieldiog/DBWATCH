-- PK-25: o Monitor diz quem fez. Antes o evento levava só ação e resultado; na operação, "consulta negada" sem nome
-- não ajuda ninguém. Vai só o nome de exibição de quem agiu e o nome do recurso (ou da pessoa afetada): e-mail, IP e
-- metadados continuam só na auditoria, para quem tem audit:read. As buscas comparam texto com texto, então um
-- resource_id fora do formato nunca derruba a ação auditada (o gatilho roda na mesma transação dela)
CREATE OR REPLACE FUNCTION "monitor"."activity_from_audit"() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  quem text := (SELECT "display_name" FROM "iam"."users" WHERE "id" = NEW."actor_id");
  alvo text := CASE NEW."resource_type"
    WHEN 'resource' THEN (SELECT "name" FROM "pam"."resources" WHERE "id"::text = NEW."resource_id")
    WHEN 'query_template' THEN (SELECT r."name" FROM "pam"."query_templates" t JOIN "pam"."resources" r ON r."id" = t."resource_id"
                                WHERE t."code" = NEW."resource_id" LIMIT 1)
    WHEN 'access_request' THEN (SELECT r."name" FROM "pam"."access_requests" q JOIN "pam"."resources" r ON r."id" = q."resource_id"
                                WHERE q."id"::text = NEW."resource_id")
    WHEN 'access_grant' THEN (SELECT r."name" FROM "pam"."access_grants" g JOIN "pam"."resources" r ON r."id" = g."resource_id"
                              WHERE g."id"::text = NEW."resource_id")
    WHEN 'user' THEN (SELECT "display_name" FROM "iam"."users" WHERE "id"::text = NEW."resource_id")
  END;
BEGIN
  INSERT INTO "monitor"."app_events" ("kind", "code", "severity", "operation", "correlation_id", "detail")
  VALUES ('ACTIVITY', 'AUDIT',
          CASE NEW."outcome"::text WHEN 'SUCCESS' THEN 'info' WHEN 'DENIED' THEN 'medium' ELSE 'high' END,
          NEW."action", NEW."correlation_id",
          jsonb_strip_nulls(jsonb_build_object('resultado', NEW."outcome"::text, 'motivo', NEW."reason", 'quem', quem,
                                               'alvo', alvo, 'tipoAlvo', NEW."resource_type")));
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION "monitor"."activity_from_audit"() FROM PUBLIC;
