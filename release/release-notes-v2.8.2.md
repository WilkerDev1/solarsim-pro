# SolarSim Pro 2.8.2

Parche de cálculo y sincronización. Corrige cómo se valora el excedente en el régimen SIE-007-2026, los cambios de tarifa hechos desde el asistente, la presentación del retorno cuando un sistema no recupera la inversión y la sincronización de propuestas con conexiones lentas. Los logos se guardan una sola vez por organización. La API trae la migración 009; `MIN_CLIENT_VERSION` sigue en 2.8.0.

## Medición neta y retorno

- **SIE-007 con precio tecleado, de factura o con la fila de otra tarifa.** La propuesta se factura a precio único con el mismo neteo kWh contra kWh, arrastre del crédito, cargo por uso de la red y liquidación anual del remanente que la facturación por bloques. Antes el excedente se pagaba al precio de venta: una propuesta sobredimensionada podía mostrar el mismo retorno que en el régimen anterior.
- **El régimen anterior no cambia.** Las propuestas en «Retención % (anterior)» dan exactamente las mismas cifras.
- **Cambio de tarifa o distribuidora desde el asistente o los agentes.** Si el precio era el de referencia, la propuesta toma el precio y la fila de bloques de la tarifa nueva, como ya hacía el panel de parámetros. Si el precio se tecleó o salió de una factura, se conserva y se suelta la fila de la tarifa anterior. Antes una copia que pasaba de BTS-2 a BTS-1 se quedaba con la fila y el precio de BTS-2. Las propuestas guardadas así se corrigen al volver a elegir la tarifa o con «Aplicar tarifa oficial».
- **Sistemas que no recuperan la inversión.** El payback muestra «No se recupera» y la TIR «No aplica» en la app, el PDF (resumen ejecutivo, retorno y flujo de caja) y el visor web, en lugar de «25 años» y una TIR sin sentido. La TIR se calcula ahora desde 0 % hacia afuera, de modo que un flujo final negativo (por ejemplo, el reemplazo de baterías) ya no la anula.
- **Factura real EDESUR con medición neta.** Confirma que los bloques se cobran sobre el consumo neto (retirado menos inyectado) y que el cargo por uso de la red es 25 % de la tarifa de referencia sobre toda la energía inyectada. Esos dos puntos dejan de figurar como supuestos sin verificar. Siguen como estimación el precio de liquidación del crédito sobrante (0 de fábrica) y qué consumo decide el rango del cargo fijo.
- **Liquidación anual.** El campo del panel aparece siempre que hay facturación neta, también con precio único.

## Sincronización

- **Descarga incremental de propuestas.** El escritorio solo descarga lo que cambió desde la última sincronización; «Sincronizar ahora» en Ajustes hace una descarga completa.
- **Los cambios se suben aunque falle la descarga.** Antes, si la descarga superaba el tiempo de espera (conexiones lentas), ningún cambio local llegaba al servidor.
- **Tiempo de espera por inactividad.** La descarga se corta tras 30 s sin recibir datos, no tras 12 s totales.
- **Logos y miniaturas guardados una sola vez.** Los logos del documento y las miniaturas de anexos ocupaban casi toda la descarga (unos 11 de 12 MB), copiados en cada propuesta. Ahora la API los guarda una vez por organización y las propuestas los referencian. El escritorio 2.8.2 descarga cada imagen una sola vez por sesión, verifica su huella y la convierte en imagen antes de usarla, así que el PDF, la publicación web y los enlaces publicados no cambian. Una propuesta con un logo distinto conserva el suyo, y cambiar el logo de la empresa no altera propuestas existentes.
- **Compatibilidad.** Los escritorios 2.8.1 y los agentes MCP siguen recibiendo las imágenes en línea; solo el 2.8.2 pide referencias. El escritorio 2.8.2 también funciona con la API anterior.

## Despliegue

- **Visor web (Worker): ya desplegado** desde beta 62e0822, versión 2b172178 (rollback: 8944301b). Acepta las marcas de «No se recupera» del resumen publicado; un visor 2.8.1 rechazaría con error 400 la publicación de una propuesta que no recupera la inversión. Los logos deduplicados no lo cambian: se publica desde el documento ya convertido en imágenes.
- **API: despliegue necesario.** Aplica la migración 009 `document_assets` al arrancar, dentro de la transacción de migraciones, con relleno de todos los proyectos (incluida la papelera) sin cambiar su versión ni su fecha. Antes: checkpoint de la base y ensayo de restauración, que debe terminar con las migraciones `[1..9]` y la misma huella.
  - **Rollback de la API:** restaurar el checkpoint en una base nueva. **Nunca** desplegar una imagen de la API anterior a la 009 sobre la base ya migrada: serviría las referencias tal cual y los logos saldrían rotos.
- **Cliente.** Publicar el instalador 2.8.2 (Windows y Linux) con el flujo habitual, después del visor. Puede ir antes o después de la API.
- **MCP remoto.** Solo cambia el número de versión.
