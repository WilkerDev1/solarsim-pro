#!/bin/sh
# Valida un dump (formato custom) con una restauracion real en un PostgreSQL 16 efimero, sin red.
# Usa disco (volumen anonimo que --rm elimina), no memoria: escala con la base. Exige espacio libre >= 4 veces el dump.
# stderr puede contener detalle de PostgreSQL (con fragmentos de datos): quien llama debe dejarlo en un archivo local, nunca en un aviso.
# pg_restore --list solo lee el indice; una restauracion completa detecta datos truncados o corruptos.
# Uso: naski-verify-dump.sh <archivo.dump>   (0 = valido)
set -eu
umask 077
F="${1:?uso: naski-verify-dump.sh <dump>}"
N="solarsim-verify-$$"
NEED=$(( $(stat -c %s "$F") * 4 / 1024 )); FREE="$(df -Pk "$(dirname "$F")" | awk 'NR==2{print $4}')"
[ "$FREE" -gt "$NEED" ] || { echo "espacio insuficiente para verificar (libre ${FREE} KiB, se necesitan ${NEED} KiB)" >&2; exit 1; }
trap 'docker rm -f "$N" >/dev/null 2>&1 || true' EXIT INT TERM
docker run -d --rm --name "$N" --network none \
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
