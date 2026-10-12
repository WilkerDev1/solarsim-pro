# Recursos compartidos de la organización

Este contrato describe el código de esta rama. La disponibilidad en cada entorno depende de desplegar la API y el Worker compatibles; no constituye una comprobación de producción.

## Carpetas públicas y privadas

Las carpetas autenticadas se guardan en PostgreSQL por organización. `visibility=public` es el valor predeterminado y significa visible para los miembros de esa organización. `private` limita la carpeta a su creador; no oculta ni concede permisos sobre los proyectos, que mantienen los permisos organizacionales existentes. Usuarios LECTOR consultan; ADMIN/EDITOR pueden gestionar carpetas públicas y las propias privadas. Solo el creador convierte una carpeta pública en privada.

`GET /api/folders` devuelve carpetas visibles y tombstones. `PUT /api/folders/:id` usa `baseVersion=0` para crear y la versión confirmada para editar. `DELETE /api/folders/:id` exige la versión confirmada; desvincula proyectos y conserva un tombstone. Los conflictos se comunican al cliente y no se sobrescribe una edición concurrente. Los cambios pendientes y colas de borrado son durables y se aíslan por servidor/organización; la descarga de una cuenta no restaura carpetas privadas de otra.

La migración aditiva 004 añade `project_folders`; las carpetas locales previas se envían desde su ámbito actual cuando el usuario sincroniza. No se adjudican carpetas de otro espacio por iniciar sesión.

## Registro de propuestas web

El contenido se guarda antes de su índice para evitar anunciar enlaces cuyo cuerpo no pudo persistirse. KV no ofrece transacciones: si falla únicamente la escritura del índice, su contenido puede recuperarse mediante el recorrido de recuperación mientras siga vigente.

Las publicaciones nuevas guardan contenido temporal `proposal:<id>` y metadatos durables `history:<organizationId>:<id>` en Cloudflare KV. El contenido vence según su vigencia; el registro conserva fecha, proyecto, cliente, identificador, expiración y autor de la publicación. El nombre y el ID del autor se obtienen de la sesión verificada por API, no del documento enviado por el cliente. Las publicaciones existentes no se reescriben al cambiar el perfil empresarial.

El Worker consulta `/api/auth/share-history-authorization` en la API para determinar la organización y los permisos actuales. Todos sus miembros activos pueden consultar `GET /api/share/history`; publicar requiere ADMIN/EDITOR mediante el endpoint de autorización de publicación. El índice se recorre con cursor, 100 claves por página, hasta completar todas las páginas. El cliente descarta respuestas de otra sesión/organización, reconstruye enlaces con el origen del Worker y rechaza cursores repetidos. Si el Worker rechaza un token vencido, su renovación se solicita en la API de la sesión, después se reintenta el Worker con el token confirmado. Una falla de almacenamiento local se comunica como error, sin contar registros como guardados.

`GET /api/share/history-recover` recorre contenido anterior al índice y recupera únicamente registros con `publishedBy.organizationId` explícito en KV. Un documento sin pertenencia demostrable no se asigna a la empresa conectada. Un documento histórico cuyo contenido ya venció y no tenía índice no puede recuperarse desde KV. Los cachés locales ambiguos permanecen en cuarentena.

Ocultar un enlace o limpiar vencidos es una preferencia de este dispositivo y organización: no revoca enlaces, no borra el registro del equipo y no afecta a otros miembros. El registro muestra errores de conexión o incompatibilidad para distinguirlos de una lista vacía. No se incluye una acción de revocación remota.

## Equipos, ofertas y adjuntos

El editor de equipos reúne especificaciones, precios/ofertas de proveedores y recursos adjuntos. Las ofertas conservan proveedor, precio y moneda, SKU, fecha, stock y notas; agregar o editar ofertas respeta los permisos y versiones del catálogo. El cambio de precio de inventario no reescribe cotizaciones anteriores.

`POST /api/equipment-assets` recibe un archivo y `kind=datasheet|image`. Se verifican tamaño (1 byte a 8 MiB), cabeceras y tipo admitido: PDF, PNG, JPEG o WebP; una imagen no admite PDF. El servidor almacena bytes en PostgreSQL `equipment_assets`, separados por organización. SHA-256 más organización y tipo deduplican contenido: varios modelos pueden referenciar el mismo datasheet mediante su ID sin duplicar bytes. Un modelo conserva una referencia de datasheet; sus imágenes son referencias separadas. Importar desde el escáner adjunta el documento original solo después de revisar el equipo y confirmar su incorporación.

`GET /api/equipment-assets/:id` exige pertenencia activa a la organización propietaria y devuelve una descarga con `nosniff`, sin caché compartida. Los IDs y el tipo de las referencias se validan al guardar equipos; no se aceptan archivos de otra organización ni IDs inexistentes. No se publica un enlace de archivo abierto ni se introduce acceso a Node desde el renderizador. Los adjuntos sin referencia se conservan; esta rama no entrega un recolector ni borrado automático de archivos.

## Identidad empresarial

El perfil compartido y el membrete principal se sincronizan por organización con control ADMIN y CAS; véase [Centro empresarial](COMPANY_CENTER.md). Electsun utiliza su perfil explícito, contactos y logos verificados en el repositorio. El RNC de ejemplo no se considera información legal verificada: el default nuevo queda vacío y las plantillas antiguas no copian ese valor de fábrica a propuestas nuevas. Los snapshots anteriores se conservan. El registro público continúa separado y no une automáticamente cuentas nuevas a Electsun.

## Verificación y operación

Las pruebas usan transportes sintéticos y PostgreSQL efímero. No deben escribir en producción. Gates obligatorios: frontend lint/test/build, build Electron, test/build API y test/build Worker. Los cambios estructurales requieren regenerar Repomix. Para despliegue, usar el contexto raíz del repositorio, respaldo y procedimientos de [infraestructura](INFRASTRUCTURE_ARCHITECTURE.md).
