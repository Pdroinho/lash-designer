#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DB_PATH="${DATABASE_PATH:-/opt/lashdesigner/db_data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-/opt/lashdesigner/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +'%Y-%m-%dT%H-%M-%SZ')"
TMP="$BACKUP_DIR/.lashdesigner-$STAMP.sqlite"
OUT="$BACKUP_DIR/lashdesigner-$STAMP.sqlite.gz"

mkdir -p "$BACKUP_DIR"
test -f "$DB_PATH" || { echo "Banco não encontrado: $DB_PATH" >&2; exit 1; }
sqlite3 "$DB_PATH" ".timeout 10000" ".backup '$TMP'"
gzip -9 "$TMP"
mv "$TMP.gz" "$OUT"
sha256sum "$OUT" > "$OUT.sha256"
find "$BACKUP_DIR" -type f \( -name 'lashdesigner-*.sqlite.gz' -o -name 'lashdesigner-*.sqlite.gz.sha256' \) -mtime "+$RETENTION_DAYS" -delete
printf 'Backup criado: %s\n' "$OUT"
