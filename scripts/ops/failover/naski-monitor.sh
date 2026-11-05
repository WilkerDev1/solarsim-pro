#!/bin/sh
# Vigilante de la API publica. Cron: cada 2 minutos. Avisa tras 2 fallos seguidos y al recuperarse;
# tambien avisa (una vez al dia) si el ultimo respaldo tiene mas de 36 h.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/config.env"
S="$DIR/state"; mkdir -p "$S"; date -u +%FT%TZ > "$S/last_run"
N="$DIR/bin/naski-notify.sh"
BODY="$(curl -fsS -m 10 "$HEALTH_URL" 2>/dev/null || true)"
if printf '%s' "$BODY" | grep -q '"database":"connected"'; then
  if [ -f "$S/down_since" ]; then
    SINCE="$(cat "$S/down_since")"; rm -f "$S/down_since" "$S/fails"
    [ -f "$S/alerted" ] && { rm -f "$S/alerted"; "$N" "SolarSim recuperada" "La API vuelve a responder (caída desde $SINCE UTC)." default; }
  fi
  rm -f "$S/fails"
else
  F=$(( $(cat "$S/fails" 2>/dev/null || echo 0) + 1 )); echo "$F" > "$S/fails"
  [ -f "$S/down_since" ] || date -u +%FT%TZ > "$S/down_since"
  if [ "$F" -ge 2 ] && [ ! -f "$S/alerted" ]; then
    touch "$S/alerted"
    "$N" "SolarSim API caída" "$HEALTH_URL no responde desde $(cat "$S/down_since") UTC. Ver docs/INFRASTRUCTURE_ARCHITECTURE.md (conmutación a naski)." high
  fi
fi
# frescura del respaldo
LAST="$S/last_backup_ok"
if [ -f "$LAST" ] && [ -n "$(find "$LAST" -mmin +2160 2>/dev/null)" ] && [ "$(date +%F)" != "$(cat "$S/stale_alert_day" 2>/dev/null)" ]; then
  date +%F > "$S/stale_alert_day"
  "$N" "Respaldo SolarSim atrasado" "El último respaldo OK fue $(cat "$LAST") UTC (más de 36 h)." high
fi
