# SolarSim Pro 2.5.1

Actualización de estabilidad para cotizaciones, catálogo y sincronización. Corrige cantidades y costos de baterías, agiliza el uso de fichas técnicas y conserva cambios pendientes cuando el servidor no está disponible.

## Cotizaciones y baterías
- Activar BESS en una copia de una propuesta de inyección guarda una cantidad real positiva; el campo y el cálculo usan el mismo valor.
- Aplicar ofertas de proveedores actualiza el grupo principal en proyectos con múltiples modelos, incluidos capacidad y DoD de baterías.
- Cambiar una oferta invalida totales manuales antiguos para que costos y precio final se recalculen de forma coherente.
- Regresiones adicionales verifican la diferencia entre recargo sobre costo y margen sobre venta, incluido un recargo explícito de cero.

## Catálogo y fichas técnicas
- Los modelos escaneados se guardan localmente antes de intentar subir la ficha; un servidor apagado no bloquea la importación.
- Nueva casilla para decidir si vincular el documento escaneado a los equipos creados o actualizados.
- En Propuesta PDF, la sección de anexos detecta fichas vinculadas a los equipos activos y permite adjuntarlas sin repetir documentos compartidos entre variantes.
- Un dispositivo que conserva los datos de un anexo pero no su archivo puede recuperar la ficha sin duplicar el anexo.

## Sincronización
- Conservación y reintento de carpetas creadas sin conexión.
- Reconciliación de conflictos y respuestas canónicas de proyectos, incluida la asignación de carpetas.
- Refuerzo del aislamiento entre organizaciones y recuperación del contenido local pendiente.

## Entrega y compatibilidad
- Binarios x64 de Windows: instalador y portable. Linux: AppImage, Debian, pacman y tar.gz.
- Compilación y pruebas de paquetes en runners de GitHub Actions. Paquetes Linux y manifiestos del updater verificados y firmados con la clave fijada de SolarSim.
- Vincular o descargar fichas del servidor exige conexión y autenticación; después quedan disponibles como anexos locales.
- Windows continúa sin firma Authenticode. macOS no forma parte de esta entrega.
- La versión informada por la API se alinea a 2.5.1; los contratos CAS, permisos y esquema de datos existentes se conservan.
