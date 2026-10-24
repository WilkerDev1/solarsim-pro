# Catálogo de equipos y adjuntos

El editor de equipos reúne especificaciones, ofertas de proveedores y adjuntos. ADMIN y EDITOR pueden modificar equipos; los roles de consulta conservan acceso de lectura. Se mantiene la sincronización existente del catálogo y su control de versiones. Guardar el editor actualiza el catálogo local; la confirmación remota depende del resultado de sincronización del store.

## Ofertas

Cada modelo admite varias ofertas con proveedor, SKU, moneda original, precio unitario, existencias y notas. Se pueden agregar proveedores escribiendo un nombre nuevo, editar ofertas existentes y desvincularlas. El precio interno siempre es USD. Para DOP se conserva el importe original y la conversión USD con una tasa introducida explícitamente; cambiar la tasa no reescribe ofertas antiguas hasta editar su importe. La eliminación de una oferta también retira su selección preferida si corresponde.

## Fichas e imágenes

Una ficha técnica por modelo y hasta seis imágenes usan referencias `datasheetAssetId` e `imageAssetIds` del equipo. Los archivos se almacenan en el servidor, dentro de la organización autenticada. La API recibe multipart en `POST /api/equipment-assets` y permite descargar con `GET /api/equipment-assets/:id`, con autorización por cabecera. No se ponen tokens en URLs. Se aceptan PDF, PNG, JPEG y WebP para fichas; imágenes aceptan PNG, JPEG y WebP. El límite es 8 MB por archivo. La API verifica las firmas del contenido.

La deduplicación usa organización, tipo de activo y SHA-256. Varios modelos pueden referenciar una misma ficha; reemplazarla en un equipo no modifica las referencias de los otros modelos. Desvincular un adjunto no borra el archivo del servidor: puede seguir siendo utilizado por otro modelo. Un archivo subido cuyo editor se cancela puede permanecer sin referencias; no hay purga automática de estos activos en este alcance.

Al confirmar un escaneo IA autenticado se sube una sola copia del original antes de modificar el inventario y todas las variantes seleccionadas reciben la misma referencia. Si la subida falla, el borrador queda abierto y no se indica éxito. Cambiar sesión o espacio descarta las respuestas pendientes. Sin sesión puede guardarse el catálogo local, con aviso explícito de que la ficha no se adjuntó al servidor.

Los archivos se descargan con autenticación y quedan en la caché de vistas previas (siguiente sección); el catálogo conserva nombres y referencias para volver a obtenerlos al reconectar. Una ficha se nombra siempre `Ficha técnica - {modelo}.pdf` (`datasheetFileName` en `src/utils/proposalDatasheets.ts`): el servidor deduplica archivos idénticos y conserva el nombre de la primera subida (p. ej. `5f3b762bf4e99b1.pdf`), que no se muestra. Un escaneo IA de una foto (JPEG, PNG o WebP) se sube como `image` y se añade a las imágenes del equipo (máximo seis; con la galería llena se informa y la foto sigue pendiente); nunca se convierte en ficha.

## Vistas previas

- **Qué se muestra.** `EquipmentPreviewThumb` (40 px) aparece en la celda «Equipo / modelo» del catálogo, en las filas de ofertas por proveedor y en las opciones del selector de equipos del simulador: la primera imagen del equipo, si no la primera página de su ficha PDF y, si no hay archivos, el icono del tipo. Con archivos, un clic abre `EquipmentPreviewDialog`: galería de imágenes, hasta ocho páginas de la ficha y descarga. Solo se leen activos del servidor; un `datasheetUrl` externo nunca se descarga para una miniatura.
- **Caché.** `src/services/equipmentPreviewCache.ts` guarda los bytes en IndexedDB `solarsim_equipment_previews` con clave `espacio|activo|variante`, donde el espacio es servidor + organización, así que nada cruza cuentas. Los ids de activos son por contenido: no caducan y solo se podan por uso (LRU en memoria y por bytes en disco, con hora de acceso actualizada también en aciertos de memoria). Hay una sola petición en vuelo por clave, descargas con límite de 15 s y una caché negativa de 30 s para fallos reales; la falta de sesión y las cancelaciones no se recuerdan como fallo. Sin conexión siguen viéndose las vistas previas ya descargadas.
- **Seguridad.** El tipo se decide por los bytes (PDF, PNG, JPEG, WebP), no por `Content-Type`; SVG, HTML y cualquier otro formato se rechazan.

## Fichas anexadas automáticamente

Cada equipo de la propuesta con cantidad mayor que cero cuyo modelo del catálogo tiene una ficha PDF del servidor genera un anexo `origin: 'catalog'`: activado, fuera del índice y titulado «Ficha técnica — {modelo}». El modelo se resuelve con `resolveGroupCatalogItem` (`catalogItemId` del grupo → id de catálogo en `group.id` → nombre exacto único; un nombre ambiguo no se adivina). Las variantes que comparten un archivo dan un solo anexo. Elegir un equipo en el simulador, aplicar un precio de proveedor o importarlo con IA guarda `catalogItemId` en el grupo (`selectCatalogEquipment`).

