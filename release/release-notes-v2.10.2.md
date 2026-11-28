# SolarSim Pro 2.10.2

Versión de corrección de cotizaciones. Los adjuntos pueden ir dentro del PDF, aparte en el correo o en los dos sitios. El visor de la propuesta muestra la tabla interna de costos. Y una cotización emitida ya no queda atascada al aceptarla, anularla o reabrirla.

## Adjuntos: dentro del PDF, aparte en el correo o ambos

- Cada adjunto tiene dos destinos que se pueden combinar: **«Dentro del PDF»** (se añade completo al final del PDF) y **«Archivo aparte en el correo»** (va como archivo suelto para adjuntarlo a mano). Al menos uno queda marcado; para no enviarlo, se quita el adjunto. Cada grupo resume cuántos van a cada lado, por ejemplo «2 en el PDF · 1 aparte».
- **Vista previa del PDF:** después de la cotización aparece una página de referencia por cada adjunto que va dentro, «Anexo 1 de N», con título, archivo, páginas y miniatura, marcada «Se añadirá completo al exportar». Esas páginas no van al PDF descargado: ahí se añade el archivo real.
- **Correo:** la lista de archivos muestra el PDF con «incluye N adjuntos» y, aparte, los marcados para el correo.

## Visor de la propuesta: pestaña «Costos»

- La pestaña nueva **«Costos»** muestra la misma tabla interna de costos e ingresos del simulador: productos, precios unitarios y totales e ITBIS en USD, RD$ o ambos, precio neto, total neto, venta, precio por kWp, margen y ganancia proyectada. Cambiar la moneda no modifica la propuesta.

## Cotizaciones emitidas que quedaban atascadas

- Con equipos en versiones distintas, una cotización emitida podía rechazarse siempre al aceptarla, anularla o reabrirla, sin forma de destrabarla desde la app. Ya no pasa. El servidor acepta el cambio de estado aunque venga de un equipo con una versión anterior.
- Si en algún equipo quedó una cotización pendiente por este motivo, basta con pulsar **«Reintentar»** en el aviso de sincronización. Funciona también desde equipos que aún no hayan actualizado.

## Despliegue

- **API primero:** redesplegar la API antes de publicar el escritorio. No hay migración nueva y el ensayo de restauración debe terminar en `[1..12]`. La API acepta el cambio de estado de una cotización bloqueada que solo difiere en campos que una versión anterior no conoce, y `GET /api/quotations` declara `localOnlyFieldsStored`.
- **`MIN_CLIENT_VERSION`:** no cambia, sigue en 2.9.0.
- **Visor web (Worker) y MCP remoto:** solo cambia el número de versión; redesplegarlos es opcional.
- **Rollback de la API:** después de volver atrás, reiniciar los clientes 2.10.2 abiertos, que recuerdan en memoria que la API guarda estos campos.
- **Cliente:** publicar el instalador 2.10.2 con el flujo habitual, después de la API.
