#!/bin/sh
# Backup diário do banco dbwatch (pg_dump -Fc) com retenção de 7 dias.
# Uso (cron do root): 30 3 * * * /opt/dbwatch/infra/deploy/backup.sh >> /opt/dbwatch/backups/backup.log 2>&1
set -eu
DIR="${DBWATCH_DIR:-/opt/dbwatch}"
DEST="${BACKUP_DIR:-$DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/dbwatch-$STAMP.dump"

mkdir -p "$DEST"
umask 077
cd "$DIR"
# Dentro do contêiner o pg_dump usa o socket local do superusuário; nada de senha na linha de comando
if ! docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres -Fc dbwatch > "$FILE.tmp"; then
  rm -f "$FILE.tmp"
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') FALHA no pg_dump" >&2
  exit 1
fi
# Confere que o arquivo é um dump legível antes de aceitá-lo
if ! docker compose -f docker-compose.prod.yml exec -T db pg_restore -l < "$FILE.tmp" > /dev/null; then
  rm -f "$FILE.tmp"
  echo "$(date '+%Y-%m-%dT%H:%M:%S%z') FALHA: dump ilegível" >&2
  exit 1
fi
mv "$FILE.tmp" "$FILE"
find "$DEST" -name 'dbwatch-*.dump' -mtime +"$((KEEP_DAYS - 1))" -delete
echo "$(date '+%Y-%m-%dT%H:%M:%S%z') ok $FILE ($(wc -c < "$FILE") bytes)"
