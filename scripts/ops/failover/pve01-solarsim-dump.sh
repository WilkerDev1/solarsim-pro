#!/bin/sh
# Comando forzado de pve01 (instalar como /usr/local/sbin/solarsim-dump, root, 0750).
# La clave SSH de naski solo puede ejecutar esto: vuelca solarsim_prod del CT100 por stdout
# (pg_dump formato custom). No acepta argumentos ni abre shell.
set -eu
exec pct exec 100 -- sh -c '. /home/agente/servicios/solarsim-api/.env; exec docker exec solarsim-db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner --no-acl'
