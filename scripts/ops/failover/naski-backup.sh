#!/bin/sh
# Copia diaria de solarsim_prod desde pve01 (CT100) a naski. Cron: 03:30 (despues del vzdump de las 02:30).
# Requiere config.env con PVE_HOST, SSH_KEY y KEEP_DAYS; el dump queda en dumps/ (0600) tras una restauracion de prueba completa.
set -eu
umask 077
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/config.env"
OUT="$DIR/dumps"; mkdir -p "$OUT" "$DIR/state"
TS="$(date -u +%Y%m%dT%H%M%SZ)"; TMP="$OUT/.partial-$TS"
fail() { "$DIR/bin/naski-notify.sh" "Respaldo SolarSim fallido" "$1" high || true; rm -f "$TMP"; echo "$1" >&2; exit 1; }
ssh -i "$SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 "root@$PVE_HOST" > "$TMP" 2>"$DIR/state/backup.err" \
  || fail "no se pudo volcar la base desde pve01 (¿pve01/CT100 caídos?)"
[ "$(stat -c %s "$TMP")" -gt 1000000 ] || fail "el volcado es sospechosamente pequeño"
RES="$("$DIR/bin/naski-verify-dump.sh" "$TMP" 2>&1)" || fail "el volcado no pasa la restauración de prueba: $RES"
mv "$TMP" "$OUT/solarsim_prod-$TS.dump"
find "$OUT" -maxdepth 1 -name 'solarsim_prod-*.dump' -mtime +"${KEEP_DAYS:-7}" -delete
date -u +%FT%TZ > "$DIR/state/last_backup_ok"
echo "ok $TS $(stat -c %s "$OUT/solarsim_prod-$TS.dump") bytes; $RES"
