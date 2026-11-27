# SolarSim Pro 2.10.0

Versión de cotizaciones. SolarSim incorpora un módulo de **cotizaciones**: documentos comerciales simples (ítems, descuentos, ITBIS y total) con número propio, que reutilizan el directorio de clientes, el catálogo de equipos y las propuestas. No es una factura fiscal: no emite NCF ni e-CF.

## Cotizaciones

- **Catálogo.** Botón «Cotizaciones» en la barra lateral. Vistas por estado (borrador, emitida, aceptada, vencida, rechazada, anulada), carpetas, indicadores en RD$, búsqueda y filtro por moneda. La lista lleva el número resaltado y el estado al final de cada fila; el detalle de la derecha se desplaza por dentro y ofrece editar, duplicar y cambiar de estado.
- **Número.** `COT-AAAA-NNNN`, único por organización y año, lo asigna la API al publicar por primera vez. Sin sesión, la numeración es local.
- **Editor con vista previa en vivo.** Datos del documento, emisor, cliente y propuesta de origen, ítems, descuentos globales y notas. Los ítems son una tabla de una fila por línea con totales al pie; «…» abre unidad, descuento y acciones. Se añaden ítems libres, líneas descriptivas (no suman) y equipos del catálogo con el precio de su oferta y el margen, o con el precio genérico si no hay oferta.
- **Moneda.** RD$ o US$ con la tasa del documento; cambiar de moneda convierte los importes tras confirmarlo. El ITBIS se calcula sobre la base gravada después de los descuentos.
- **Hoja A4 y PDF.** Tres disposiciones (Clásica, Banda, Minimal), color de acento y tipografía de títulos. Firma de quien cotiza y sello de la empresa; sin sello importado, la hoja dibuja uno con el RNC, el logo y el teléfono del emisor.
- **Plantillas, firmas y sellos.** Gestor propio: plantillas con diseño, notas, forma de pago y vigencia (la predeterminada se aplica a las cotizaciones nuevas); firmas y sellos importados una vez y reutilizables, o el sello del membrete. Al emitir, la cotización guarda una copia fija de la firma y el sello que imprime: cambiar la biblioteca después no altera una emitida.
- **Adjuntos.** PDF o imágenes que se añaden al final del PDF exportado («Incluir en el PDF») o quedan solo enlazados («Solo relacionado»), y fichas técnicas del catálogo. Un adjunto dañado o protegido se omite con aviso.
- **Desde una propuesta.** «Nueva cotización → Desde una propuesta» o «Crear cotización» en el resumen de la propuesta. Se eligen los bloques que pasan (cliente, equipos y materiales, documentos, moneda y tasa, condiciones y vigencia). La propuesta no se modifica y el borrador queda enlazado. Los importes salen del motor de la propuesta; si hay descuentos y líneas con ITBIS a la vez, el total de la cotización queda por debajo del de la propuesta (la propuesta cobra el ITBIS antes del descuento) y el diálogo muestra la diferencia exacta antes de crear el borrador.
- **Cotizaciones enlazadas.** El resumen de una propuesta y el panel de un cliente listan sus cotizaciones.
- **Vista previa de correo.** Conmutador «PDF | Correo»: asunto y mensaje generados desde la cotización, editables para ese envío, con «Copiar mensaje» y «Abrir en la aplicación de correo». SolarSim no envía correos ni adjunta archivos: el PDF se descarga y se adjunta a mano.
- **Permisos y función.** Un LECTOR ve todo en solo lectura. Un administrador puede apagar Cotizaciones para su organización desde la política de funciones.

## Seguridad

- El canal que abre enlaces externos en el escritorio pasa a una lista blanca estricta: `http(s)` con host, y `mailto:` con una sola dirección válida y solo asunto y cuerpo.
- La subida de archivos sueltos (logos, firmas, sellos, adjuntos) comprueba el tipo real por su contenido (PDF, PNG, JPEG, WebP), limita el tamaño y queda aislada por organización.

## Despliegue

- **API primero, antes de publicar el escritorio:** migraciones 011 (`quotations`, `quotation_counters`) y 012 (`quotation_templates`, `quotation_signatures`), ambas aditivas, con checkpoint y ensayo de restauración que debe terminar en `[1..12]`. Rutas nuevas sin migración: `POST /api/document-assets` y `GET /api/document-assets/:sha256/file`. Un cliente 2.10.0 contra la API anterior no sincroniza cotizaciones.
- **Rollback de la API:** la API anterior reemplaza la política de funciones entera al guardar y solo conoce dos claves. Antes de volver atrás, anotar las organizaciones con Cotizaciones apagada y no guardar la política mientras dure el rollback; al volver, comprobar y restaurar.
- **`MIN_CLIENT_VERSION`** no cambia y sigue en 2.9.0.
- **Visor web (Worker)** y **MCP remoto:** solo cambia el número de versión; redesplegarlos es opcional.
- **Cliente:** publicar el instalador 2.10.0 con el flujo habitual, después de la API.
- **Pendiente conocido:** `document_assets` no tiene cuota ni limpieza de archivos que ya nadie usa; vigilar su tamaño tras el release.
