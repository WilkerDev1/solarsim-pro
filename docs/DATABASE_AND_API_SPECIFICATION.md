# API y base de datos

Contrato de esta rama; requiere cliente y backend coordinados antes de producción. La composición real está en `server/src/app.ts` y las migraciones en `server/src/database/`. No copiar DDL parcial de documentación al servidor.

## Autenticación

JWT de acceso de siete días. Cada solicitud verifica firma y consulta usuario activo, organización y rol actuales. `/api/auth/me` renueva una sesión aún válida mediante X-Renewed-Token; `/api/auth/refresh` admite recuperación solo dentro del límite de 30 días desde iat. El cliente reintenta una sola vez ante 401; 403 no provoca renovación. VIEWER se normaliza como LECTOR en backend. Registro público crea una organización independiente; miembros de una organización se crean por ADMIN, sin unión automática a la organización predeterminada.

JWT_SECRET y DB_PASSWORD son obligatorios, privados y sin fallback conocido. PATCH y DELETE de miembros comparten bloqueo por organización, revalidan al actor después de esperar y preservan un administrador activo.

## Contratos

| Ruta | Permisos y contrato |
| --- | --- |
| GET /api/health | Consulta BD y devuelve 503 si no está disponible. Abierta: no exige versión de cliente. |
| POST /api/auth/login, register, refresh | Credenciales o token según ruta; sin log de secretos. |
| GET /api/auth/me | Usuario actual; estado/rol desde BD. |
| GET/PATCH /api/organization/features | GET autenticado; PATCH ADMIN con `{settings,baseVersion}`. Política `{organizationId,version,settings}`. 409 si cambió. |
| POST /api/auth/share-authorization | Introspección JWT para publicación, rol escritor y política actual. |
| GET/POST /api/organizations | Listado y creación de organizaciones; creador obtiene ADMIN. |
| POST /api/auth/switch-organization | Cambio de tenant activo para el usuario actual. |
| GET/PATCH /api/organization/profile | Perfil compartido de empresa; PATCH con `baseVersion` CAS (ADMIN). |
| GET/POST/DELETE /api/organization/invitations | Invitaciones con token cifrado y vencimiento a 7 días (ADMIN). |
| POST /api/auth/accept-invitation | Aceptación de invitación y asignación de rol contextual. |
| GET/POST/PATCH/DELETE /api/users | Administración de miembros del tenant actual (no usar ruta legacy). |
| POST /api/sync/pull | `{lastSyncTimestamp?}`; devuelve proyectos completos, deletedIds y watermark SQL textual. No convertir cursor a Date ni truncar microsegundos. |
| POST /api/sync/push | `{projects}` con baseVersion. Nuevo=0; existente=última versión confirmada. `system_capacity_kwp` se calcula con `equipmentTotals(readEquipment(specs))` (grupos `specs.panels`; las propuestas heredadas derivan el grupo del espejo). |
| DELETE /api/projects/:id | `?baseVersion=N`, eliminación suave CAS. |
| POST /api/projects/:id/restore | `?baseVersion=N`, restauración de papelera CAS. |
| DELETE /api/projects/:id?permanent=true | baseVersion obligatorio; solo un proyecto en papelera. Tombstone durable. |
| GET /api/projects/:id/history | Historial del tenant. |
| POST /api/projects/:id/history/:versionId/restore | baseVersion obligatorio; restaura contenido con nueva versión, no identidad/versiones antiguas. |
| GET /api/equipment | Catálogo accesible y deletedIds de ese ámbito. VIEWER puede descargar. |
| POST /api/equipment/batch | Solo escritores; baseVersion por equipo, no transferencia de propietario. |
| DELETE /api/equipment/:id | Equipo propio exige baseVersion; catálogo compartido se oculta para la organización, sin borrar su origen. |
| GET /api/clients | Clientes activos de la organización y `deletedIds`; también lectores. |
| PUT /api/clients/:id | Escritores; `{...cliente, baseVersion}` CAS (0 = crear). 409 con `client` actual o `null` si está borrado. |
| DELETE /api/clients/:id | `?baseVersion=N`; borrado lógico que quita `clientId` de las propuestas y sube su versión. |

