# API y base de datos

Contrato de esta rama; requiere cliente y backend coordinados antes de producción. La composición real está en `server/src/app.ts` y las migraciones en `server/src/database/`. No copiar DDL parcial de documentación al servidor.

## Autenticación

JWT de acceso de siete días. Cada solicitud verifica firma y consulta usuario activo, organización y rol actuales. `/api/auth/me` renueva una sesión aún válida mediante X-Renewed-Token; `/api/auth/refresh` admite recuperación solo dentro del límite de 30 días desde iat. El cliente reintenta una sola vez ante 401; 403 no provoca renovación. VIEWER se normaliza como LECTOR en backend. Registro público crea una organización independiente; miembros de una organización se crean por ADMIN, sin unión automática a la organización predeterminada.

JWT_SECRET y DB_PASSWORD son obligatorios, privados y sin fallback conocido. PATCH y DELETE de miembros comparten bloqueo por organización, revalidan al actor después de esperar y preservan un administrador activo.

## Contratos

| Ruta | Permisos y contrato |
| --- | --- |
| GET /api/health | Consulta BD y devuelve 503 si no está disponible. |
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
| POST /api/sync/push | `{projects}` con baseVersion. Nuevo=0; existente=última versión confirmada. |
| DELETE /api/projects/:id | `?baseVersion=N`, eliminación suave CAS. |
| POST /api/projects/:id/restore | `?baseVersion=N`, restauración de papelera CAS. |
| DELETE /api/projects/:id?permanent=true | baseVersion obligatorio; solo un proyecto en papelera. Tombstone durable. |
| GET /api/projects/:id/history | Historial del tenant. |
| POST /api/projects/:id/history/:versionId/restore | baseVersion obligatorio; restaura contenido con nueva versión, no identidad/versiones antiguas. |
| GET /api/equipment | Catálogo accesible y deletedIds de ese ámbito. VIEWER puede descargar. |
| POST /api/equipment/batch | Solo escritores; baseVersion por equipo, no transferencia de propietario. |
| DELETE /api/equipment/:id | Equipo propio exige baseVersion; catálogo compartido se oculta para la organización, sin borrar su origen. |

Push devuelve una confirmación por entrada. Proyectos: `{id,originalId?,status:'created'|'updated'|'forked',version,project}` o `{id,status:'conflict',reason,serverVersion,serverProject?}`. Equipos: `{id,status:'created'|'updated',version,item}` o `{id,status:'conflict',reason,serverVersion?,serverItem?}`. Un HTTP200 con conflicto no marca datos como sincronizados. Cliente rechaza confirmaciones incompletas, repetidas o sin documento/versiones.

## Integridad

Actualizaciones, historial, versiones y metadatos se guardan transaccionalmente bajo bloqueo por organización. Tombstones impiden que una copia desconectada resucite un borrado físico. Las colas locales son durables, delimitadas por servidor/organización y contienen comandos concretos, nunca un DELETE /trash masivo reintentado posteriormente. Deshacer/restaurar conserva la base confirmada y crea trabajo pendiente nuevo.

Catálogo conserva ofertas como parte del documento versionado; una revisión stale produce conflicto y mantiene copia local. No se promete fusionar silenciosamente precios concurrentes del mismo equipo. Resolver exige aceptar servidor, rebasar explícitamente sobre su versión o crear copia. Datos compartidos de otra organización se consultan sin permiso de escritura.

## Migraciones y pruebas

Las migraciones aditivas 1/2 registran progreso y añaden tablas/columnas/índices sin vaciar proyectos, usuarios ni equipos. `npm --prefix server test` crea un contenedor PostgreSQL16 efímero, con puerto aleatorio de loopback y credenciales sintéticas, ejecuta API inyectada y destruye solo su contenedor en finally. No usa la BD empresarial.
