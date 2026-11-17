#!/bin/sh
# Decide si es seguro encender el tunel de naski. Sale con 0 solo si la URL publica NO tiene un conector vivo:
#   - sin conexion (codigo 000), o
#   - 530 de Cloudflare (tunel sin conector, error 1033).
# Cualquier otra respuesta HTTP (200, 502, 503, 504...) significa que un conector del CT100 sigue registrado,
# aunque su base o su API esten rotas: salir con 2 para no repartir trafico entre dos bases.
# Uso: tunnel-guard.sh <url-de-salud>
set -u
CODE="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "${1:?uso: tunnel-guard.sh <url>}" 2>/dev/null || true)"
case "$CODE" in
  000|530) exit 0 ;;
  *) echo "ABORTADO: la URL publica responde HTTP $CODE; un conector del CT100 sigue activo. No se enciende el tunel." >&2; exit 2 ;;
esac
