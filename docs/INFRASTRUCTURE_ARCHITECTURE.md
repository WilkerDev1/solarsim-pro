# Infraestructura y despliegue protegido

Runbook único para operar la API y su base de datos. Las composiciones de `infra/services/` son configuración de referencia: requieren secretos privados y conservar los volúmenes existentes. No desplegar ni tocar producción sin una solicitud explícita.

## Topología

Host Proxmox `pve01`; CT100 `app-server` con Docker: `solarsim-api`, `solarsim-db` (PostgreSQL 16), `caddy-proxy`, `cloudflared-tunnel` y la web corporativa, todos en la red Docker externa `solarsim_net`. No confundir este CT con `electsun-core`. El acceso autorizado pasa por `pve01`; si el host no responde, comprobar su estado desde el nodo en lugar de insistir con SSH. El visor de propuestas es un Worker de Cloudflare independiente (ver [workers/share-viewer/README.md](../workers/share-viewer/README.md)).

Antes de operar, comprobar conectividad, CT activo, salud de contenedores y espacio libre: cualquier estado registrado antes es una fotografía, no una garantía.

### Acceso y dominios

Las direcciones, usuarios y comandos SSH exactos no se publican en este repositorio: están en `docs/private/ACCESO_PRODUCCION.md`, un archivo local no versionado (`.gitignore`). Pídelo al responsable de la infraestructura.

| Destino | Cómo se llega |
|---|---|
| `app-server` desde la oficina | SSH por la LAN (alias `app-server`). |
| `app-server` desde fuera | Por Tailscale, saltando por el nodo Proxmox (comando exacto en el archivo privado). |
| Estado del CT | `pct status 100` en el nodo Proxmox. |
| API pública | `https://solarsim.electsun.net` (Cloudflare → `cloudflared-tunnel` → `caddy-proxy` → `solarsim-api:3000`). Solo HTTP: no sirve para desplegar. |
| Visor de propuestas | `https://propuesta.electsun.net/p/<id>` (Worker `solarsim-share-viewer`, KV `PROPOSALS_KV`). Se despliega con `wrangler` desde cualquier lugar con la cuenta de Cloudflare. |

En el CT (con el usuario de servicio indicado en el archivo privado):

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

1. **Checkpoint.** Crear un directorio privado de respaldo (por ejemplo `~/backups/solarsim-<versión>-<fecha>` en la cuenta de servicio) con: dump PostgreSQL en formato custom, su `pg_restore --list`, la composición vigente (`docker-compose.before.yml`) y la imagen API en ejecución. Un listado de backup o un snapshot del CT no constituyen prueba de restauración.

   ```bash
   umask 077; D=~/backups/solarsim-<versión>-<sha>-$(date -u +%Y%m%dT%H%M%SZ); mkdir -m 700 "$D"
   cp ~/servicios/solarsim-api/docker-compose.yml "$D/docker-compose.before.yml"
   docker exec solarsim-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$D/solarsim_prod.dump"
   docker exec -i solarsim-db pg_restore --list < "$D/solarsim_prod.dump" > "$D/pg_restore.list"
   docker save <imagen en ejecución> | gzip > "$D/<imagen>.tar.gz"
   ```