`ProposalAnnexSync` aplica la política (`src/utils/proposalAnnexes.ts`) al abrir la vista PDF y al cambiar equipos o catálogo; no actúa con lectores, propuestas en papelera ni conflictos. Retirar un anexo automático lo descarta (`dismissedDatasheetKeys`) y «Restaurar fichas» lo recupera; los anexos de equipos que ya no están se retiran y los manuales no se tocan. Los anexos de un modelo cuyo archivo es una imagen o un enlace externo siguen siendo manuales.

Al exportar, los bytes de cada anexo se buscan en el almacén local de anexos, luego en la caché de vistas previas y por último en el servidor (`src/services/proposalAttachmentResolver.ts`); lo recuperado se guarda para la siguiente exportación. Si falta algún anexo activado, la exportación pide confirmación («Exportar sin N anexos») en lugar de omitirlo en silencio. La propuesta ya no guarda `thumbnailDataUrl`; la miniatura de cada anexo sale de la caché.

## Cambios del catálogo y propuestas abiertas

Abrir o ver una propuesta nunca la modifica ([ADR 0004](adr/0004-edicion-de-proyecto.md)). Si el catálogo cambió (la potencia de un modelo, o un proveedor que ya no cotiza el equipo del grupo principal), la propuesta se corrige en la **siguiente edición real**: `applyProjectEdit` (`src/domain/projectEdit.ts`) reconcilia el panel o inversor principal con su potencia en el catálogo (por nombre exacto) y suelta el proveedor huérfano del grupo principal (`supplierQuotesItem`: id de oferta o nombre normalizado). Con el catálogo sin cargar no se reconcilia ni se suelta ningún proveedor. Un precio de proveedor aplicado (`applySupplierPriceToProject`) es una edición más: se normaliza, recalcula los paneles si el autocálculo está activo y la potencia del modelo cambió, se sincroniza y se puede deshacer. Los antiguos efectos `useCatalogPowerSync` y `useSupplierCleanup` ya no existen.

## Verificación

`src/tests/testEquipmentAssets.ts` verifica formatos/tamaño, multipart, propagación de fallos y descarga autenticada con fetch simulado. `testEquipmentPreviewCache`, `testCatalogEquipmentTable`, `testEquipmentGroups`, `testProposalDatasheets`, `testAIProposalCatalogIdentity`, `testDatasheetOfflineSave` y `testProposalAnnexes` cubren la caché, la tabla, la identidad de catálogo, los nombres de ficha y la política de anexos. `testProjectEdit` (reconciliación con el catálogo, proveedor huérfano, precio de proveedor deshacible, abrir sin escribir) y `testNoProjectEditRulesOutsideModule` fijan la sección anterior. Las pruebas de backend cubren autorización y deduplicación; ninguna prueba usa producción. El recorrido visual debe revisar alta/edición de ofertas, ficha compartida por variantes, imágenes, cambio de sesión durante subida y lector sin controles de mutación.

## Administración por proveedor

En Ajustes → Catálogo y proveedores → Proveedores, el directorio selecciona el proveedor y su tabla permite buscar por equipo, marca o SKU y filtrar tipo, marca y disponibilidad. El modo claro y el oscuro tienen superficies, campos y texto equivalentes; en paneles estrechos el directorio se sitúa sobre las ofertas.

La disponibilidad se edita directamente en cada fila. Las casillas seleccionan ofertas de ese proveedor; la casilla de cabecera selecciona solo las filas visibles y editables. La barra de selección aplica en una operación local el estado elegido: En stock, Bajo pedido, Agotado o Consultar. Cambiar proveedor o filtros limpia la selección; las ofertas ocultas, otros proveedores y las propuestas existentes no se modifican.

Los precios unitarios USD se editan en la fila y requieren guardar con la marca de verificación; la X descarta el borrador. El desplegable de detalles permite editar SKU y notas con el mismo guardado. Cambiar solo disponibilidad conserva precio, moneda y procedencia DOP; editar explícitamente el precio USD sustituye el importe original en DOP. Si la oferta cambia externamente durante la edición, se pide descartar y revisar el borrador antes de sobrescribir. Un cambio de disponibilidad de la propia fila conserva su borrador de precio.

Los proveedores se registran con su primera oferta. Se mantienen alta de ofertas, renombrado y eliminación con confirmación; retirar ofertas no elimina equipos ni reescribe propuestas. Las cuentas de consulta tienen controles de escritura deshabilitados y el store revalida permisos. La selección y los formularios se reinician al cambiar sesión o espacio. Los mensajes distinguen guardado local de confirmación remota; se conserva la cola durable y el CAS del catálogo existente.

`testSupplierOfferUpdates.ts` verifica selección parcial, conservación de ofertas ajenas, precios y metadatos DOP, entradas inválidas, permisos de lectura y persistencia de cambios con su versión base. El fixture `equipmentCatalog.html?suppliers` incorpora varios proveedores con datos sintéticos; `theme=dark`, `narrow` y `reader` permiten revisar temas, panel estrecho y permisos sin acceder a producción.
