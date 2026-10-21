# SolarSim Pro 2.6.1

Versión de mantenimiento centrada en coherencia de cálculos, confirmaciones dentro de la aplicación, permisos y limpieza interna. No cambia el modelo de datos ni añade migraciones de base.

## Cálculos y documentos

- Una sola regla de margen e ITBIS para artículos adicionales en el motor, la interfaz y el visor web. Los artículos adicionales llevan el margen del proyecto salvo que se desactive explícitamente; el total por precio directo ($/W) y el subtotal antes de impuestos dejan de tratarlos como "sin margen". Los totales a pagar en modo matriz de costos no cambian.
- El visor web recalcula el ITBIS de artículos no exonerados en enlaces publicados antes de que el resumen lo incluyera, con las mismas reglas del motor.
- El resumen ejecutivo usa la base de equipos de Ley 57-07 que calcula el motor.
- Las casillas de revisión de propuestas generadas por IA muestran los valores predeterminados del motor.

## Equipos

- Los grupos de equipos son la única fuente de datos; los campos heredados se mantienen como reflejo.
- El dimensionamiento automático de paneles se conserva al normalizar grupos o cambiar de modelo, y la selección de proveedor llega al grupo principal.

## Interfaz

- Diálogo de confirmación propio en lugar del `confirm()` nativo: tema claro/oscuro, foco inicial en Cancelar para acciones destructivas, Escape cancela, Enter confirma y el foco vuelve al control que lo abrió.
- Modo oscuro unificado con variantes de Tailwind.

## Permisos e integridad

- Comprobaciones de rol centralizadas y compartidas entre cliente y API.
- Las propuestas en la papelera quedan de solo lectura también en el almacén, incluidas las acciones del asistente.

## Mantenimiento

- Se eliminaron componentes, puentes IPC y dependencias sin uso, y se consolidó código duplicado de sincronización, PDF y presentación.
- Pruebas reforzadas para que fallen ante regresiones.
- API y visor web en versión 2.6.1, compatibles con clientes 2.6.0.

## Distribución

Windows x64: instalador y portable. Linux x64: AppImage, Debian, pacman y tar.gz. Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim. Windows no dispone de firma Authenticode; macOS y ARM no forman parte de esta publicación.
