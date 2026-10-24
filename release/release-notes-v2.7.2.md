# SolarSim Pro 2.7.2

Versión de mantenimiento: la energía de la batería, los supuestos del proyecto y las ediciones se calculan cada uno en un solo lugar. No hay migración de datos ni cambio de versión mínima: los datos guardados no se reescriben y los clientes 2.7.1 siguen sincronizando. Las cifras calculadas sí pueden cambiar en los casos que corrige esta versión (descritos abajo: banco de 0 kWh, inflación 0, pérdidas del PDF en modo detallado, valores inválidos o fuera de rango). Al publicar, ninguna de las propuestas reales en producción caía en esos casos.

## Banco de baterías (#99)

- La energía útil y la autonomía del banco se calculan en un único módulo; la simulación, las finanzas, el PDF y la vista previa del dock usan el mismo resultado.
- Un banco con «Sí batería» pero sin capacidad (0 kWh) se trata como «sin almacenamiento» en todas partes. Antes el PDF mostraba una autonomía calculada con una sola batería que la simulación no usaba.

## Supuestos del proyecto (#100)

- Tasa de cambio, pérdidas, inflación, descuento, vida útil, cobertura, retención, vigencia, degradación, reemplazo de batería, $/W, margen y mano de obra salen de una sola tabla de reglas con su rango válido.
- Los ajustes del usuario siguen definiendo los valores de los proyectos nuevos. Si a una propuesta guardada le falta un supuesto, se usa el valor fijo del sistema, igual en todos los equipos y en la propuesta web.
- Un 0 se respeta donde tiene sentido (inflación, descuento, pérdidas, degradación, mano de obra y retención); en tasa, vida útil, vigencia, cobertura, $/W y margen se usa el valor por defecto. Los años y días deben ser enteros.
- Correcciones:
  - El resumen ejecutivo del PDF muestra las pérdidas del modo detallado (14 %) y la misma tasa de cambio que los costos.
  - Una inflación de 0 % ya no se convierte en 3,5 %.
  - El dock muestra siempre el valor que usa el cálculo (cobertura, tasa, retención, mano de obra, margen y degradación).
  - Una cobertura de 0 o fuera de rango dimensiona con 95 %, no con 1 %.

## Edición de proyecto (#101)

- Todas las ediciones de equipos, tarifas, cliente, consumo y precio de proveedor aplican las mismas reglas (autocálculo de paneles, proveedor, ajustes manuales de costos).
- Abrir o ver una propuesta ya no la modifica: no se sincroniza, no sube de versión ni deja entradas en deshacer. La corrección de potencia según el catálogo y la limpieza de proveedores huérfanos se aplican en la siguiente edición real.
- Aplicar un precio de proveedor se puede deshacer y, con el autocálculo activo, recalcula los paneles si cambia la potencia.
- Con el autocálculo activo, los paneles se recalculan cuando cambia cualquier dato del dimensionado, incluidas las horas de sol personalizadas del cliente.
- Las ediciones del contacto del cliente desde el editor del documento y desde las herramientas del agente siguen las mismas reglas.
- Si el catálogo aún no ha cargado, ya no se borran los proveedores elegidos.

## Propuesta web

- El visor toma la vigencia, la retención y la tasa de cambio del mismo módulo de supuestos que la aplicación.

## Compatibilidad

- No hay migración de datos. `MIN_CLIENT_VERSION` sigue en 2.7.1: las versiones 2.7.1 y 2.7.2 sincronizan con la API 2.7.2.
- La API 2.7.2 solo cambia el número de versión.

## Despliegue

1. Checkpoint de producción y ensayo de restauración con la imagen candidata (migraciones `[1,2,3,4,5,6]`, mismos conteos).
2. Worker 2.7.2 (visor).
3. API 2.7.2, sin migración.
4. Publicar el cliente 2.7.2 firmado.

## Distribución

Windows x64: instalador y portable. Linux x64: AppImage, Debian, pacman y tar.gz. Los paquetes Linux y los manifiestos de actualización se firman con la clave GPG fijada de SolarSim. Windows no dispone de firma Authenticode; macOS y ARM no forman parte de esta publicación.
