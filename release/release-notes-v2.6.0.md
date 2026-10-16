# SolarSim Pro 2.6.0

Esta versión facilita organizar variantes de una propuesta, conservar el historial comercial y administrar precios y disponibilidad de proveedores. Incluye correcciones de sincronización e importación y separa los logotipos de encabezado PDF y web.

## Propuestas y seguimiento

- Resumen renovado con información técnica, energética, financiera e historial de la propuesta.
- Familias de propuestas con principal e hijas, acento de color y sangría. Las copias nuevas quedan relacionadas con la original; las existentes pueden enlazarse mediante menú contextual o arrastre con espera. Clic derecho o Shift+F10 permite organizar el grupo.
- Un estado comercial actual y múltiples reportes históricos con identificador, fecha y autor. Los reportes anteriores se pueden expandir; registrar un antecedente no obliga a cambiar el estado actual.
- Filtros y resultados por responsable basados en el estado actual. Los importes representan cotizaciones, no ingresos cobrados.
- La pestaña financiera del simulador queda dedicada al retorno y al flujo de caja, sin el recuadro de seguimiento comercial.

## Catálogo y documentos

- Administración de proveedores con edición de precios y disponibilidad, selección múltiple y cambios de disponibilidad por lote.
- Diálogo de ofertas reorganizado: lista y formulario separados, proveedor existente, validación de precio, disponibilidad, SKU y notas, con acciones de guardado siempre accesibles.
- Mejoras de contraste y presentación en modo claro y oscuro.
- Encabezados PDF y web con logotipos independientes: blanco para el PDF y a color para la web. Las publicaciones existentes conservan su snapshot; los cambios se aplican a nuevas publicaciones.

## Integridad y compatibilidad

- Relaciones y reportes se guardan localmente y se sincronizan con control de versión y permisos actuales.
- La API valida pertenencia, ciclos y responsables; conserva reportes históricos ante omisiones de clientes anteriores.
- Recuperar una propuesta eliminada remotamente crea una copia independiente, sin referencias al original borrado.
- Las copias importadas limpian responsables, vínculos y reportes del origen. Sobrescribir contenido técnico conserva el seguimiento y los vínculos del destino.
- La primera edición comercial de propuestas antiguas conserva al responsable histórico aunque esté inactivo, sin habilitar nuevas asignaciones a usuarios inactivos.
- API y visor web preparados para la versión 2.6.0. El modo de cálculo clásico continúa como predeterminado.

## Distribución

Windows x64: instalador y portable. Linux x64: AppImage, Debian, pacman y tar.gz. Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim. Windows no dispone de firma Authenticode; macOS y ARM no forman parte de esta publicación.
