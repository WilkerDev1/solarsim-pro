# SolarSim Pro 2.9.1

Parche de pulido de la 2.9.0. Corrige cuatro detalles encontrados al probar la versión: el tooltip ⓘ del panel de parámetros, la tecla Escape dentro de los diálogos de Ajustes, la moneda original del precio genérico creado desde una propuesta y el id de los equipos nuevos. La API solo cambia de número de versión: no hay migración nueva y la versión mínima del cliente sigue en 2.9.0.

## Panel de parámetros

- **El tooltip ⓘ se cierra al desplazar el panel o redimensionar la ventana.** Si se había abierto con el puntero, el tooltip seguía abierto al desplazar el panel y tapaba otros controles hasta mover el ratón. Ahora se cierra. Si el ⓘ tiene el foco del teclado, el tooltip lo sigue mientras esté a la vista. Redimensionar la ventana lo cierra siempre, y desplazar otro contenedor de la ventana no lo afecta.

## Ajustes

- **Escape dentro de un diálogo cierra solo el diálogo.** Pulsar Escape con el diálogo de ofertas abierto cerraba también Ajustes, y la confirmación «Descartar oferta» aparecía sobre la pantalla principal. Ahora Escape cierra primero el diálogo abierto, y Ajustes solo se cierra con un Escape fuera de cualquier diálogo.

## Precios y catálogo

- **Genérico creado desde una propuesta.** Al responder «Usar» a «¿Usar como precio genérico?», el genérico guarda ahora su moneda y su precio original (USD). El historial de precios los muestra igual que en los genéricos que vienen de una oferta.
- **Id de los equipos nuevos.** Un equipo nuevo guardado como batería o inversor llevaba en el id el prefijo de panel (`eq-panel-…`), porque el editor empieza con ese tipo. Ahora el prefijo sigue el tipo final (`eq-battery-…`, `eq-inverter-…`). Los ids de los equipos existentes no cambian.

## Otros

- Manifiestos de la 2.9.0 en el repositorio.

## Despliegue

- **API:** solo cambia el número de versión. Sin migración. La variable de entorno `MIN_CLIENT_VERSION` del despliegue no cambia y sigue en 2.9.0.
- **Visor web (Worker):** solo cambia el número de versión.
- **MCP remoto:** solo cambia el número de versión.
- **Cliente:** publicar el instalador 2.9.1 con el flujo habitual.
