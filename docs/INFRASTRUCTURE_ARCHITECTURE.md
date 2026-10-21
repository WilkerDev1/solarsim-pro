# Infraestructura y despliegue protegido

Runbook único para operar la API y su base de datos. Las composiciones de `infra/services/` son configuración de referencia: requieren secretos privados y conservar los volúmenes existentes. No desplegar ni tocar producción sin una solicitud explícita.

## Topología

Host Proxmox `pve01`; CT100 `app-server` (10.0.0.103) con Docker: `solarsim-api`, `solarsim-db` (PostgreSQL 16), `caddy-proxy`, `cloudflared-tunnel` y la web corporativa, todos en la red Docker externa `solarsim_net`. No confundir este CT con `electsun-core`. El acceso autorizado pasa por `pve01`; si el host no responde, comprobar su estado desde el nodo en lugar de insistir con SSH. El visor de propuestas es un Worker de Cloudflare independiente (ver [workers/share-viewer/README.md](../workers/share-viewer/README.md)).

Antes de operar, comprobar conectividad, CT activo, salud de contenedores y espacio libre: cualquier estado registrado antes es una fotografía, no una garantía.

## Reglas

- Nunca ejecutar `docker compose down -v`, borrar directorios de datos, sustituir PGDATA, restaurar un dump sobre la base viva como prueba ni subir dumps, imágenes o `.env` a GitHub o a artefactos de CI.
- PostgreSQL no publica puerto al host. No imprimir `.env` ni secretos. Archivos de secretos y respaldos con permisos 0600 en directorios privados.
- La imagen de la API se construye con contexto en la raíz del repositorio (`server/Dockerfile` necesita `shared/`): no copiar solo `server/` a una carpeta de servicio. El Dockerfile usa Node 24, usuario sin privilegios y healthcheck; `/api/health` comprueba disponibilidad real de la base.
- Las migraciones (`server/src/database/`) son aditivas, numeradas y se aplican al arrancar la API. Volver atrás nunca implica borrar tablas o columnas.
- Las pruebas de escritura se hacen solo en bases efímeras o staging sintético. Los contenedores locales de integración no demuestran que producción esté actualizada.

## Despliegue de la API

1. **Checkpoint.** Crear un directorio privado de respaldo (por ejemplo `/home/agente/backups/solarsim-<versión>-<fecha>`) con: dump PostgreSQL en formato custom, su `pg_restore --list`, la composición vigente (`docker-compose.before.yml`) y la imagen API en ejecución. Un listado de backup o un snapshot del CT no constituyen prueba de restauración.
2. **Ensayo de restauración.** Desde la raíz del repositorio, con Docker: `cat <dump> | python3 scripts/qa/restoreBackupRehearsal.py`. El script recibe el dump por stdin, lo restaura en PostgreSQL 16 sin red (`--network none`) con socket Unix privado, ejecuta `server/tests/backupRehearsal.ts` (migraciones del repositorio dos veces, conteos y huellas iguales, cero huérfanos) y `pg_amcheck --heapallindexed --parent-check`; al terminar elimina contenedor y temporales. No monta ni modifica la base de producción.
3. **Compatibilidad de clientes.** La API exige `baseVersion` (CAS) y publicación autenticada; los clientes antiguos pueden quedar incompatibles. Coordinar la versión de escritorio y del Worker; exportar trabajo pendiente de los clientes que vayan a cambiar.
4. **Construir y reemplazar solo la API**, desde un checkout completo de la revisión aprobada y con el `.env` privado:

```bash
docker compose --env-file /ruta/privada/solarsim.env -f infra/services/solarsim-api/docker-compose.yml build
docker compose --env-file /ruta/privada/solarsim.env -f infra/services/solarsim-api/docker-compose.yml up -d --no-deps --no-build api
```

   Etiquetar la imagen con versión y revisión (por ejemplo `solarsim-api-api:<versión>-<sha corto>`) para poder volver a ella. PostgreSQL, Caddy y el túnel no se recrean.
5. **Verificar.** Contenedores `healthy` y sin reinicios; logs iniciales sin errores de conexión; `GET /api/health` local y público con la versión esperada y base conectada; `GET /api/auth/me` sin token responde 401; preflight CORS (`OPTIONS`) responde 204; health del Worker correcto. Después, comprobar login, roles y política con una cuenta autorizada, sin escrituras de prueba en datos reales.
6. **Worker y cliente.** Desplegar el Worker compatible después de la API (registrar la versión anterior para rollback) y distribuir el cliente aprobado.

`npm run verify:compatibility` es solo un sondeo de salud y rechazo anónimo. Su salida 1 con `WARN` por contratos autenticados no ejercidos es deliberada: no autoriza un despliegue ni demuestra una caída. Los contratos de escritura se ensayan en staging (ver [QA.md](QA.md)).

Criterios para abortar: health o base fallidos, migración fallida, permisos incorrectos, pérdida no explicada de contenido o conteos, clientes antiguos todavía escribiendo, firmas ausentes o fallo de instalación.

## Rollback de la API

1. Detener escritores nuevos y coordinar clientes. Guardar un dump posterior que contenga las escrituras recientes.
2. Restaurar la composición anterior del checkpoint y recrear solo la API con `up -d --no-deps --no-build api`, usando una imagen anterior **compatible con las migraciones aplicadas** y con los secretos actuales. Una API que desconozca membresías secundarias o revocaciones (anterior a la migración 003) no es un rollback válido: podría conceder acceso indebido.
3. Mantener la misma base, credenciales y volúmenes. No borrar tablas ni columnas, no restaurar el dump sobre la base viva y conservar las publicaciones existentes en KV.
4. Si el rollback de aplicación no resuelve un fallo de datos, restaurar el respaldo en una base nueva, verificarla y reconciliar explícitamente las escrituras posteriores al checkpoint antes de cambiar el destino. Un snapshot anterior del CT no es un rollback seguro de datos que recibieron escrituras nuevas.

## Rotación de secretos

`npx tsx scripts/qa/prepareRotationSecrets.ts /ruta/absoluta/privada/nueva` genera `JWT_SECRET` y `DB_PASSWORD` candidatos en un directorio nuevo 0700 (archivo 0600) fuera del checkout, sin imprimirlos ni conectar a servicios. Rotar `JWT_SECRET` invalida todas las sesiones. Cambiar `DB_PASSWORD` en el `.env` **no cambia** la contraseña de una base existente: aplicar `ALTER ROLE` (o `\password`) y actualizar todos los consumidores antes de recrear la API. `server/tests/containerSmoke.ts` (en CI) ensaya esta rotación en contenedores propios.

## Proxy Caddy

El `Caddyfile` vive en la carpeta de servicio de Caddy en el CT (referencia en `infra/services/caddy/`). Tras editarlo, validar con `docker exec caddy-proxy caddy validate --config /etc/caddy/Caddyfile` y recargar sin cortar conexiones con `docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile`.