2. **Ensayo de restauración.** Desde la raíz de un checkout de la revisión a desplegar, con Docker local: `$S 'cat <checkpoint>/solarsim_prod.dump' | python3 scripts/qa/restoreBackupRehearsal.py`. El script guarda el dump completo (datos de producción) en una carpeta privada de `TMPDIR` (0700, archivo 0600) y la borra al terminar; si se interrumpe a la fuerza puede quedar `solarsim-logical-qa-*/input.dump`. Ejecutarlo solo en una máquina de confianza con disco cifrado y comprobar después que no quedan restos. Debe listar las migraciones de esa revisión (incluidas las nuevas: con la 007 la salida termina en `"migrations":[1,2,3,4,5,6,7]`). El script recibe el dump por stdin, lo restaura en PostgreSQL 16 sin red (`--network none`, 1 GB de memoria con los datos en tmpfs) con socket Unix privado, ejecuta `server/tests/backupRehearsal.ts` (migraciones del repositorio dos veces, conteos iguales, huellas iguales del contenido de cada propuesta salvo `specs`, `equipmentTotals` iguales antes y después, ningún proyecto con el espejo heredado, cero huérfanos) y `pg_amcheck --heapallindexed --parent-check`; al terminar elimina contenedor y temporales. No monta ni modifica la base de producción.
3. **Compatibilidad de clientes.** La API exige `baseVersion` (CAS), publicación autenticada y, desde la 2.7.1, `X-SolarSim-Client` con versión ≥ `MIN_CLIENT_VERSION` (426 en caso contrario; ver más abajo). Los clientes 2.6.0 y 2.7.0 dejan de sincronizar: coordinar la versión de escritorio y del Worker, avisar al equipo y exportar el trabajo pendiente de quienes vayan a cambiar.
4. **Construir y reemplazar solo la API.** La imagen se etiqueta `solarsim-api-api:<versión>-<sha corto>` para poder volver a ella. PostgreSQL, Caddy y el túnel no se recrean.

   - Subir el contexto y construir en el CT (con `S` = el comando SSH hacia `app-server`; desde fuera de la oficina, el salto por el nodo Proxmox):

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
6. **Worker y cliente.** Desplegar el Worker compatible justo después de la API (con la versión mínima activa, el Worker anterior no envía `X-SolarSim-Client` y la API rechaza su autorización con 426: hasta desplegar el nuevo, publicar propuestas responde 503; el Worker 2.7.1 es inofensivo con la API anterior, así que desplegarlo **antes** elimina esa ventana) y distribuir el cliente aprobado. Desde `workers/share-viewer/`:

   ```bash
   npx wrangler deployments list                      # anotar el Version ID actual para rollback
   npx wrangler deploy --message "SolarSim <versión> (<sha>)"
   npx wrangler rollback <version-id-anterior>        # solo si hay que volver atrás
   ```

   Verificar que una propuesta ya publicada (`npx wrangler kv key list --binding PROPOSALS_KV --remote`, claves `proposal:<id>`) sigue abriendo en `https://propuesta.electsun.net/p/<id>` y que `POST /api/share` sin token responde 401.

`npm run verify:compatibility` es solo un sondeo de salud y rechazo anónimo. Su salida 1 con `WARN` por contratos autenticados no ejercidos es deliberada: no autoriza un despliegue ni demuestra una caída. Los contratos de escritura se ensayan en staging (ver [QA.md](QA.md)).

### Versión 2.7.1 (historial): migración 006 y versión mínima de cliente

La 2.7.1 elimina el espejo heredado de los equipos (ADR 0001, oleada 4). `package.json` (raíz, `server/` y `workers/share-viewer/`) debe decir `2.7.1` antes de construir: el cliente y el Worker se identifican con esa versión y la API de la 2.7.1 rechaza todo lo anterior, así que un build de `beta` que aún diga `2.7.0` no puede hablar con ella (`npm run release:bump -- 2.7.1`, ver [Mantenimiento y releases](MAINTENANCE_AND_UPDATES.md)). Precondición: la release debe incluir las oleadas 2 y 3 del plan (lectores del renderer y escritor `equipmentGroups.ts` que usan `shared/equipment` y no escriben el espejo); la 006 solo borra el espejo una vez, y si un cliente aún lo lee o lo reescribe, las vistas muestran valores vacíos o el espejo reaparece. Orden obligatorio:

