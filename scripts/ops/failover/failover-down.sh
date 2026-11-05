#!/bin/sh
# Apaga la API de respaldo ANTES de volver al CT100. Conserva el volumen pgdata (datos escritos durante la conmutacion).
# Para borrarlo despues de reconciliar: docker volume rm solarsim-backup_pgdata
set -eu
cd "$(dirname "$0")"
export API_IMAGE="${API_IMAGE:-sin-uso}"
docker compose --env-file api.env -f docker-compose.failover.yml --profile tunnel down
