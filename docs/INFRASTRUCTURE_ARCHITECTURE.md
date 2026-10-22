# Infraestructura y despliegue protegido

Runbook único para operar la API y su base de datos. Las composiciones de `infra/services/` son configuración de referencia: requieren secretos privados y conservar los volúmenes existentes. No desplegar ni tocar producción sin una solicitud explícita.

## Topología

Host Proxmox `pve01`; CT100 `app-server` (10.0.0.103) con Docker: `solarsim-api`, `solarsim-db` (PostgreSQL 16), `caddy-proxy`, `cloudflared-tunnel` y la web corporativa, todos en la red Docker externa `solarsim_net`. No confundir este CT con `electsun-core`. El acceso autorizado pasa por `pve01`; si el host no responde, comprobar su estado desde el nodo en lugar de insistir con SSH. El visor de propuestas es un Worker de Cloudflare independiente (ver [workers/share-viewer/README.md](../workers/share-viewer/README.md)).

Antes de operar, comprobar conectividad, CT activo, salud de contenedores y espacio libre: cualquier estado registrado antes es una fotografía, no una garantía.

### Acceso y dominios

| Destino | Cómo se llega |
|---|---|
| `app-server` desde la oficina | `ssh agente@10.0.0.103` (alias `app-server`); la IP solo existe en la LAN. |
| `app-server` desde fuera | Por Tailscale, saltando por el nodo Proxmox: `ssh -J root@100.73.34.56 agente@10.0.0.103`. |
| Estado del CT | `ssh root@100.73.34.56 'pct status 100'`. |
| API pública | `https://solarsim.electsun.net` (Cloudflare → `cloudflared-tunnel` → `caddy-proxy` → `solarsim-api:3000`). Solo HTTP: no sirve para desplegar. |
| Visor de propuestas | `https://propuesta.electsun.net/p/<id>` (Worker `solarsim-share-viewer`, KV `PROPOSALS_KV`). Se despliega con `wrangler` desde cualquier lugar con la cuenta de Cloudflare. |

En el CT (usuario `agente`):

- `~/servicios/solarsim-api/` contiene `docker-compose.yml` (la imagen en ejecución), `.env` (0600, no imprimir) y las candidatas `docker-compose.<versión>-<sha>.candidate.yml`.
- `~/servicios/solarsim-build-<versión>-<sha>/` es el contexto de build: solo `server/` y `shared/` de la revisión aprobada (`git archive <sha> server shared`). No es un checkout git.
- `~/backups/solarsim-<versión>-<sha>-<UTC>/` (0700) guarda el checkpoint de cada despliegue.
- La base corre en `solarsim-db`: `docker exec solarsim-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" …'`. Las migraciones aplicadas están en `schema_migrations`.

`/api/health` informa la versión de `server/package.json`, no la revisión: la revisión desplegada se lee en la etiqueta de la imagen (`docker inspect solarsim-api --format '{{.Config.Image}}'`).

## Reglas

- Nunca ejecutar `docker compose down -v`, borrar directorios de datos, sustituir PGDATA, restaurar un dump sobre la base viva como prueba ni subir dumps, imágenes o `.env` a GitHub o a artefactos de CI.
- PostgreSQL no publica puerto al host. No imprimir `.env` ni secretos. Archivos de secretos y respaldos con permisos 0600 en directorios privados.
- La imagen de la API se construye con contexto en la raíz del repositorio (`server/Dockerfile` necesita `shared/`): no copiar solo `server/` a una carpeta de servicio. El Dockerfile usa Node 24, usuario sin privilegios y healthcheck; `/api/health` comprueba disponibilidad real de la base.
- Las migraciones (`server/src/database/`) son aditivas, numeradas y se aplican al arrancar la API. Volver atrás nunca implica borrar tablas o columnas.
- Las pruebas de escritura se hacen solo en bases efímeras o staging sintético. Los contenedores locales de integración no demuestran que producción esté actualizada.

## Despliegue de la API

