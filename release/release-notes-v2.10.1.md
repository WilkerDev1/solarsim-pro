# SolarSim Pro 2.10.1

Versión de corrección de cotizaciones. Una cotización creada desde una propuesta ahora cuadra al centavo con ella, la propuesta de origen se ve sin salir de la cotización, y sus documentos llegan a los adjuntos al enlazarla.

## Cotización desde una propuesta

- **Total e ITBIS iguales a los de la propuesta.** Con descuentos y líneas con ITBIS a la vez, el borrador quedaba por debajo del total de la propuesta, a veces por cientos de dólares. Ahora el descuento se aplica a la parte sin ITBIS, igual que en la propuesta: primero a la línea del sistema y, si no cabe, a los extras sin ITBIS. Debajo de cada línea rebajada aparece «Incluye descuento: … −US$ X», así que el descuento sigue a la vista. Solo si el descuento no cabe en ninguna línea sin ITBIS, el sobrante se descuenta de todo el documento y el diálogo avisa de la diferencia exacta.
- Las filas descriptivas sin cantidad ya no muestran «0» en el detalle del catálogo ni en el editor.

## Propuesta de origen sin salir de la cotización

- **«Ver propuesta»** abre la propuesta en un panel de solo lectura junto al formulario, con un separador para ajustar el ancho. Tiene tres pestañas: «Resumen», «Documento» con las páginas del PDF de la propuesta, y «Parámetros» con consumo, tarifa, equipos y datos financieros. Mirarla no cambia nada de la propuesta.
- **«Abrir propuesta»** la abre completa y deja un botón «Volver a COT-…» que regresa al editor en la misma pestaña.

## Documentos de la propuesta enlazada

- Al enlazar una propuesta, o al crear la cotización desde ella, sus documentos llegan a «Adjuntos» en un grupo propio, «De la propuesta …». Cada uno se puede incluir en el PDF, dejar solo como relacionado o quitar.
- «Actualizar desde la propuesta» trae los documentos nuevos sin duplicar ni devolver los que se quitaron.
- Al quitar el enlace con la propuesta, la app pregunta si conservar o quitar esos documentos.

## Despliegue

- **API:** redesplegar con esta versión, sin migración nueva. Así los documentos que se quitan de una propuesta se recuerdan en todos los equipos; con la API 2.10.0 solo los recuerda el equipo donde se quitaron. Ensayo de restauración con checkpoint, que debe terminar en `[1..12]`.
- **`MIN_CLIENT_VERSION`:** no cambia, sigue en 2.9.0.
- **Visor web (Worker) y MCP remoto:** solo cambia el número de versión; redesplegarlos es opcional.
- **Cliente:** publicar el instalador 2.10.1 con el flujo habitual.