Push devuelve una confirmación por entrada. Proyectos: `{id,originalId?,status:'created'|'updated'|'forked',version,project}` o `{id,status:'conflict',reason,serverVersion,serverProject?}`; `reason:'invalid_client'` indica un `clientId` malformado, ajeno o borrado (los ids desconocidos se aceptan). Equipos: `{id,status:'created'|'updated',version,item}` o `{id,status:'conflict',reason,serverVersion?,serverItem?}`. Un HTTP200 con conflicto no marca datos como sincronizados. Cliente rechaza confirmaciones incompletas, repetidas o sin documento/versiones.

## Integridad

Actualizaciones, historial, versiones y metadatos se guardan transaccionalmente bajo bloqueo por organización. Tombstones impiden que una copia desconectada resucite un borrado físico. Las colas locales son durables, delimitadas por servidor/organización y contienen comandos concretos, nunca un DELETE /trash masivo reintentado posteriormente. Deshacer/restaurar conserva la base confirmada y crea trabajo pendiente nuevo.

Catálogo conserva ofertas como parte del documento versionado; una revisión stale produce conflicto y mantiene copia local. No se promete fusionar silenciosamente precios concurrentes del mismo equipo. Resolver exige aceptar servidor, rebasar explícitamente sobre su versión o crear copia. Datos compartidos de otra organización se consultan sin permiso de escritura.

## Migraciones y pruebas

Las migraciones aditivas 1/2 registran progreso y añaden tablas/columnas/índices sin vaciar proyectos, usuarios ni equipos. `npm --prefix server test` crea un contenedor PostgreSQL16 efímero, con puerto aleatorio de loopback y credenciales sintéticas, ejecuta API inyectada y destruye solo su contenedor en finally. No usa la BD empresarial.


## Recursos compartidos de esta rama

La migración aditiva 004 incorpora `project_folders` y `equipment_assets`. Las carpetas distinguen visibilidad pública de la organización y privada del creador, con CAS y tombstones. Los adjuntos guardan bytes y se deduplican por organización/tipo/SHA-256; la API valida pertenencia y referencias al guardar el equipo. El Worker consulta la API para autorizar lectura del registro organizacional; conserva su índice de metadatos separado del contenido temporal. Véase [contrato de recursos compartidos](SHARED_RESOURCES.md) para endpoints, permisos, paginación y límites de recuperación. Esta descripción del código no certifica su despliegue en producción.

## Clientes

La migración aditiva 005 incorpora `clients` (PK `(organization_id, id)`, versión, autoría y `deleted_at`) y los índices `clients(id)`, `clients(organization_id, tax_id)` y `projects(organization_id, data_json->>'clientId')`. El enlace vive en `data_json.clientId` de la propuesta. Es independiente de los datos impresos y la restauración de historial lo conserva. Contrato completo: [directorio de clientes](CLIENTS.md).

## Versión mínima de cliente

Cada cliente se identifica con `X-SolarSim-Client: <nombre>/<versión>` (`desktop/2.7.1`, `share-viewer/2.7.1`); la versión sale de `package.json` en la compilación. El servidor MCP local no llama a la API: sus herramientas pasan por el renderer, que se presenta como `desktop`. Un middleware (`server/src/clientVersionGate.ts`, registrado después de CORS) rechaza **toda ruta `/api/*` de datos** cuando el encabezado falta, está malformado (solo se acepta `nombre/semver`) o su versión es menor que `MIN_CLIENT_VERSION`:

```json
HTTP 426 Upgrade Required
{ "error": "client_outdated", "minVersion": "2.7.1", "message": "Actualiza SolarSim a la versión 2.7.1 o superior para seguir sincronizando." }
```

