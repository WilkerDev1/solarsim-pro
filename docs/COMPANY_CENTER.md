# Centro empresarial

Los membretes locales y las organizaciones autenticadas son ámbitos distintos. Un membrete define el emisor de nuevas propuestas; no concede permisos ni cambia la organización del servidor. Cada organización autenticada mantiene sus propuestas, equipos personalizados, tarifas, configuración y permisos separados.

## Uso

El centro ofrece Membretes y marcas, Organizaciones y equipo y Perfil del consultor. Admite los temas claro/oscuro del escritorio Electron Linux/Windows, desde 1024×700. No se entrega una superficie móvil.

Los membretes permiten identidad fiscal, contacto, logo, recursos de marca, predeterminado, selección para nuevas propuestas y respaldo/importación como copias. No se incluyen contactos ni RNC ficticios en nuevos perfiles. La migración limpia únicamente valores de ejemplo conocidos de perfiles antiguos, una sola vez. El logo y la identidad se capturan al crear propuestas; editar o eliminar un membrete no reescribe propuestas existentes. Sellos, colores y condiciones del perfil se conservan como recursos/notas internas; no se anuncia su aplicación automática al PDF aprobado.

El perfil del consultor es local y distinto de la cuenta autenticada. Los formularios ofrecen guardar/descartar y protegen cambios pendientes en la navegación del centro.

ADMIN puede crear organizaciones independientes, editar el perfil compartido mediante CAS (`baseVersion`), gestionar equipo e invitar cuentas existentes. La consulta y administración de miembros del equipo utiliza el endpoint canónico `/api/users` (no la ruta legacy `/api/organization/members`). Una organización nueva empieza vacía y su creador obtiene ADMIN. EDITOR/LECTOR consultan el perfil; los permisos efectivos se consultan en BD. Las invitaciones se vinculan al correo, caducan en siete días y se almacenan como hashes; el código se presenta una sola vez para compartirlo manualmente. No se envía correo automáticamente. Cambiar rol, suspender o retirar acceso revoca invitaciones pendientes de esa persona en la organización. No se elimina el último administrador activo.

Retirar acceso preserva identidad e historial. Una cuenta exclusiva retirada queda desactivada y puede reactivarse desde el equipo; una pertenencia secundaria se retira solo de esa organización. Administradores de una organización no cambian nombre/contraseña de identidades compartidas. Restablecer contraseña de una identidad exclusiva invalida tokens anteriores.

## Aislamiento y compatibilidad

El cliente archiva el espacio durable por servidor y organización: propuestas, carpetas, historiales, colas, conflictos, catálogo, tarifas, membretes y preferencias. Cambio de contexto descarta respuestas asíncronas de la sesión anterior y remonta diálogos sensibles. Cerrar sesión recupera el espacio local; iniciar sesión no adjudica documentos locales a una empresa.

La migración del caché antiguo distribuye pertenencias explícitas e inferibles, incluyendo historial y comandos pendientes. Datos sin pertenencia identificable permanecen en el ámbito inicial; no se inventa su titularidad. Referencias técnicas oficiales pueden compartirse sin precios privados; modelos personalizados de Electsun permanecen privados. La copia del propietario conserva precios y cambios pendientes.

La API conserva `users.organization_id` como pertenencia primaria por compatibilidad, agregando pertenencias secundarias y perfil compartido. La migración aditiva 003 crea membresías/invitaciones y añade `auth_version`, `company_profile` y `profile_version`. Perfil compartido y política de funciones tienen versiones independientes. Servidores antiguos reciben un mensaje de actualización requerida, sin simular las nuevas capacidades.

## Despliegue

Esta implementación requiere desplegar API y cliente coordinadamente, después de respaldo y ensayo aislado. No basta actualizar el cliente para habilitar organizaciones. No se han escrito datos ni desplegado esta rama en producción.

No volver a API 2.2.0 después de usar membresías secundarias o revocaciones nuevas: desconoce esos permisos y podría conceder acceso indebido. El rollback debe usar una API compatible con la migración y los controles actuales. No revertir ni eliminar tablas para restaurar binarios. Conservar respaldo y probar recuperación antes del despliegue.

## Verificación

Las integraciones usan PostgreSQL Docker efímero; ningún test escribe en producción. La suite incluye aislamiento de organizaciones, CAS, invitaciones, revocación, escrituras en espera y conservación de atribución tras retirar acceso. El cliente cubre conservación de colas/historiales/metadatos entre ámbitos, snapshots documentales y respuestas tardías. Las capturas sintéticas están documentadas en [QA del centro](qa/company-center/README.md).
