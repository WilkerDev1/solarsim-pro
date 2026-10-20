# Centro empresarial

El membrete compartido de la organización autenticada se sincroniza desde `/api/organization/profile` y define el emisor predeterminado de nuevas propuestas para sus miembros. También se conservan membretes locales adicionales; se identifican como Local y no se publican automáticamente. Un membrete no concede permisos ni cambia la organización del servidor. Cada organización autenticada mantiene sus propuestas, equipos personalizados, tarifas, configuración y permisos separados.

## Uso

El centro ofrece Membretes y marcas, Organizaciones y equipo y Perfil del consultor. Admite los temas claro/oscuro del escritorio Electron Linux/Windows, desde 1024×700. No se entrega una superficie móvil.

Los membretes permiten identidad fiscal, contacto, logo, recursos de marca, predeterminado, selección para nuevas propuestas y respaldo/importación como copias. No se incluyen contactos ni RNC ficticios en nuevos perfiles. La migración limpia únicamente valores de ejemplo conocidos de perfiles antiguos, una sola vez. El logo y la identidad se capturan al crear propuestas; editar o eliminar un membrete no reescribe propuestas existentes. Sellos, colores y condiciones del perfil se conservan como recursos/notas internas; no se anuncia su aplicación automática al PDF aprobado.

El membrete compartido usa `org-company:<organizationId>` y la versión confirmada del servidor. Se descarga al iniciar sesión, cambiar organización y sincronizar proyectos. El servidor guarda identidad, contacto, logo, sello, colores, lema, Instagram y marca de agua en `company_profile`. EDITOR/LECTOR lo consultan; el store bloquea mutaciones locales de ese perfil y el guardado emplea PATCH con `baseVersion` y comprobación ADMIN actual en BD. Un conflicto conserva el borrador para revisarlo; una respuesta de una sesión anterior o una organización distinta se descarta. Si la API no está disponible, se conserva el perfil confirmado del ámbito sin presentar un cambio local como sincronizado. Cambiar el perfil no reescribe propuestas previas ni plantillas particulares de PDF.

La identidad de Electsun está preparada en `src/services/electsunCompanyProfile.ts` a partir de los contactos y logos del repositorio: Electsun Dominicana S.R.L., 809 378-6590, info@electsun.com.do, electsun.com.do y dirección en Plaza Toledo. No incluye el RNC ficticio de los defaults históricos. Su aplicación en servidor debe seleccionar explícitamente el ID de la organización verificada, con respaldo y CAS; no se crea otra organización ni se detecta pertenencia por el nombre. El registro público continúa creando organizaciones independientes.

El perfil del consultor es local y distinto de la cuenta autenticada. Los formularios ofrecen guardar/descartar y protegen cambios pendientes en la navegación del centro.

ADMIN puede crear organizaciones independientes, editar el perfil compartido mediante CAS (`baseVersion`), gestionar equipo e invitar cuentas existentes. La consulta y administración de miembros del equipo utiliza el endpoint canónico `/api/users` (no la ruta legacy `/api/organization/members`). Una organización nueva empieza vacía y su creador obtiene ADMIN. EDITOR/LECTOR consultan el perfil; los permisos efectivos se consultan en BD. Las invitaciones se vinculan al correo, caducan en siete días y se almacenan como hashes; el código se presenta una sola vez para compartirlo manualmente. No se envía correo automáticamente. Cambiar rol, suspender o retirar acceso revoca invitaciones pendientes de esa persona en la organización. No se elimina el último administrador activo.

Retirar acceso preserva identidad e historial. Una cuenta exclusiva retirada queda desactivada y puede reactivarse desde el equipo; una pertenencia secundaria se retira solo de esa organización. Administradores de una organización no cambian nombre/contraseña de identidades compartidas. Restablecer contraseña de una identidad exclusiva invalida tokens anteriores.

## Aislamiento y compatibilidad

El cliente archiva el espacio durable por servidor y organización: propuestas, carpetas, historiales, colas, conflictos, catálogo, tarifas, membretes y preferencias. Cambio de contexto descarta respuestas asíncronas de la sesión anterior y reinicia diálogos sensibles. La época de sesión invalida solicitudes; la identidad y el ámbito del formulario determinan su ciclo de vida. Una renovación normal de token o un rechazo temporal en el mismo ámbito no deben borrar los borradores de Ajustes, del membrete ni del perfil compartido. Los secretos transitorios se limpian cuando corresponde. Cerrar sesión recupera el espacio local; iniciar sesión no adjudica documentos locales a una empresa.

La migración del caché antiguo distribuye pertenencias explícitas e inferibles, incluyendo historial y comandos pendientes. Datos sin pertenencia identificable permanecen en el ámbito inicial; no se inventa su titularidad. El historial de propuestas web se separa por servidor y organización. Registros legacy sin pertenencia demostrable se conservan en cuarentena y no se adjudican a la organización activa; respuestas tardías de una carga no se incorporan a otro ámbito. Referencias técnicas oficiales pueden compartirse sin precios privados; modelos personalizados de Electsun permanecen privados. La copia del propietario conserva precios y cambios pendientes.

La API conserva `users.organization_id` como pertenencia primaria por compatibilidad, agregando pertenencias secundarias y perfil compartido. La migración aditiva 003 crea membresías/invitaciones y añade `auth_version`, `company_profile` y `profile_version`. Perfil compartido y política de funciones tienen versiones independientes. Servidores antiguos reciben un mensaje de actualización requerida, sin simular las nuevas capacidades.

## Despliegue

El perfil (lema, Instagram, marca de agua) se guarda en el JSONB existente de la organización, sin migración adicional; requiere una API que incluya esos campos. Los ensayos de escritura usan bases desechables; el despliegue sigue [infraestructura](INFRASTRUCTURE_ARCHITECTURE.md).

No volver a API 2.2.0 después de usar membresías secundarias o revocaciones nuevas: desconoce esos permisos y podría conceder acceso indebido. El rollback debe usar una API compatible con la migración y los controles actuales. No revertir ni eliminar tablas para restaurar binarios. Conservar respaldo y probar recuperación antes del despliegue.

## Verificación

Las integraciones usan PostgreSQL Docker efímero; ningún test escribe en producción. La suite incluye aislamiento de organizaciones, CAS, invitaciones, revocación, escrituras en espera y conservación de atribución tras retirar acceso. El cliente cubre conservación de colas/historiales/metadatos entre ámbitos, snapshots documentales y respuestas tardías. Las capturas sintéticas iniciales están documentadas en [QA del centro](qa/company-center/README.md). El ensayo posterior de la aplicación completa con API HTTP y workerd reales, y el ensayo separado de borradores con transporte simulado, se distinguen en [QA del 7 de octubre](qa/review-2026-10-07/README.md).
