#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 /caminho/backup.sqlite.gz" >&2
  exit 1
fi

BACKUP="$(realpath "$1")"
DB_PATH="${DATABASE_PATH:-/opt/lashdesigner/db_data/app.db}"
SERVICE_NAME="${SERVICE_NAME:-lashdesigner}"
TMP="$(mktemp --suffix=.sqlite)"
PREVIOUS="$DB_PATH.before-restore-$(date -u +%s)"
SERVICE_WAS_STOPPED=false
INSTALLED=false

cleanup() {
  rm -f "$TMP"
}
trap cleanup EXIT

rollback() {
  local status=$?
  if [[ "$INSTALLED" == true && -f "$PREVIOUS" ]]; then
    echo 'A restauração falhou; tentando voltar ao banco anterior.' >&2
    systemctl stop "$SERVICE_NAME" || true
    rm -f "$DB_PATH-wal" "$DB_PATH-shm"
    install -o lashdesigner -g lashdesigner -m 0640 "$PREVIOUS" "$DB_PATH"
    systemctl start "$SERVICE_NAME" || true
  elif [[ "$SERVICE_WAS_STOPPED" == true ]]; then
    systemctl start "$SERVICE_NAME" || true
  fi
  exit "$status"
}
trap rollback ERR

test -f "$BACKUP" || { echo "Backup não encontrado: $BACKUP" >&2; exit 1; }
if [[ -f "$BACKUP.sha256" ]]; then
  (cd "$(dirname "$BACKUP")" && sha256sum -c "$(basename "$BACKUP").sha256")
else
  echo 'Aviso: arquivo .sha256 não encontrado; a integridade criptográfica não pôde ser confirmada.' >&2
fi

gzip -dc "$BACKUP" > "$TMP"
sqlite3 "$TMP" 'PRAGMA integrity_check;' | grep -qx ok || { echo 'Backup inválido: integrity_check falhou.' >&2; exit 1; }

systemctl stop "$SERVICE_NAME"
SERVICE_WAS_STOPPED=true
if [[ -f "$DB_PATH" ]]; then
  cp -a "$DB_PATH" "$PREVIOUS"
fi
rm -f "$DB_PATH-wal" "$DB_PATH-shm"
install -o lashdesigner -g lashdesigner -m 0640 "$TMP" "$DB_PATH"
INSTALLED=true

systemctl start "$SERVICE_NAME"
SERVICE_WAS_STOPPED=false
for _ in {1..20}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/api/ready >/dev/null; then
    trap - ERR
    echo "Restauração concluída e health check aprovado. Banco anterior preservado em: $PREVIOUS"
    exit 0
  fi
  sleep 1
done

echo 'O serviço não ficou pronto após a restauração.' >&2
false