- **Rutas abiertas**: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me` y cualquier `OPTIONS` (preflight CORS). `/api/auth/me` queda abierta porque solo devuelve la identidad de la sesión y porque la renovación de token (`X-Renewed-Token`) no debe cortarse: un cliente rechazado conserva su sesión, la ve válida y puede mostrar el aviso de actualización en vez de parecer desconectado. Registro, invitaciones, autorización del visor y todo lo demás sí exigen versión.
- **Comparación semver** (SemVer 2.0.0, `shared/clientVersion.ts`): numérica, no de texto (`2.10.0 > 2.7.1`); un prelanzamiento es anterior a su versión final (`2.7.1-beta.1 < 2.7.1`); los metadatos `+build` no cuentan. Cualquier encabezado malformado cuenta como obsoleto.
- **Configuración**: variable de entorno `MIN_CLIENT_VERSION` (por defecto `2.7.1`). Debe ser `major.minor.patch` estable (sin prelanzamiento ni `+build`); un valor inválido hace fallar el arranque, nunca las solicitudes. Está declarada en `infra/services/solarsim-api/docker-compose.yml`. `createApp({ minClientVersion })` la inyecta en las pruebas.
- **CORS**: `X-SolarSim-Client` está en `allowHeaders` (API y Worker); el 426 lleva cabeceras CORS para que el renderer lo lea.
- **Cliente 2.7.1+**: ante un 426 `client_outdated` deja de reintentar rutas de datos de ese servidor (devuelve un 426 local sin tocar la red hasta reiniciar), conserva el trabajo local pendiente y muestra el aviso fijo «Actualiza SolarSim para seguir sincronizando» con la versión mínima y un botón que abre el actualizador. Salud, inicio de sesión, renovación e identidad siguen funcionando. Las llamadas al Worker no llevan el encabezado ni se bloquean.
- **Worker**: envía `share-viewer/<versión>` en cada autorización. Si la API lo rechaza (visor atrasado), la publicación responde 503 y el Worker registra el 426.

Procedimiento para subir el mínimo: [Mantenimiento y releases](MAINTENANCE_AND_UPDATES.md#versión-mínima-de-cliente).

## Migración 006: equipos sin espejo

`server/src/database/006_equipment_groups.ts` ejecuta `migrateLegacySpecs` ([ADR 0001](adr/0001-equipment-model-sin-espejo.md)) sobre `data_json.specs` de **todos** los proyectos (también los de la papelera y los de otras organizaciones): los que solo tenían el espejo reciben sus grupos y a todos se les borran `panelBrandModel`, `panelPowerW`, `panelCount`… y `selectedSupplierInfo` de nivel superior. Es invariante (no cambia costo, precio, kWp, energía, finanzas ni textos), idempotente y transaccional (la transacción única de `migrateDatabase` con el bloqueo de migraciones; filas bloqueadas con `FOR UPDATE` por lotes de 200).

- **No sube `version` ni `updated_at`** y no recalcula `system_capacity_kwp`. El documento es equivalente y todo lector pasa por `readEquipment`; subir la versión crearía falsos conflictos de CAS para quien tenga la propuesta abierta y, como el pull incremental se basa en `updated_at`, obligaría a todos los clientes a descargar de nuevo cada propuesta. La capacidad guardada la usa solo el historial; se corrige en el siguiente guardado de cada propuesta.
- **`project_version_history` no se toca**: es el registro inmutable de versiones, sus instantáneas se leen con `readEquipment` y restaurar una pasa por `saveProject`, que recalcula la capacidad con los grupos.
- **Capacidad al guardar**: `saveProject` usa `equipmentTotals(readEquipment(specs)).capacityKWp`. Antes leía `specs.panelGroups`, que ningún cliente guarda, y para propuestas multigrupo solo contaba el espejo (el primer grupo).
- **Pruebas**: `server/tests/equipmentModel.test.ts` (solo heredado, mixto, multigrupo, sin batería, batería apagada con datos, ya limpio, `specs` nulo, 450 filas que cruzan lotes; totales iguales antes y después, sin espejo, versión/fechas intactas, historial y catálogo intactos, reaplicar no cambia nada) y los ensayos de restauración (`backupRehearsal.ts` y `migration003Rehearsal.test.ts`, migraciones 1 a 6).
- **Después de 006** una API sigue aceptando documentos con espejo (restaurar una instantánea antigua o empujar una caché atrasada): son equivalentes y se leen igual. Los clientes 2.6.0 y 2.7.0 ya no pueden sincronizar por la versión mínima.
