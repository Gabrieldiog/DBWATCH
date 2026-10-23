#!/bin/sh
# Cria os papéis com menor privilégio (docs/DATA_MODEL.md §5). Roda só na criação do volume.
set -eu
DB="${POSTGRES_DB:-dbwatch}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "$DB" \
  -v db="$DB" \
  -v migrator_pw="$DBWATCH_MIGRATOR_PASSWORD" \
  -v app_pw="$DBWATCH_APP_PASSWORD" \
  -v monitor_pw="$DBWATCH_MONITOR_PASSWORD" \
  -v lab_pw="$DBWATCH_LAB_PASSWORD" \
  -v target_ro_pw="$DBWATCH_TARGET_RO_PASSWORD" <<'SQL'
CREATE ROLE dbwatch_migrator LOGIN PASSWORD :'migrator_pw';
CREATE ROLE dbwatch_app LOGIN PASSWORD :'app_pw';
CREATE ROLE dbwatch_monitor LOGIN PASSWORD :'monitor_pw' IN ROLE pg_monitor;
CREATE ROLE dbwatch_lab LOGIN PASSWORD :'lab_pw';
CREATE ROLE dbwatch_target_ro LOGIN PASSWORD :'target_ro_pw';

-- O migrator é dono do banco: só ele cria schemas e objetos
ALTER DATABASE :"db" OWNER TO dbwatch_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO dbwatch_app, dbwatch_monitor, dbwatch_lab;

ALTER ROLE dbwatch_app SET statement_timeout = '5s';
ALTER ROLE dbwatch_lab SET lock_timeout = '5s';
ALTER ROLE dbwatch_lab SET statement_timeout = '15s';
ALTER ROLE dbwatch_lab SET idle_in_transaction_session_timeout = '20s';
ALTER ROLE dbwatch_target_ro SET default_transaction_read_only = on;

CREATE DATABASE dbwatch_target OWNER dbwatch_migrator;
REVOKE ALL ON DATABASE dbwatch_target FROM PUBLIC;
GRANT CONNECT ON DATABASE dbwatch_target TO dbwatch_target_ro;
SQL