1. **Checkpoint** (paso 1) y **ensayo** (paso 2) con la imagen candidata. Antes de seguir, anotar los conteos de proyectos y, si se quiere una comprobación extra, una muestra de `system_capacity_kwp` y `version`: la migración no los modifica.
2. **Worker 2.7.1** (paso 6) antes de la API: es inofensivo con la API anterior, publica snapshots sin espejo y, con la versión mínima activa, evita la ventana en la que el Worker viejo (sin `X-SolarSim-Client`) recibe 426 de la API.
3. **Avisar al equipo antes de subir la API**, con la fecha y hora: desde ese momento SolarSim 2.6.x y 2.7.0 dejan de sincronizar (el trabajo local no se pierde) y deben actualizar a 2.7.1. Tener la release de escritorio firmada lista para publicar de inmediato.
4. **API con la migración 006.** Al arrancar aplica `migrateLegacySpecs` a `data_json.specs` de todos los proyectos (también papelera y otras organizaciones) en una sola transacción; no cambia `version`, `updated_at` ni el historial. `MIN_CLIENT_VERSION` queda en `2.7.1` por defecto. El ensayo debe terminar en `"migrations":[1,2,3,4,5,6]` con los mismos conteos que producción. Comprobar en la base:

   ```bash
   docker exec solarsim-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version, name FROM schema_migrations ORDER BY version" -c "SELECT count(*) AS proyectos, count(*) FILTER (WHERE (data_json->\$q\$specs\$q\$) ? \$q\$panelCount\$q\$) AS con_espejo FROM projects"'
   ```

   Esperado: la fila `6 | equipment_groups`, el mismo número de proyectos que antes y `con_espejo = 0`.
5. **Publicar la release de escritorio 2.7.1** firmada (ver [Mantenimiento y releases](MAINTENANCE_AND_UPDATES.md)) y confirmar que quienes sincronizan actualizaron; mientras no lo hagan, su sincronización devuelve 426 y el trabajo local queda pendiente.

Rollback: la imagen API anterior es compatible con los datos migrados (nunca leyó `specs`, salvo para calcular `system_capacity_kwp`, que calcularía en 0 para propuestas solo con grupos hasta volver a la 2.7.1). La 006 no se revierte con DDL; si hay que deshacerla, restaurar el checkpoint en una base nueva (sección siguiente).

Criterios para abortar: health o base fallidos, migración fallida, permisos incorrectos, pérdida no explicada de contenido o conteos, clientes antiguos todavía escribiendo, firmas ausentes o fallo de instalación.

### Versión 2.7.2: mantenimiento sin migración

La 2.7.2 (banco de baterías, supuestos y edición de proyecto: ADR 0002 a 0004) no cambia datos ni contrato de la API: el servidor solo cambia su número de versión. No hay migración (el ensayo debe terminar en `"migrations":[1,2,3,4,5,6]` con los mismos conteos) y `MIN_CLIENT_VERSION` sigue en `2.7.1`, así que los clientes 2.7.1 y 2.7.2 sincronizan con la API 2.7.2. `package.json` (raíz, `server/` y `workers/share-viewer/`) debe decir `2.7.2` antes de construir. Orden:

1. **Checkpoint** (paso 1) y **ensayo de restauración** (paso 2) con la imagen candidata: siguen siendo obligatorios aunque no haya migración.
2. **Worker 2.7.2** (paso 6): toma vigencia, retención y tasa de cambio de `shared/assumptions.ts`. Es compatible con la API 2.7.1 y con la 2.7.2.
3. **API 2.7.2** (paso 4): recrear solo `api`; no se aplica ninguna migración nueva. Verificar (paso 5) que `/api/health` informa `2.7.2`.
4. **Publicar la release de escritorio 2.7.2** firmada. La 2.7.2 no bloquea a ningún cliente 2.7.1 o posterior (`MIN_CLIENT_VERSION` sigue en 2.7.1), así que no hace falta coordinar el cambio. Las instalaciones 2.7.0 o anteriores que aún queden siguen recibiendo 426 como desde la 2.7.1: si alguien las usa, avisarle para que actualice y sincronice su trabajo pendiente.

Rollback: la imagen API anterior es compatible (mismos datos y migraciones). La sección anterior (2.7.1) se conserva como historial de la migración 006 y de la versión mínima.

### Versión 2.7.3: corrección del dock y actualización de dependencias

