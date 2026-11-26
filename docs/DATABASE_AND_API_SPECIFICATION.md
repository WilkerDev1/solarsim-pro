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
| GET/PATCH /api/organization/features | GET autenticado; PATCH ADMIN con `{settings,baseVersion}`. Política `{organizationId,version,settings}` con `settings = {selfConsumptionProjection, netMeteringRegimeSelector, quotations}` (booleanos). Cada versión de cliente gestiona solo sus claves (`featureKeysForClient`, según `X-SolarSim-Client`): `selfConsumptionProjection` antes de `FEATURE_POLICY_V2_CLIENT_VERSION` (o sin encabezado válido); también `netMeteringRegimeSelector` desde esa versión y antes de `FEATURE_POLICY_V3_CLIENT_VERSION` (prerreleases de esta incluidas); las tres desde esta. GET, la respuesta del PATCH y `featurePolicy` de las autorizaciones de publicación devuelven solo esas claves, completadas con su defecto si faltan en la fila. PATCH (rol ADMIN actual en base de datos) exige exactamente las claves de esa versión (`isFeatureSettingsForClient`; 400 con otras, de más o desconocidas, y siempre para clientes anteriores a V2) y las fusiona con la fila guardada (`feature_settings || $1`): las claves que esa versión no conoce se conservan. 409 si cambió. |
| POST /api/auth/share-authorization | Introspección JWT para publicación, rol escritor y política actual. |
| GET/POST /api/organizations | Listado y creación de organizaciones; creador obtiene ADMIN. |
| POST /api/auth/switch-organization | Cambio de tenant activo para el usuario actual. |
| GET/PATCH /api/organization/profile | Perfil compartido de empresa; PATCH con `baseVersion` CAS (ADMIN). |
| GET/POST/DELETE /api/organization/invitations | Invitaciones con token cifrado y vencimiento a 7 días (ADMIN). |
| POST /api/auth/accept-invitation | Aceptación de invitación y asignación de rol contextual. |
| GET/POST/PATCH/DELETE /api/users | Administración de miembros del tenant actual (no usar ruta legacy). |
| POST /api/sync/pull | `{lastSyncTimestamp?}`; devuelve los proyectos con `updated_at` desde el cursor (todos sin cursor), `deletedIds` siempre completos y watermark SQL textual (`serverTimestamp`). No convertir cursor a Date ni truncar microsegundos. El escritorio guarda el último `serverTimestamp` aplicado junto a la caché de proyectos de cada alcance (servidor + organización, `projectSyncCursor`) y descarga solo lo cambiado; un proyecto ausente de una descarga parcial sigue igual, no está borrado. Sin cursor, con otro alcance o con «Sincronizar ahora» en Ajustes la descarga es completa. Se corta tras 30 s sin recibir datos (tope 10 min), no a los 12 s del resto de solicitudes; si falla, los cambios locales se envían igual (CAS) y el error se informa aparte. Toda escritura de proyectos (incluidas migraciones) debe actualizar `updated_at` o los clientes no la verán. |
| POST /api/sync/push | `{projects}` con baseVersion. Nuevo=0; existente=última versión confirmada. `system_capacity_kwp` se calcula con `equipmentTotals(readEquipment(specs))` (grupos `specs.panels`; las propuestas heredadas derivan el grupo del espejo). `createdAt` solo se acepta al crear: un ISO válido desde 2000 se conserva (tope: reloj del servidor, para propuestas redactadas sin conexión); si falta o es inválido se usa el reloj del servidor, y las actualizaciones nunca lo cambian. |
| GET /api/document-assets/:sha256 | Contenido de una imagen del documento de la organización (`{success, sha256, content}`), cualquier rol; 404 si es de otra organización. Inmutable (`Cache-Control: immutable`). |
| DELETE /api/projects/:id | `?baseVersion=N`, eliminación suave CAS. |
| POST /api/projects/:id/restore | `?baseVersion=N`, restauración de papelera CAS. |
| DELETE /api/projects/:id?permanent=true | baseVersion obligatorio; solo un proyecto en papelera. Tombstone durable. |
| GET /api/projects/:id/history | Historial del tenant. |
| POST /api/projects/:id/history/:versionId/restore | baseVersion obligatorio; restaura contenido con nueva versión, no identidad/versiones antiguas. |
| GET /api/equipment | Catálogo accesible y deletedIds de ese ámbito. VIEWER puede descargar. |
| POST /api/equipment/batch | Solo escritores; baseVersion por equipo, no transferencia de propietario. |
| DELETE /api/equipment/:id | Equipo propio exige baseVersion; catálogo compartido se oculta para la organización, sin borrar su origen. |
| POST /api/equipment-prices/batch | Escritores (LECTOR 403; nunca tokens de agente). `{observations, voids:[{id}]}`, máximo 200 + 200. Registros primero y anulaciones después, en una transacción con `lockCurrentMembership` (sin bloqueo de proyectos). Estado por registro: `created`, `duplicate` (mismo id y contenido), `conflict` (mismo id, contenido distinto) o `rejected` (`reason: invalid \| foreign_equipment`); por anulación: `voided`, `already_voided`, `not_found` (el cliente reintenta) o `rejected` (id malformado). El equipo puede no existir; uno privado de otra organización se rechaza, los de referencia se aceptan. [Registros de precio](#registros-de-precio-migración-010). |
| GET /api/equipment-prices | `?equipmentId=&limit=` (1–500, por defecto 100) `&before=<seq>`: historial de un equipo de la organización, más recientes primero, con anulados (`voidedAt`), autor (`createdByName`) y, si la propuesta aún existe en la organización (papelera incluida), `projectName`/`projectCode`; si se purgó, `null`. `nextBefore` pagina por `seq`. También lectores y tokens de agente `read`. |
| GET /api/equipment-prices/generic | `{prices: {[equipmentId]: {priceUSD, observedAt, observationId}}}`: precio genérico vigente por equipo, sin los equipos ocultos por la organización. También lectores y tokens de agente `read`. |
| GET /api/clients | Clientes activos de la organización y `deletedIds`; también lectores. |
| PUT /api/clients/:id | Escritores; `{...cliente, baseVersion}` CAS (0 = crear). 409 con `client` actual o `null` si está borrado. |
| DELETE /api/clients/:id | `?baseVersion=N`; borrado lógico que quita `clientId` de las propuestas y sube su versión. |
| GET /api/quotations | `?since=<ISO>` opcional; también lectores. `{quotations, deletedIds, serverTimestamp}`: sin `since`, todas las vivas y todos los ids borrados; con `since`, solo las filas con `updated_at` en `[since, serverTimestamp]` (mismo corte que `/api/sync/pull`). `since` acepta un instante ISO con fecha real desde 1970 (con `Z` o desfase), que la API pasa a UTC conservando los microsegundos; lo que no se puede interpretar → 400. [Cotizaciones](#cotizaciones-migración-011). |
| PUT /api/quotations/:id | Escritores; `{baseVersion, content}` CAS (0 = crear; la API asigna `number`). 400 `{error}` si el contenido no valida, `inline_image_not_allowed`, `invalid_transition` o `quotation_locked`; 409 `{error, quotation}` (`null` si está borrada; un id borrado no se revive) o `{error, code:'invalid_client' \| 'invalid_folder', reason: <igual que code>, quotation}`. |
| DELETE /api/quotations/:id | Escritores; `?baseVersion=N`, borrado lógico CAS (409 con el registro actual o `null`; repetir con la versión borrada es idempotente; 404 si no existe). |
| GET /api/projects | `?query=&clientId=&limit=` (máx. 50): resumen de propuestas fuera de la papelera, sin el documento completo. También lectores. |
| GET /api/projects/:id | Propuesta canónica del tenant; con sesión de escritorio incluye la papelera (`isDeleted`), con token de agente una propuesta en papelera responde 404. 404 si es ajena. El escritorio la usa para leer una sola propuesta (abrir un conflicto, borrados en cola tras una descarga parcial). |
| PUT /api/projects/:id/client-link | Escritores; `{clientId: string \| null, baseVersion}` CAS. Solo cambia el enlace; el cliente debe existir y no estar borrado (404); 409 si la versión cambió o la propuesta está en la papelera. |
| GET /api/agent-access/status | Sesión de escritorio: `{enabled, oauthEnabled, mcpUrl?}` del [MCP remoto](MCP_REMOTE.md). |
| GET/POST/DELETE /api/agent-access/grants | Sesión de escritorio: accesos propios; POST `{name, scope:'read'\|'write', expiresInDays:30\|90\|365}` devuelve el token una sola vez (LECTOR solo `read`; 20 activos máx.). Revalida membresía, rol y `auth_version` dentro de la transacción (`lockCurrentMembership`). DELETE revoca (propio o, siendo ADMIN, de su organización); terminal e idempotente, sin baseVersion. 404 `agent_access_disabled` si está apagado. |
| GET /api/agent-access/activity | Actividad de los propios agentes; ADMIN con `?scope=organization` ve la de toda la organización (200 últimas, retención 180 días). |
| GET /api/agent-access/whoami | Solo tokens de agente: `{scope, role, userName, organizationName}`. |
| /.well-known/oauth-authorization-server, POST /oauth/register, GET/POST /oauth/authorize, POST /oauth/token, POST /oauth/revoke | Servidor de autorización OAuth 2.1 del MCP remoto, solo con `MCP_OAUTH_ENABLED`. Fuera de `/api`: no exigen versión de cliente. |

Push devuelve una confirmación por entrada. Proyectos: `{id,originalId?,status:'created'|'updated'|'forked',version,project}` o `{id,status:'conflict',reason,serverVersion,serverProject?}`; `reason:'invalid_client'` indica un `clientId` malformado, ajeno o borrado (los ids desconocidos se aceptan). Equipos: `{id,status:'created'|'updated',version,item}` o `{id,status:'conflict',reason,serverVersion?,serverItem?}`. Un HTTP200 con conflicto no marca datos como sincronizados. Cliente rechaza confirmaciones incompletas, repetidas o sin documento/versiones.

## Integridad

Actualizaciones, historial, versiones y metadatos se guardan transaccionalmente bajo bloqueo por organización. Tombstones impiden que una copia desconectada resucite un borrado físico. Las colas locales son durables, delimitadas por servidor/organización y contienen comandos concretos, nunca un DELETE /trash masivo reintentado posteriormente. Deshacer/restaurar conserva la base confirmada y crea trabajo pendiente nuevo.

Catálogo conserva ofertas como parte del documento versionado; una revisión stale produce conflicto y mantiene copia local. No se promete fusionar silenciosamente precios concurrentes del mismo equipo. Resolver exige aceptar servidor, rebasar explícitamente sobre su versión o crear copia. Datos compartidos de otra organización se consultan sin permiso de escritura.

## Imágenes del documento (migración 009)

Los logos de la propuesta (`customization.coverLogoBase64`, `headerLogoBase64`, `webHeaderLogoBase64`, `watermarkLogoBase64`) y las miniaturas de anexos (`customization.attachedPdfs[].thumbnailDataUrl`) se guardan una vez por organización en `document_assets` (clave: sha256 del texto exacto; inmutables, sin recolección) y la propuesta guarda la referencia `asset:sha256:<hex>` (`shared/documentAssets.ts`). Toda escritura de proyectos pasa por `saveProject`, que mueve las imágenes en línea a activos y rechaza con 400 `unknown_document_asset` (lote revertido) una referencia que la organización no tiene. Un logo distinto en una propuesta es su propio activo; cambiar el logo de la empresa crea otro y no altera propuestas existentes (instantánea de `companyDocumentSnapshot`).

- **Lectura según capacidad.** Pull, push (`project`, `serverProject`), `GET /api/projects/:id`, papelera, restauración, enlace de cliente e historial devuelven referencias solo a quien pide `?assetRefs=1` (parámetro, no cabecera: una cabecera nueva cambiaría la comprobación CORS y una API anterior bloquearía al escritorio); a cualquier otro (escritorios anteriores, agentes MCP) el contenido en línea. No hace falta subir `MIN_CLIENT_VERSION`.
- **Escritorio 2.8.2.** Pide `?assetRefs=1` en pull, push y lectura puntual; convierte cada referencia en su contenido antes de guardar (descarga cada imagen una vez por sesión y verifica su sha256), así que el store, el PDF, la publicación web y el visor solo ven imágenes. En el push envía como referencia solo las imágenes que ese servidor ya confirmó; las nuevas viajan una vez en línea. Ante `unknown_document_asset` reintenta una vez con las imágenes.
- **Migración 009.** Crea la tabla y mueve las imágenes de todos los proyectos (también papelera) sin cambiar `version` ni `updated_at`, como la 006. El historial (`project_version_history`) no se reescribe; se sirve en línea igual que el resto.

## Registros de precio (migración 010)

`equipment_price_observations` guarda los registros de precio de equipos por organización, solo de inserción ([ADR 0006](adr/0006-precio-generico-e-historial.md), funciones puras en `shared/equipmentPrices.ts`). No vive en `equipment_catalog`: no sube la versión del equipo, no choca con quien lo edita y funciona con los equipos de referencia sin filtrarse entre organizaciones.

| Columna | Contrato |
| --- | --- |
| `organization_id`, `id` | Clave primaria compuesta; `id` lo genera el cliente (`^po-[0-9a-f-]{36}$`). Borrado en cascada con la organización. |
| `seq` | `bigserial` único: orden de inserción en el servidor. |
| `equipment_id` | Sin FK (el equipo puede subir después o haberse borrado). |
| `kind` | `observation` o `generic` (`price_usd > 0`). |
| `price_usd`, `original_currency`, `original_price` | Precio en USD (≥ 0) y monto y moneda cotizados (`USD`/`DOP`). |
| `source` | `supplier_offer`, `ai_scan`, `proposal`, `manual`, `agent`. |
| `supplier_name`, `supplier_offer_id` | Copia del proveedor al momento. |
| `project_id` | Solo con `source = 'proposal'`; sin nombre de propuesta ni de cliente (se resuelve al leer). |
| `derived_from_id` | Solo en `generic`. |
| `observed_at` | El servidor guarda `LEAST(valor, clock_timestamp())`; antes de 2020 se rechaza. |
| `created_by_id`, `created_at`, `voided_at`, `voided_by_id` | Los pone el servidor; anular no borra la fila. |

Índices `(organization_id, equipment_id, seq DESC)` y `(organization_id, kind, equipment_id, seq DESC)`. El **precio genérico** de un equipo es el `generic` no anulado con mayor `seq`; anular el vigente devuelve el anterior. Las lecturas no toman bloqueos. Cambio aditivo: no sube `MIN_CLIENT_VERSION`; la migración no crea registros a partir de las ofertas existentes. Restaurar la base a un punto anterior a la 010 pierde registros ya confirmados.

## Migraciones y pruebas

Las migraciones aditivas 1/2 registran progreso y añaden tablas/columnas/índices sin vaciar proyectos, usuarios ni equipos. `npm --prefix server test` crea un contenedor PostgreSQL16 efímero, con puerto aleatorio de loopback y credenciales sintéticas, ejecuta API inyectada y destruye solo su contenedor en finally. No usa la BD empresarial.


## Recursos compartidos de esta rama

La migración aditiva 004 incorpora `project_folders` y `equipment_assets`. Las carpetas distinguen visibilidad pública de la organización y privada del creador, con CAS y tombstones. Los adjuntos guardan bytes y se deduplican por organización/tipo/SHA-256; la API valida pertenencia y referencias al guardar el equipo. El Worker consulta la API para autorizar lectura del registro organizacional; conserva su índice de metadatos separado del contenido temporal. Véase [contrato de recursos compartidos](SHARED_RESOURCES.md) para endpoints, permisos, paginación y límites de recuperación. Esta descripción del código no certifica su despliegue en producción.

## Clientes

La migración aditiva 005 incorpora `clients` (PK `(organization_id, id)`, versión, autoría y `deleted_at`) y los índices `clients(id)`, `clients(organization_id, tax_id)` y `projects(organization_id, data_json->>'clientId')`. El enlace vive en `data_json.clientId` de la propuesta. Es independiente de los datos impresos y la restauración de historial lo conserva. Contrato completo: [directorio de clientes](CLIENTS.md).

## Cotizaciones (migración 011)

La migración aditiva 011 crea `quotations` y `quotation_counters` ([ADR 0007](adr/0007-cotizaciones-entidad-propia.md); reglas del documento en `shared/quotations/`, que la API importa sin reimplementar). Rutas en `server/src/modules/quotations.ts`; no están en `AGENT_ROUTES` (un token `ssm_…` recibe 403 `agent_route_forbidden`) y exigen `X-SolarSim-Client`.

| Tabla / columna | Contrato |
| --- | --- |
| `quotations` | PK `(organization_id, id)`, `UNIQUE (organization_id, number)`; borrado en cascada con la organización. |
| `number` | `COT-AAAA-NNNN` (`formatQuotationNumber`), asignado al crear y nunca cambiado (aunque cambie `issueDate`) ni reutilizado tras un borrado. |
| `status` | `draft`, `issued`, `accepted`, `rejected`, `void` (copia de `data_json.status`). |
| `client_id`, `source_project_id`, `folder_id` | Copias indexables de los enlaces del contenido (nulas si no hay enlace). |
| `data_json` | `QuotationContent` normalizado por `validateQuotationContent`. |
| `created_by_id`, `created_by_name`, `version`, `created_at`, `updated_at`, `deleted_at` | Autoría, CAS, marcas de `clock_timestamp()` y borrado lógico. |
| `quotation_counters` | PK `(organization_id, year)`, `last_number`: último número emitido por organización y año de emisión. |

Índices `(organization_id, updated_at)`, `(organization_id, client_id)` y `(organization_id, folder_id)` (parciales, sin nulos).

- **Numeración.** Al crear, el año es `quotationNumberYear(content.issueDate)` y la secuencia sale de `INSERT … ON CONFLICT DO UPDATE SET last_number = last_number + 1` en la misma transacción que inserta la cotización: dos creaciones concurrentes nunca comparten número, un fallo revierte también el contador y un borrado no devuelve el número.
- **Escritura.** El rol escritor se revalida con `lockCurrentMembership`. `content` pasa por `validateQuotationContent` (400; rechaza también el carácter nulo y los sustitutos UTF-16 sueltos en cualquier texto, que `jsonb` no admite). Una cotización nueva solo se crea como `draft` o `issued` (otro estado → 400 `invalid_transition`, sin consumir número). La API no guarda imágenes en línea: `issuer.logo` y `attachments[].thumbnailDataUrl` deben ser `''` o `asset:sha256:<hex>` (400 `inline_image_not_allowed`); no comprueba que el activo exista. Al actualizar, un cambio de estado debe cumplir `canTransitionQuotation` (400 `invalid_transition`) y, si el estado guardado bloquea el contenido (`isQuotationContentLocked`: todo menos `draft`), el resto del contenido debe ser idéntico al guardado, ambos normalizados con el validador actual (400 `quotation_locked`): desde borrador se edita y emite en el mismo PUT; una emitida se reabre (`issued → draft`) y se edita en un PUT posterior.
- **Enlaces.** `clientId` sigue la regla del push de propuestas: malformado, de otra organización o borrado → 409 `invalid_client`; un id desconocido se acepta (cliente creado sin conexión). `folderId` también sigue la regla del push: un id desconocido se acepta (carpeta creada sin conexión); una carpeta borrada, de otra organización o privada de otro usuario → 409 `invalid_folder` (comprobado después de `invalid_client`), salvo que la cotización ya estuviera en esa carpeta privada. `sourceProjectId` se acepta si está bien formado.
- **Bloqueo y corte.** Escrituras, borrados y desenlaces toman el bloqueo transaccional `solarsim-quotations:<organización>` (exclusivo) antes del de membresía y, cuando también hace falta, después del de proyectos; la lectura lo toma compartido y calcula el cursor dentro de él, así una descarga parcial no pierde escrituras concurrentes.
- **Desenlace en cascada.** Borrar un cliente o una carpeta quita en la misma transacción `clientId`/`client_id` o `folderId`/`folder_id` de las cotizaciones vivas de la organización y sube su `version` y `updated_at`; los datos impresos (`client`) no cambian.
- Pruebas: `server/tests/quotations.test.ts` (PostgreSQL efímero).

## Tokens de agente (MCP remoto)

Un `Authorization: Bearer ssm_…` no es un JWT: lo resuelve una compuerta previa a las rutas (`server/src/modules/agentAccess/routes.ts`) contra `agent_grants`/`agent_tokens` (migración aditiva 008, con `oauth_clients`, `oauth_codes` y `agent_activity`). Solo pasa por las rutas de `AGENT_ROUTES` (`shared/agentAccess.ts`), con el alcance del acceso (`read` actúa como LECTOR) y los permisos actuales de la cuenta; cada petición queda en `agent_activity`. Las rutas `/api/auth/*` nunca aceptan estos tokens. Con `MCP_REMOTE_ENABLED` ausente cualquier `ssm_` recibe 401 y las rutas de gestión 404. Detalle en [MCP_REMOTE.md](MCP_REMOTE.md).

## Versión mínima de cliente

Cada cliente se identifica con `X-SolarSim-Client: <nombre>/<versión>` (por ejemplo `desktop/2.7.2`, `share-viewer/2.7.2`); la versión sale de `package.json` en la compilación. El servidor MCP local no llama a la API: sus herramientas pasan por el renderer, que se presenta como `desktop`. El servicio MCP remoto se presenta como `mcp-remote/<versión>` y pasa por la misma compuerta: si la API sube el mínimo por encima de su versión, sus herramientas responden `service_outdated` hasta desplegar la versión nueva del servicio (las rutas `/oauth/*` y `/.well-known/*` están fuera de `/api` y no la exigen). Un middleware (`server/src/clientVersionGate.ts`, registrado después de CORS) rechaza **toda ruta `/api/*` de datos** cuando el encabezado falta, está malformado (solo se acepta `nombre/semver`) o su versión es menor que `MIN_CLIENT_VERSION`:

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

`server/src/database/006_equipment_groups.ts` ejecuta `migrateLegacySpecs` ([ADR 0001](adr/0001-equipment-model-sin-espejo.md)) sobre `data_json.specs` de **todos** los proyectos (también los de la papelera y los de otras organizaciones): los que solo tenían el espejo reciben sus grupos y a todos se les borran `panelBrandModel`, `panelPowerW`, `panelCount`… y `selectedSupplierInfo` de nivel superior. Es invariante (no cambia costo, precio, kWp, energía, finanzas ni textos; un banco de baterías de capacidad total 0 conserva en su primer grupo la capacidad, el DOD y la eficiencia del espejo que el motor anterior usaba como respaldo), idempotente y transaccional (la transacción única de `migrateDatabase` con el bloqueo de migraciones; filas bloqueadas con `FOR UPDATE` por lotes de 200).

- **No sube `version` ni `updated_at`** y no recalcula `system_capacity_kwp`. El documento es equivalente y todo lector pasa por `readEquipment`; subir la versión crearía falsos conflictos de CAS para quien tenga la propuesta abierta y, como el pull incremental se basa en `updated_at`, obligaría a todos los clientes a descargar de nuevo cada propuesta. La capacidad guardada la usa solo el historial; se corrige en el siguiente guardado de cada propuesta.
- **`project_version_history` no se toca**: es el registro inmutable de versiones, sus instantáneas se leen con `readEquipment` y restaurar una pasa por `saveProject`, que recalcula la capacidad con los grupos.
- **Capacidad al guardar**: `saveProject` usa `equipmentTotals(readEquipment(specs)).capacityKWp`. Antes leía `specs.panelGroups`, que ningún cliente guarda, y para propuestas multigrupo solo contaba el espejo (el primer grupo).
- **Pruebas**: `server/tests/equipmentModel.test.ts` (solo heredado, mixto, multigrupo, sin batería, batería apagada con datos, ya limpio, `specs` nulo, 450 filas que cruzan lotes; totales iguales antes y después, sin espejo, versión/fechas intactas, historial y catálogo intactos, reaplicar no cambia nada) y los ensayos de restauración (`backupRehearsal.ts` y `migration003Rehearsal.test.ts`, migraciones 1 a 6).
- **Después de 006** una API sigue aceptando documentos con espejo (restaurar una instantánea antigua o empujar una caché atrasada): son equivalentes y se leen igual. Los clientes 2.6.0 y 2.7.0 ya no pueden sincronizar por la versión mínima.
