# Catálogo de equipos y adjuntos

El editor de equipos reúne especificaciones, ofertas de proveedores y adjuntos. ADMIN y EDITOR pueden modificar equipos; los roles de consulta conservan acceso de lectura. Se mantiene la sincronización existente del catálogo y su control de versiones. Guardar el editor actualiza el catálogo local; la confirmación remota depende del resultado de sincronización del store.

## Ofertas

Cada modelo admite varias ofertas con proveedor, SKU, moneda original, precio unitario, existencias y notas. Se pueden agregar proveedores escribiendo un nombre nuevo, editar ofertas existentes y desvincularlas. El precio interno siempre es USD. Para DOP se conserva el importe original y la conversión USD con una tasa introducida explícitamente; cambiar la tasa no reescribe ofertas antiguas hasta editar su importe. La eliminación de una oferta también retira su selección preferida si corresponde.

## Fichas e imágenes

Una ficha técnica por modelo y hasta seis imágenes usan referencias `datasheetAssetId` e `imageAssetIds` del equipo. Los archivos se almacenan en el servidor, dentro de la organización autenticada. La API recibe multipart en `POST /api/equipment-assets` y permite descargar con `GET /api/equipment-assets/:id`, con autorización por cabecera. No se ponen tokens en URLs. Se aceptan PDF, PNG, JPEG y WebP para fichas; imágenes aceptan PNG, JPEG y WebP. El límite es 8 MB por archivo. La API verifica las firmas del contenido.

La deduplicación usa organización, tipo de activo y SHA-256. Varios modelos pueden referenciar una misma ficha; reemplazarla en un equipo no modifica las referencias de los otros modelos. Desvincular un adjunto no borra el archivo del servidor: puede seguir siendo utilizado por otro modelo. Un archivo subido cuyo editor se cancela puede permanecer sin referencias; no hay purga automática de estos activos en este alcance.

Al confirmar un escaneo IA autenticado se sube una sola copia del original antes de modificar el inventario y todas las variantes seleccionadas reciben la misma referencia. Si la subida falla, el borrador queda abierto y no se indica éxito. Cambiar sesión o espacio descarta las respuestas pendientes. Sin sesión puede guardarse el catálogo local, con aviso explícito de que la ficha no se adjuntó al servidor.

Las imágenes muestran una miniatura obtenida con autenticación y un enlace de descarga. Los adjuntos necesitan conexión y sesión; no existe caché durable offline de sus bytes. El catálogo conserva nombres y referencias para volver a obtenerlos al reconectar.

## Verificación

`src/tests/testEquipmentAssets.ts` verifica formatos/tamaño, multipart, propagación de fallos y descarga autenticada con fetch simulado. Las pruebas de backend cubren autorización y deduplicación; ninguna prueba usa producción. El recorrido visual debe revisar alta/edición de ofertas, ficha compartida por variantes, imágenes, cambio de sesión durante subida y lector sin controles de mutación.

## Administración por proveedor

En Ajustes → Catálogo y proveedores → Proveedores, el directorio selecciona el proveedor y su tabla permite buscar por equipo, marca o SKU y filtrar tipo, marca y disponibilidad. El modo claro y el oscuro tienen superficies, campos y texto equivalentes; en paneles estrechos el directorio se sitúa sobre las ofertas.

La disponibilidad se edita directamente en cada fila. Las casillas seleccionan ofertas de ese proveedor; la casilla de cabecera selecciona solo las filas visibles y editables. La barra de selección aplica en una operación local el estado elegido: En stock, Bajo pedido, Agotado o Consultar. Cambiar proveedor o filtros limpia la selección; las ofertas ocultas, otros proveedores y las propuestas existentes no se modifican.

Los precios unitarios USD se editan en la fila y requieren guardar con la marca de verificación; la X descarta el borrador. El desplegable de detalles permite editar SKU y notas con el mismo guardado. Cambiar solo disponibilidad conserva precio, moneda y procedencia DOP; editar explícitamente el precio USD sustituye el importe original en DOP. Si la oferta cambia externamente durante la edición, se pide descartar y revisar el borrador antes de sobrescribir. Un cambio de disponibilidad de la propia fila conserva su borrador de precio.

Los proveedores se registran con su primera oferta. Se mantienen alta de ofertas, renombrado y eliminación con confirmación; retirar ofertas no elimina equipos ni reescribe propuestas. Las cuentas de consulta tienen controles de escritura deshabilitados y el store revalida permisos. La selección y los formularios se reinician al cambiar sesión o espacio. Los mensajes distinguen guardado local de confirmación remota; se conserva la cola durable y el CAS del catálogo existente.

`testSupplierOfferUpdates.ts` verifica selección parcial, conservación de ofertas ajenas, precios y metadatos DOP, entradas inválidas, permisos de lectura y persistencia de cambios con su versión base. El fixture `equipmentCatalog.html?suppliers` incorpora varios proveedores con datos sintéticos; `theme=dark`, `narrow` y `reader` permiten revisar temas, panel estrecho y permisos sin acceder a producción.