Igual que la 2.7.2: sin migración ni cambio de contrato, `MIN_CLIENT_VERSION` sigue en `2.7.1` y los clientes 2.7.1 o posteriores sincronizan con la API 2.7.3. Cambia el dock (precio kWh, #107) y se actualizan dependencias dentro de sus rangos compatibles (Electron 44.9, hono, wrangler; sin cambios mayores). Al construir la API, usar `--pull` para tomar la última imagen `node:24-alpine` (Node 24 LTS). Mismo orden que la 2.7.2: checkpoint y ensayo, Worker, API y release firmada. Además se actualiza la imagen de `cloudflared-tunnel` (recrear solo ese contenedor y comprobar que `/api/health` vuelve a responder por el dominio público). Antes de recrearlo, anotar la imagen en uso (`docker inspect cloudflared-tunnel --format '{{.Config.Image}} {{.Image}}'`): el rollback es volver a esa imagen y recrear solo `cloudflared-tunnel`. La 2.7.3 incluye también el README nuevo (#105) y la salida de las direcciones de producción de los archivos versionados (#106).

### Versión 2.7.4: ítems ocultos en la factura y fecha de creación

Incluye la **migración 007** (`project_created_at`). En las propuestas sincronizadas antes de esta versión, baja `created_at` al `data_json.createdAt` del cliente si ese valor es anterior; la regla de validez está en `shared/proposalDates.ts`. Nunca mueve una fecha hacia adelante y no cambia `version`. En las filas que corrige mueve `updated_at`, así que solo esas vuelven a descargarse en los clientes; no hay conflictos CAS. `MIN_CLIENT_VERSION` sigue en `2.7.1`.

El orden es el mismo que en la 2.7.3:

1. Checkpoint y ensayo de restauración. El ensayo debe terminar en `[1..7]`.
2. Worker. El visor oculta los ítems marcados con «Oculto en factura». Sin el Worker nuevo, los enlaces compartidos siguen listándolos.
3. API.
4. Release firmada.

Rollback: la imagen 2.7.3 es compatible con la migración 007. La migración solo cambia `created_at`/`updated_at` y no añade tablas ni columnas.

## Rollback de la API

1. Detener escritores nuevos y coordinar clientes. Guardar un dump posterior que contenga las escrituras recientes.
2. Restaurar la composición anterior del checkpoint y recrear solo la API con `up -d --no-deps --no-build api`, usando una imagen anterior **compatible con las migraciones aplicadas** y con los secretos actuales. Una API que desconozca membresías secundarias o revocaciones (anterior a la migración 003) no es un rollback válido: podría conceder acceso indebido.
3. Mantener la misma base, credenciales y volúmenes. No borrar tablas ni columnas, no restaurar el dump sobre la base viva y conservar las publicaciones existentes en KV.
4. Si el rollback de aplicación no resuelve un fallo de datos, restaurar el respaldo en una base nueva, verificarla y reconciliar explícitamente las escrituras posteriores al checkpoint antes de cambiar el destino. Un snapshot anterior del CT no es un rollback seguro de datos que recibieron escrituras nuevas.

## Rotación de secretos

`npx tsx scripts/qa/prepareRotationSecrets.ts /ruta/absoluta/privada/nueva` genera `JWT_SECRET` y `DB_PASSWORD` candidatos en un directorio nuevo 0700 (archivo 0600) fuera del checkout, sin imprimirlos ni conectar a servicios. Rotar `JWT_SECRET` invalida todas las sesiones. Cambiar `DB_PASSWORD` en el `.env` **no cambia** la contraseña de una base existente: aplicar `ALTER ROLE` (o `\password`) y actualizar todos los consumidores antes de recrear la API. `server/tests/containerSmoke.ts` (en CI) ensaya esta rotación en contenedores propios.

## Respaldo y conmutación en naski

`naski` (servidor personal, siempre encendido, en Tailscale) guarda una copia diaria de la base y vigila la API. Si `pve01` o el CT100 caen, permite publicar propuestas y sincronizar con una API temporal hasta que vuelva el CT100. Los scripts están en `scripts/ops/failover/`; la configuración, las direcciones y el canal de avisos viven en `~/solarsim-backup/config.env` de naski y en el archivo privado de acceso (no se versionan).

| Pieza | Dónde | Qué hace |
|---|---|---|
| `pve01-solarsim-dump.sh` | `/usr/local/sbin/solarsim-dump` en pve01 | Comando forzado de la clave de naski en `authorized_keys` (`restrict`, `from=` la IP Tailscale de naski): solo vuelca `solarsim_prod` por stdout. La clave no abre shell ni ejecuta otra cosa. |
| `naski-backup.sh` | cron de naski, 03:30 (después del vzdump de las 02:30) | Vuelca la base por SSH, exige tamaño razonable y la valida con `naski-verify-dump.sh`; solo entonces guarda `dumps/solarsim_prod-<UTC>.dump` (0600) y conserva 7 días. Avisa si falla. |
| `naski-verify-dump.sh` | invocado por el anterior | Restauración real del dump en un PostgreSQL 16 efímero (sin red, en memoria) con `--exit-on-error` y comprobación de que hay proyectos y migraciones. `pg_restore --list` no basta: solo lee el índice y no detecta datos truncados. |
| `naski-monitor.sh` | cron de naski, cada 2 min | Consulta `/api/health` y exige `"database":"connected"`. Avisa tras 2 fallos seguidos, una sola vez, y avisa al recuperarse. Un aviso se da por enviado solo si se entregó: si el canal falla, reintenta en la siguiente ejecución. Avisa una vez al día si el último respaldo tiene más de 36 h. |
| `naski-notify.sh` | invocado por los anteriores | Envía el aviso por `NOTIFY_BACKEND` (`ntfy`, `telegram` o `none`) y devuelve error si no se entregó. Los mensajes solo informan del estado del servicio: nunca incluyen datos de clientes. |
| `tunnel-guard.sh` | invocado por `failover-up.sh --tunnel` | Autoriza encender el túnel solo si la URL pública no responde (sin conexión) o devuelve 530 (túnel sin conector). Cualquier otro HTTP (200, 502, 503, 504…) indica un conector del CT100 vivo, aunque su base esté rota, y aborta. |
| `docker-compose.failover.yml`, `Caddyfile.failover`, `failover-up.sh`, `failover-down.sh` | `~/solarsim-backup/failover/` | Receta de conmutación. |
| `reconcile-report.sql` | se ejecuta con `psql` | Informe de solo lectura de lo creado, modificado o borrado desde un instante, por tabla, y de los proyectos tocados. |

Límites: naski vigila a través de la misma red doméstica. Si se cae Internet o la electricidad, el aviso tampoco sale; el aviso cubre fallos de pve01, del CT100, del túnel o de la API, no un corte total. El dump contiene datos de producción (clientes, hashes de contraseña): naski debe mantener disco cifrado o acceso restringido y los permisos 0600/0700 de la carpeta. Los secretos (`.env` de la API y token del túnel) **no** se guardan en naski: se extraen del vzdump cuando hacen falta.

### Conmutar a naski (CT100 inaccesible)

1. Confirmar que el CT100 no sirve: `curl -i <API pública>/api/health` devuelve 530/1033 (sin conector del túnel) o no responde. Cualquier otra respuesta HTTP, incluido un 503 por base caída, significa que el conector del CT100 sigue vivo: no conmutar y arreglar el CT100.
2. Obtener los secretos del último vzdump (carpeta `pve-backups/latest/dump/` del vault local): `zstd -dc vzdump-lxc-100-*.tar.zst | tar -x -C <dir 0700> ./home/agente/servicios/solarsim-api/.env ./home/agente/servicios/cloudflared/.env`. Copiar el primero como `api.env` y el segundo como `tunnel.env` a `~/solarsim-backup/failover/` de naski (0600) y borrar la copia local al terminar. El `JWT_SECRET` original mantiene válidas las sesiones.
3. Construir la imagen de la API desde un checkout de la versión en producción (`docker build -f server/Dockerfile -t solarsim-api:<versión>-failover .` en la raíz; el build en naski no es viable por memoria) y cargarla: `docker save … | gzip | ssh naski 'gunzip | docker load'`. Usar la **misma versión o una posterior** a la que opera el CT100: el dump está al día con las migraciones de esa versión.
4. En naski: `cd ~/solarsim-backup/failover && ./failover-up.sh solarsim-api:<versión>-failover --tunnel`. Restaura el último dump en un PostgreSQL 16 nuevo, levanta API y Caddy y, solo si la URL pública no responde, enciende `cloudflared` con el túnel de producción. `tunnel-guard.sh` aborta con código 2, sin crear nada, si la URL pública responde cualquier HTTP distinto de 530.
5. Comprobar `/api/health` por el dominio público y publicar una propuesta de prueba. El Worker del visor y su KV no cambian.

Los datos tienen la antigüedad del último respaldo (hasta ~24 h): lo creado en el CT100 después se perderá o habrá que recuperarlo del vzdump. El túnel de naski sirve también el dominio corporativo con 404 (solo enruta la API).

### Volver al CT100 y reconciliar

1. **Apagar naski antes de arrancar el CT100**: `./failover-down.sh` (quita túnel, API y Caddy y **conserva** el volumen `solarsim-backup_pgdata` con lo escrito durante la conmutación). El `cloudflared` del CT100 se registra solo al arrancar; con los dos activos, Cloudflare reparte el tráfico y los datos se separan.
2. Arrancar pve01/CT100 y comprobar que el CT tiene IPv4 y que `/api/health` responde por el dominio público (versión esperada, `database: connected`).
3. Reconciliar. Lo escrito durante la conmutación incluye **proyectos nuevos, ediciones y borrados de proyectos existentes** (`saveProject` actualiza la fila y añade historial) y filas de otras tablas (usuarios, carpetas, empresas, equipos, tarifas, notificaciones, lápidas). Abrir el volumen en un PostgreSQL temporal sin red y ejecutar `reconcile-report.sql` con el instante del dump como corte (`psql -v since="'<UTC>'" -f reconcile-report.sql`), en el volumen y en el CT100. **Descontar las filas que solo cambiaron por una migración nueva al arrancar la API** (mismo `updated_at` para muchas filas, instante de `schema_migrations.applied_at`). Para cada fila tocada en el volumen, tras un dump de seguridad del CT100:
   - Proyecto nuevo (código inexistente en el CT100): importar el proyecto, su `project_version_history` y sus `team_notifications` en una sola transacción (`COPY … FROM stdin` con `ON_ERROR_STOP`).
   - Proyecto existente editado o borrado (`version` mayor, `is_deleted` o `deleted_at`) y **sin cambios en el CT100 desde el corte**: reemplazar la fila del CT100 por la del volumen e importar las filas de historial y notificaciones nuevas.
   - Proyecto tocado en ambos lados: es un conflicto. No sobrescribir a ciegas; decidir con el responsable cuál versión gana (la otra se conserva como copia con otro id).
   - Cualquier otra tabla con filas nuevas o modificadas: aplicar la misma regla fila a fila.
   Verificar cada importación con un hash de `data_json` (y de `version`/`is_deleted`) en ambos lados.
4. Solo cuando el informe del volumen no tenga filas pendientes (cada fila importada, descartada por conflicto resuelto o por ser efecto de migración), borrar el volumen (`docker volume rm solarsim-backup_pgdata`) y los archivos con secretos de `~/solarsim-backup/failover/`.

### Red de pve01 y del CT100

`pve01` usa IP fija en `vmbr0`, y el CT100 también (`pct set 100 -net0 …,ip=<IP>/24,gw=<puerta>`, `-nameserver`): al arrancar con el puerto del switch aún sin reenviar, el DHCP no responde, `dhclient` se rinde y el CT queda sin IPv4, con el túnel inalcanzable (error 1033 en Cloudflare). La IP fija evita esa dependencia. Debe estar fuera del rango DHCP del router o reservada para el equipo. Si la red cambia (otra subred, puerta o DNS), hay que actualizar a mano `pve01` y los CT con IP fija. Valores exactos en el archivo privado. Si un CT llega a arrancar sin IPv4: `pct exec <id> -- dhclient -4 eth0` o fijar la IP.

## Proxy Caddy

El `Caddyfile` vive en la carpeta de servicio de Caddy en el CT (referencia en `infra/services/caddy/`). Tras editarlo, validar con `docker exec caddy-proxy caddy validate --config /etc/caddy/Caddyfile` y recargar sin cortar conexiones con `docker exec caddy-proxy caddy reload --config /etc/caddy/Caddyfile`.
