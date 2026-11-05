#!/bin/sh
# Valida un dump (formato custom) con una restauracion real en un PostgreSQL 16 efimero, sin red y en memoria.
# pg_restore --list solo lee el indice; una restauracion completa detecta datos truncados o corruptos.
# Uso: naski-verify-dump.sh <archivo.dump>   (0 = valido)
set -eu
F="${1:?uso: naski-verify-dump.sh <dump>}"
N="solarsim-verify-$$"
trap 'docker rm -f "$N" >/dev/null 2>&1 || true' EXIT INT TERM
docker run -d --rm --name "$N" --network none --tmpfs /var/lib/postgresql/data:rw,size=2g \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify postgres:16-alpine >/dev/null
i=0; until docker exec "$N" pg_isready -q -U postgres -d verify 2>/dev/null; do i=$((i+1)); [ "$i" -lt 60 ] || { echo "postgres de prueba no arranco" >&2; exit 1; }; sleep 2; done
sleep 2
docker exec -i "$N" pg_restore -U postgres -d verify --no-owner --no-acl --exit-on-error < "$F" >/dev/null 2>"/tmp/$N.err" \
  || { echo "restauracion de prueba fallida: $(tail -n1 "/tmp/$N.err")" >&2; rm -f "/tmp/$N.err"; exit 1; }
rm -f "/tmp/$N.err"
P="$(docker exec "$N" psql -U postgres -d verify -Atc 'select count(*) from projects')"
M="$(docker exec "$N" psql -U postgres -d verify -Atc 'select count(*) from schema_migrations')"
[ "$P" -gt 0 ] && [ "$M" -gt 0 ] || { echo "dump restaurado pero vacio (projects=$P, migraciones=$M)" >&2; exit 1; }
echo "dump valido: $P proyectos, $M migraciones"
