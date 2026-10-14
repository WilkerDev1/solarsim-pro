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
