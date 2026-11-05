#!/bin/sh
# Uso: naski-notify.sh "<titulo>" "<mensaje>" [prioridad: default|high]
# Envia el aviso por el canal configurado en config.env (NOTIFY_BACKEND=ntfy|telegram|none).
# El mensaje no debe llevar datos de clientes: solo estado del servicio.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$DIR/config.env" ] && . "$DIR/config.env"
TITLE="${1:-SolarSim}"; MSG="${2:-}"; PRIO="${3:-default}"
LOG="$DIR/state/notify.log"; mkdir -p "$DIR/state"
printf '%s %s | %s\n' "$(date -u +%FT%TZ)" "$TITLE" "$MSG" >> "$LOG"
case "${NOTIFY_BACKEND:-none}" in
  ntfy)
    curl -fsS -m 15 -H "Title: $TITLE" -H "Priority: $PRIO" -H "Tags: ${NTFY_TAGS:-rotating_light}" \
      -d "$MSG" "${NTFY_URL:?NTFY_URL no definido}" >/dev/null || echo "fallo ntfy" >> "$LOG" ;;
  telegram)
    curl -fsS -m 15 "https://api.telegram.org/bot${TELEGRAM_TOKEN:?}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID:?}" --data-urlencode "text=$TITLE: $MSG" >/dev/null || echo "fallo telegram" >> "$LOG" ;;
  none) : ;;
  *) echo "NOTIFY_BACKEND desconocido" >> "$LOG" ;;
esac
