#!/bin/sh
# Levanta la API de respaldo en naski con el ultimo dump. Ejecutar en ~/solarsim-backup/failover/ (0700), que debe tener:
#   api.env (copiado del vzdump del CT100), tunnel.env, docker-compose.failover.yml, Caddyfile.failover
# Uso: failover-up.sh <imagen-api> [--tunnel]
# --tunnel enciende cloudflared SOLO si la URL publica no responde (CT100 caido): dos conectores repartirian trafico.
set -eu
umask 077
cd "$(dirname "$0")"
export API_IMAGE="${1:?uso: failover-up.sh <imagen-api> [--tunnel]}"
[ -f api.env ] || { echo "falta api.env" >&2; exit 1; }
if [ "${2:-}" = "--tunnel" ]; then
  [ -f tunnel.env ] || { echo "falta tunnel.env" >&2; exit 1; }
  . ../config.env
  ../bin/tunnel-guard.sh "$HEALTH_URL" || exit 2
fi
DUMP="$(ls -1t ../dumps/solarsim_prod-*.dump | head -n1)"; echo "dump: $DUMP"
C="docker compose --env-file api.env -f docker-compose.failover.yml"
set -a; . ./api.env; set +a
$C up -d db
until docker exec solarsim-db pg_isready -q; do sleep 2; done; sleep 3
docker exec -i solarsim-db pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl --exit-on-error < "$DUMP"
$C up -d api caddy
until docker exec solarsim-api node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do sleep 3; done
echo "API de respaldo lista (sin tunel)."
if [ "${2:-}" = "--tunnel" ]; then
  $C --profile tunnel up -d cloudflared
  echo "Tunel encendido. Comprobar $HEALTH_URL."
fi
