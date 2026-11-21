# SolarSim Pro 2.8.3

Parche de rendimiento y de documento. Abrir una propuesta vuelve a ser fluido. Las propuestas con inyección cero se presentan como sistemas de autoconsumo, no de medición neta. La API solo cambia de número de versión: no hay migración nueva y `MIN_CLIENT_VERSION` sigue en 2.8.0.

## Rendimiento

- **Abrir propuestas sin tirones.** Desde la 2.8.2, al abrir una propuesta los gráficos tardaban en aparecer y la app daba tirones. La causa era el guardado local: cada cambio, como abrir una propuesta, volvía a escribir de una vez todo el almacenamiento de la app, con los logos copiados en cada propuesta. En una instalación con muchos datos eso bloqueaba la pantalla entre 0.3 y 0.6 s.
  - El espacio de trabajo activo ya no se guarda dos veces. Al abrir la app se elimina la copia que dejó la 2.8.2.
  - Un ciclo de sincronización sin cambios ya no escribe nada. Antes eran dos escrituras completas cada 15 s.
  - Cada logo y cada miniatura se guarda una sola vez en el equipo. En memoria y en el PDF todo sigue igual. Los datos de versiones anteriores se cargan sin cambios y se reescriben en el formato nuevo.
  - Si el almacenamiento está casi lleno, el estado se sigue guardando siempre. La conversión se reintenta después, sin perder ediciones.
  - En una prueba sintética con 50 propuestas, cada escritura pasó de unos 118 ms a 0.4 ms.

## Inyección cero

- **Textos del documento.** En inyección cero estos textos ya no hablan de medición neta ni de exportación, ni citan la Res. SIE-007, y presentan el sistema como de autoconsumo e independencia de la red con limitador antivertido:
  - la nota regulatoria;
  - los servicios gestionados (sin «Medición Neta» y con «Configuración del Limitador Antivertido»);
  - el pie y la nota del cuadro resumen;
  - la fila «Modo de Operación»;
  - el tipo de instalación;
  - el pilar «Soporte Cercano»;
  - el subtítulo del índice.

  Los sistemas conectados a red y los aislados conservan sus textos.
- **Los textos siguen a la configuración.** Al cambiar el tipo de conexión de una propuesta, el documento se actualiza solo. Los textos editados a mano se conservan.
- **Diagrama de la Descripción Técnica.** Inyección cero usa un diagrama nuevo de autoconsumo: medidor con limitador antivertido y la red solo como respaldo. No dibuja el almacenamiento si la propuesta no tiene baterías.
- **Visor web.** La tabla mensual no muestra la columna «Inyección neta» en inyección cero, el texto de autoconsumo es nuevo y la nota de apagón es neutral. Los enlaces ya publicados conservan su nota regulatoria.

## Otros

- **SIE-007.** La liquidación anual del crédito sobrante se cita como art. 19, E.2 (i–ii): se paga el 100 % antes del 31 de enero, al precio de contratos CNE a 10 años. El 19.2 es la transición de los clientes de medición neta existentes.
- **Túnel del servidor en http2.** Documentado en la arquitectura de infraestructura; ya estaba aplicado en producción.
- Manifiestos de la 2.8.2 en el repositorio y una prueba de sincronización más estable.

## Despliegue

- **Visor web (Worker): despliegue necesario** para los cambios de inyección cero del visor. No cambia de contrato y puede ir en cualquier orden.
- **API:** solo cambia el número de versión. Sin migración.
- **Cliente:** publicar el instalador 2.8.3 con el flujo habitual.
- **Volver atrás:** un escritorio 2.8.2 o anterior que lea los datos locales escritos por la 2.8.3 mostraría referencias en lugar de logos. Solo pasaría al reinstalar una versión anterior.
- **MCP remoto:** solo cambia el número de versión.