1. **Checkpoint.** Crear un directorio privado de respaldo (por ejemplo `/home/agente/backups/solarsim-<versión>-<fecha>`) con: dump PostgreSQL en formato custom, su `pg_restore --list`, la composición vigente (`docker-compose.before.yml`) y la imagen API en ejecución. Un listado de backup o un snapshot del CT no constituyen prueba de restauración.

   ```bash
   umask 077; D=~/backups/solarsim-<versión>-<sha>-$(date -u +%Y%m%dT%H%M%SZ); mkdir -m 700 "$D"
   cp ~/servicios/solarsim-api/docker-compose.yml "$D/docker-compose.before.yml"
   docker exec solarsim-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$D/solarsim_prod.dump"
   docker exec -i solarsim-db pg_restore --list < "$D/solarsim_prod.dump" > "$D/pg_restore.list"
   docker save <imagen en ejecución> | gzip > "$D/<imagen>.tar.gz"
   ```

2. **Ensayo de restauración.** Desde la raíz de un checkout de la revisión a desplegar, con Docker local: `$S 'cat <checkpoint>/solarsim_prod.dump' | python3 scripts/qa/restoreBackupRehearsal.py`. El script guarda el dump completo (datos de producción) en una carpeta privada de `TMPDIR` (0700, archivo 0600) y la borra al terminar; si se interrumpe a la fuerza puede quedar `solarsim-logical-qa-*/input.dump`. Ejecutarlo solo en una máquina de confianza con disco cifrado y comprobar después que no quedan restos. Debe listar las migraciones de esa revisión (incluidas las nuevas). El script recibe el dump por stdin, lo restaura en PostgreSQL 16 sin red (`--network none`) con socket Unix privado, ejecuta `server/tests/backupRehearsal.ts` (migraciones del repositorio dos veces, conteos y huellas iguales, cero huérfanos) y `pg_amcheck --heapallindexed --parent-check`; al terminar elimina contenedor y temporales. No monta ni modifica la base de producción.
3. **Compatibilidad de clientes.** La API exige `baseVersion` (CAS) y publicación autenticada; los clientes antiguos pueden quedar incompatibles. Coordinar la versión de escritorio y del Worker; exportar trabajo pendiente de los clientes que vayan a cambiar.
4. **Construir y reemplazar solo la API.** La imagen se etiqueta `solarsim-api-api:<versión>-<sha corto>` para poder volver a ella. PostgreSQL, Caddy y el túnel no se recrean.

   - Subir el contexto y construir en el CT (con `S="ssh -J root@100.73.34.56 agente@10.0.0.103"` desde fuera de la oficina):

     ```bash
     git archive <sha> server shared | $S 'B=~/servicios/solarsim-build-<versión>-<sha>; mkdir -p $B && tar -x -C $B && cd $B && docker build -f server/Dockerfile -t solarsim-api-api:<versión>-<sha> .'
     ```

   - Si el build en el CT falla con `EAI_AGAIN` (DNS de Docker hacia `registry.npmjs.org`), construir la misma revisión en local, pasar la imagen y comprobar que el id coincide:

     ```bash
     docker build -f server/Dockerfile -t solarsim-api-api:<versión>-<sha> .
     docker save solarsim-api-api:<versión>-<sha> | gzip | $S 'gunzip | docker load'
     ```

   - Cambiar la etiqueta en una candidata, sustituir la composición y recrear solo `api` (las migraciones nuevas se aplican al arrancar):

     ```bash
     cd ~/servicios/solarsim-api
     sed 's/<versión>-<sha anterior>/<versión>-<sha>/g' docker-compose.yml > docker-compose.<versión>-<sha>.candidate.yml
     cp docker-compose.<versión>-<sha>.candidate.yml docker-compose.yml
     docker compose up -d --no-deps --no-build api
     ```
5. **Verificar.** Contenedores `healthy` y sin reinicios; logs iniciales sin errores de conexión; `GET /api/health` local y público con la versión esperada y base conectada; `GET /api/auth/me` sin token responde 401; preflight CORS (`OPTIONS`) responde 204; health del Worker correcto. Después, comprobar login, roles y política con una cuenta autorizada, sin escrituras de prueba en datos reales.
6. **Worker y cliente.** Desplegar el Worker compatible después de la API y distribuir el cliente aprobado. Desde `workers/share-viewer/`:

   ```bash
   npx wrangler deployments list                      # anotar el Version ID actual para rollback
   npx wrangler deploy --message "SolarSim <versión> (<sha>)"
   npx wrangler rollback <version-id-anterior>        # solo si hay que volver atrás
   ```

   Verificar que una propuesta ya publicada (`npx wrangler kv key list --binding PROPOSALS_KV --remote`, claves `proposal:<id>`) sigue abriendo en `https://propuesta.electsun.net/p/<id>` y que `POST /api/share` sin token responde 401.

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
