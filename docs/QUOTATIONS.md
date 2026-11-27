# Cotizaciones

Documento comercial simple (líneas, descuentos, ITBIS y total). **No es una factura fiscal ni una propuesta**: es una entidad propia, distinta de `ProjectSimulation` ([ADR 0007](adr/0007-cotizaciones-entidad-propia.md)). Este documento describe el contrato del dominio puro compartido en `shared/quotations/` y, en «Store y sincronización», el almacén del cliente. La API (rutas, numeración, CAS, borrado lógico y desenlaces en cascada) está en [DATABASE_AND_API_SPECIFICATION.md](DATABASE_AND_API_SPECIFICATION.md#cotizaciones-migración-011); «Catálogo» describe la vista que lista las cotizaciones (el editor llega en otra fase).

Reglas del módulo: TypeScript puro (sin `src/`, `server/`, `electron/`, Node ni terceros), imports relativos con extensión `.js`, sin relojes ni generación de ids (la fecha y `newId` entran como argumento), importes en **centavos enteros** y la tasa de ITBIS solo desde `ITBIS_RATE` (`shared/financialRules.ts`). Lo verifica `testQuotationSharedPurity`.

## Tipos (`types.ts`)

| Tipo | Contenido |
| --- | --- |
| `QuotationContent` | Lo editable y validado: `status`, `issueDate`, `validUntil` (`YYYY-MM-DD` o `null`), `currency` (`DOP`/`USD`), `exchangeRate` (DOP por 1 USD, entre 1 y 10 000), `clientId?`, `client` (datos impresos), `sourceProjectId?`, `folderId?`, `seller`, `projectLabel`, `items`, `discounts`, `notes`, `paymentTerms`, `design`, `attachments`, `issuer`. |
| `Quotation` | `QuotationContent` + `id`, `number` (`null` hasta que lo asigne la API), `version`, `baseVersion`, `createdById`, `createdBy`, `createdAt`, `updatedAt`. |
| `QuotationLine` | `kind` `item` (con precio) o `detail` (fila descriptiva: descripción y cantidad, precio 0, aporta 0 al total), `quantity` (hasta 3 decimales), `unit`, `unitPriceCents`, `discountPct` (0–100, 2 decimales), `taxable`, `catalogItemId?`. |
| `QuotationDiscount` | Global: `fixed` (centavos) o `percentage` (0–100 con 2 decimales, sobre el subtotal). |
| `QuotationAttachment` | `mode` `include` (se fusiona al PDF) o `related` (solo enlazado); `origin` `manual`/`catalog`/`proposal`; `assetId?`, `thumbnailDataUrl?` (ver imágenes en Validación). |
| `QuotationDesign`, `QuotationIssuer`, `QuotationPrintedClient` | Presentación del PDF, datos del emisor (logo como data URL de imagen o `asset:sha256:`) y del cliente tal como se imprimen. `QuotationDesign` lleva además, opcionales, las copias fijas de lo que se imprime: `signature` (`QuotationPrintedSignature`: `name`, `role`, `image`) y `stampImage` (ver «Firma y sello impresos»). |

`DEFAULT_QUOTATION_DESIGN` (`clasica`, `#087b58`, `sans`, firma y sello visibles) y `emptyQuotationContent(today, overrides?)` (borrador en DOP; la tasa sale de `overrides` o de `DEFAULT_DOP_RATE`) están en el mismo archivo.

## Dinero (`money.ts`)

- `toCents(amount)`: redondeo half-up robusto frente a la coma flotante (`39.2` → 3920, `1.005` → 101). `fromCents`.
- `mulDivRound(a, b, c)` (interno de los totales): `round(a × b / c)` half-up, exacto para enteros; usa `number` cuando todo cabe en enteros seguros y BigInt cuando no (nunca la división en coma flotante).
- `formatMoney(cents, currency)` → `RD$ 35,966.40`, `US$ 18,450.00`, negativos `-RD$ 10.00`; `formatAmount(cents)` → `35,966.40`. Implementación propia, independiente del idioma del sistema.
- `convertCents(cents, from, to, exchangeRate)`: DOP↔USD con half-up; misma moneda devuelve igual.

## Totales (`totals.ts`)

`computeQuotationTotals({ items, discounts })` es pura, no muta y **nunca lanza ni devuelve `NaN`/`Infinity`, con cualquier entrada** (también sin validar: tipos erróneos, `NaN`, `Infinity`, `1e308`, miles de líneas). Acota sus entradas a los topes de `QUOTATION_LIMITS`: lo que no sea un número finito y los negativos valen 0; la cantidad, el precio unitario y cada descuento fijo se limitan a `maxQuantity`, `maxUnitPriceCents` y `maxDocumentCents`; los porcentajes a 0–100; y el bruto acumulado del documento a `maxDocumentCents` (la línea que lo excede se recorta a lo que queda, en orden de línea). Un id que no sea texto sale como `''`. El contenido validado ya cumple todos los topes, así que para él el acotado no cambia nada.

Con esos topes todo el algoritmo es aritmética entera exacta: el bruto del documento es ≤ 1e12 centavos y la base gravada × los puntos básicos del ITBIS (≤ 1e12 × 1800) queda por debajo de 2^53.

1. Solo cuentan las líneas `item`; las `detail` salen con todo en 0.
2. `grossCents = round(cantidad × unitPriceCents)`; `lineDiscountCents = round(grossCents × discountPct / 100)`; `netCents = grossCents − lineDiscountCents`. Redondeo half-up en aritmética entera (cantidad en milésimas, porcentaje en centésimas).
3. `subtotalCents = Σ netCents`.
4. Descuentos globales: cada `percentage` se calcula sobre `subtotalCents` (no en cascada) y cada `fixed` vale su `value`. Se aplican en orden y cada uno se acota a lo que aún queda por descontar, así `Σ appliedCents = discountCents = min(subtotalCents, Σ)`.
5. `discountCents` se prorratea entre las líneas en proporción a `netCents` con el método del mayor resto: la suma asignada es exactamente `discountCents` y los empates se resuelven por orden de línea.
6. `taxableBaseCents = Σ (netCents − asignado)` de las líneas `taxable`; `exemptBaseCents` es el resto. `taxCents = round(taxableBaseCents × ITBIS_RATE)`: el ITBIS se calcula sobre la base gravada del documento, no línea a línea.
7. `totalCents = subtotalCents − discountCents + taxCents`.

Resultado: `{ lines: [{ id, grossCents, lineDiscountCents, netCents, allocatedDiscountCents, taxableBaseCents }], subtotalCents, discounts: [{ id, appliedCents }], discountCents, taxableBaseCents, exemptBaseCents, taxCents, totalCents }`.

Caso de referencia (plantilla de Electsun, seis líneas gravadas en DOP): subtotal 30,480.00, ITBIS 5,486.40, total 35,966.40.

## Estados (`status.ts`)

Estados guardados: `draft` Borrador, `issued` Emitida, `accepted` Aceptada, `rejected` Rechazada, `void` Anulada (`QUOTATION_STATUS_LABELS`, que incluye `expired` «Vencida»).

Transiciones permitidas (`canTransitionQuotation`; cualquier otra, incluida la de un estado a sí mismo, es falsa):

| Desde | Hacia |
| --- | --- |
| `draft` | `issued`, `void` |
| `issued` | `accepted`, `rejected`, `void`, `draft` (reabrir) |
| `accepted` | `void` |
| `rejected` | `draft` |
| `void` | (ninguno) |

`isQuotationContentLocked(status)` es verdadero salvo en `draft`. **«Vencida» es derivada, no se guarda:** `effectiveQuotationStatus(q, today)` devuelve `expired` solo si `q.status === 'issued'` y `validUntil` es anterior a `today` (el mismo día aún es válida); la comparación es de cadenas ISO, sin `Date`.

## Numeración (`numbering.ts`)

Formato `COT-AAAA-NNNN` (`QUOTATION_NUMBER_PREFIX = 'COT'`): secuencia con relleno a 4 dígitos, sin truncar pasado 9999 (`COT-2026-12345`). `formatQuotationNumber(year, sequence)` lanza `RangeError` ante un año o secuencia inválidos; `parseQuotationNumber(text)` es estricto (solo acepta lo que el formateador produce) y devuelve `null` en otro caso; `quotationNumberYear(issueDate)` da el año de la fecha de emisión. El número lo asigna la API al crear la cotización ([API](DATABASE_AND_API_SPECIFICATION.md#cotizaciones-migración-011)); hasta entonces `Quotation.number` es `null` (en el espacio local sin cuenta lo asigna el store, ver Numeración).

## Validación (`validation.ts`)

`validateQuotationContent(data: unknown)` devuelve `{ ok: true, value } | { ok: false, error }` (mensajes en español) y no lanza. Normaliza: recorta cadenas, convierte ausentes en `''`, redondea importes a centavos enteros y cantidades a 3 decimales, pone precio y descuento en 0 (y `taxable` en `false`) en las líneas `detail`, pasa el color de acento a minúsculas y descarta toda clave que no sea del contrato. Es idempotente.

Los porcentajes (`discountPct` de la línea y `value` de los descuentos `percentage`) se redondean a 2 decimales half-up (`12.345` → `12.35`): lo guardado es exactamente lo que usan los totales.

Rechaza:

- estado, moneda, disposición o tipografía desconocidos; `accent` que no sea `#rrggbb`;
- fechas que no sean `YYYY-MM-DD` reales, o con año fuera de 2000–2199 (`issueDate` y `validUntil`; así toda fecha de emisión aceptada produce un número `COT-AAAA-…`); `validUntil` anterior a `issueDate`;
- `exchangeRate` ausente, no finito, menor que 1 o mayor que 10 000 (DOP por USD);
- cantidades o precios negativos o no finitos; porcentajes fuera de 0–100;
- importes sobre los topes: `unitPriceCents` > `maxUnitPriceCents` (1e11), descuento fijo > `maxDocumentCents` (1e12) y un documento cuya suma de brutos de línea `item` (cantidad × precio redondeado por línea, antes de descuentos; calculada en BigInt) supere `maxDocumentCents`;
- imágenes que no sean `''`/ausente, una referencia `asset:sha256:<64 hex>` (`isAssetRef`) o un data URL `data:image/png|jpeg|webp;base64,…`: el logo del emisor hasta `logoDataUrl` (500 000 caracteres) y la miniatura de un anexo hasta `thumbnailDataUrl` (100 000); un `assetId` de anexo con caracteres fuera de `[A-Za-z0-9:_-]` o de más de 128;
- ids de línea, descuento o anexo vacíos o duplicados;
- exceder los demás `QUOTATION_LIMITS` (id 64, descripción de línea 500, unidad 16, notas 4000, condiciones de pago 2000, etiquetas 255, 200 líneas, 20 descuentos, 40 anexos…).

En `issued` y `accepted` el nombre del cliente y al menos una línea `item` son obligatorios; `draft`, `rejected` y `void` pueden quedar sin ellos (por ejemplo, anular un borrador vacío).

## Conversión desde propuesta (`fromProposal.ts`)

La propuesta no tiene precio unitario por equipo, así que `quotationFromProposal(source, { today, design?, newId })` recibe un `ProposalQuotationSource` con los importes ya calculados por quien llama (se armará dentro de `src/`, donde vive el motor). Devuelve `{ ok: true; value: QuotationContent } | { ok: false; error: string }` (el mismo tipo que `validateQuotationContent`).

El contenido es un `draft` con `sourceProjectId`; primero las `pricedLines` como `item`, después las `detailLines` como `detail`; todos los anexos con `mode: 'related'`, `origin: 'proposal'` y `sourceProjectId`; ids de línea y de descuento de `newId()`. Si `source.validUntil` es anterior a `today`, la vigencia queda en `null`. El contenido se pasa por `validateQuotationContent` y se devuelve su resultado: con `ok` el valor ya está normalizado (validarlo otra vez no lo cambia); con `!ok`, el motivo (importes fuera de tope, fecha fuera de rango…). Un `projectId` vacío devuelve `{ ok: false }`. No muta la entrada ni comparte referencias con ella.

## Store y sincronización

`src/store/slices/quotationSlice.ts` (tipos en `src/store/types.ts`, registro local `QuotationRecord` en `src/types/quotation.ts`) es una API pura, llamable fuera de React. No reimplementa reglas: valida con `validateQuotationContent`, decide estados con `canTransitionQuotation`/`isQuotationContentLocked` y numera con `formatQuotationNumber`. Permisos con `canWrite` (`shared/permissions.ts`): sin cuenta se puede todo; un LECTOR no escribe.

| Acción | Resultado y reglas |
| --- | --- |
| `createQuotationRecord(overrides?)` | `{ok, quotation}`. Borrador desde `emptyQuotationContent` con la fecha local de hoy (`src/utils/localDate.ts`), la tasa de cambio de las propuestas nuevas (`assumptionFields(undefined, defaultSimulationSettings).specs.dopExchangeRate`) y como vendedor el nombre de la cuenta o, sin cuenta, el del perfil local. El estado siempre es `draft`; id `quotation-<uuid>`. Rechaza un `clientId`/`folderId` inexistente. |
| `updateQuotationRecord(id, patch)` | Solo en `draft`; ignora `patch.status`. |
| `setQuotationStatus(id, status)` | Transición de `canTransitionQuotation`; el contenido debe validar con el estado nuevo (emitir exige cliente y una línea con precio). |
| `duplicateQuotationRecord(id)` | Borrador nuevo: id nuevo, número nuevo (local) o `null` (con sesión), fecha de hoy, `validUntil` solo si no ha vencido; no copia enlaces a clientes o carpetas que ya no existen. |
| `deleteQuotationRecord(id)` | `{ok}`. Encola el borrado con la versión confirmada y una copia de la cotización (para mostrarla otra vez si la API rechaza el borrado). |
| `linkQuotationToClient(id, clientId \| null)`, `moveQuotationToFolder(id, folderId \| null)` | `{ok}`. Enlaces opcionales que nunca reescriben `client` (datos impresos); rechazan destinos inexistentes. Como `clientId` y `folderId` son contenido y la API solo admite cambiar el estado de una cotización no borrador, exigen `draft` (salvo que el enlace ya sea el pedido). |
| `resolveQuotationConflict(id, 'accept_server' \| 'keep_local')` | Ver conflictos y borrados rechazados. Aceptar el servidor lo puede hacer el dueño del cambio aunque haya perdido el permiso de escritura; conservar lo local exige ese permiso. |
| `syncQuotationsWithServer()` | `{success, message}`. |

### Numeración

- **Espacio local (sin cuenta):** el número se asigna al crear (y al duplicar) con `quotationNumberCounters` (`año → última secuencia`, año de la fecha de emisión), que pertenece al espacio de trabajo. Nunca baja: borrar una cotización no libera su número, y la secuencia tampoco queda por debajo de un número ya en uso.
- **Con sesión (espacio de una organización):** `number` es `null` hasta el primer PUT; el número de la respuesta se guarda y ya no cambia (al aplicar una copia del servidor se conserva el número local si ya existe).

### Colas y descarga

- Las escrituras van a `quotationChanges[id]` (`revision`, `ownerId`, `baseVersion` y `base`: el contenido publicable confirmado en `baseVersion`; ausente en una creación) y los borrados a `quotationDeletionQueue`. `version`/`baseVersion` valen 0 hasta la primera confirmación.
- `GET /api/quotations` usa `?since=` con `quotationSyncCursor` (`{scope, serverTimestamp}`) si es del espacio activo; si no, descarga completa. Una descarga completa es la lista entera (lo que no está y no tiene cambios pendientes se quita); una parcial aplica solo lo cambiado y `deletedIds`. El cursor se guarda solo al final de una pasada que aplicó la descarga entera; si la sesión, el servidor o el espacio de trabajo cambian mientras tanto, la respuesta se descarta sin tocar nada. Cada cambio se examina con su estado actual en el store (no con una copia tomada al empezar la pasada), así que un conflicto resuelto mientras la pasada sigue no revive. Una cotización con cambio pendiente no se sobrescribe con la descarga, pero lo descargado no se pierde al avanzar el cursor: si no se publica en esa pasada (conflicto sin resolver, rechazo o cambio de otro miembro) y la copia del servidor es más nueva que la guardada, pasa a `serverQuotation` del cambio (y un id en `deletedIds` lo convierte en conflicto de borrado); si se publica, el CAS responde con la versión actual.
- Con la cotización emitida en el servidor, una secuencia local reabrir → editar → emitir se publica como varios PUT (`planQuotationPush`, `src/store/sync/quotationContent.ts`): primero reabrir con el contenido confirmado y después la edición (que desde `draft` puede emitir en el mismo PUT); un estado que no se alcanza en un paso pasa por `issued`. Si lo local vuelve a ser igual a lo confirmado (reabrir y emitir sin cambios) no se envía nada. Cada PUT confirmado se instala enseguida con su versión.
- Borradores nunca publicados (`baseVersion` 0 y ausentes del servidor) se eliminan sin petición. Un `DELETE` con 404 (el id nunca existió) o con 409 y `quotation: null` (ya borrada, con otra versión) se da por hecho: el comando sale de la cola.
- La API solo crea cotizaciones `draft` o `issued`. Una nunca publicada que se anuló sin conexión (`void`) se descarta sin petición, como un borrador nunca publicado; una aceptada o rechazada sin conexión se crea primero emitida y luego cambia de estado.
- Un fallo de transporte detiene la pasada sin guardar el cursor; los cambios siguen en cola.
- Si la API responde 404 a la lista (aún sin cotizaciones), la pasada solo falla si hay trabajo propio pendiente.

### Conflictos y rechazos

- **Recibo perdido:** si la copia del servidor es idéntica a la local (comparación del contenido publicable normalizado), se da por confirmada sin reenviar; si difiere y la local era una creación, queda como conflicto.
- **409 de versión:** `serverQuotation` se conserva (y se actualiza con cada copia más nueva que llegue en descargas posteriores) y la copia local no cambia hasta que el usuario elija. `accept_server` instala la última copia del servidor conocida; `keep_local` toma su versión como base y vuelve a publicar.
- **Borrada en el servidor** (`deletedIds` o 409 con `quotation: null`) con edición local pendiente: conflicto de borrado (`serverDeleted`), nunca se publica sobre ese id. `accept_server` descarta la copia; `keep_local` la convierte en un borrador nuevo con id nuevo, sin número y versión 0.
- **Borrado obsoleto** (409 al borrar, con un registro más nuevo): la cotización del servidor vuelve a la lista como conflicto de borrado pendiente (`serverQuotation` con `deletionConflict`). `accept_server` conserva la del servidor; `keep_local` vuelve a encolar el borrado con la versión del servidor. Editar la cotización mientras tanto significa quedarse con ella: el conflicto pasa a ser uno de versión normal y ninguna resolución la borra.
- **Borrado rechazado** (otro 4xx al borrar, p. ej. 403 tras perder el rol): el comando queda en la cola con `rejected = {status, error}`, no se reintenta solo y la cotización vuelve a verse en la lista con ese error. `keep_local` reintenta el borrado (la oculta de nuevo); `accept_server` lo descarta y conserva la cotización (la siguiente descarga es completa para traer su copia actual). Si mientras tanto llega su id en `deletedIds`, el comando sale de la cola.
- **409 `invalid_client` / `invalid_folder`:** el cliente o la carpeta enlazados ya no son válidos (borrados, de otra organización o, la carpeta, privada de otro usuario). Se quita solo `clientId` o `folderId` de la copia local y el cambio sigue pendiente para la siguiente pasada; no es un conflicto que resolver.
- **Otros 4xx** (`quotation_locked`, `invalid_transition`, `inline_image_not_allowed`, validación, 403): `rejected = {revision, status, code?, error}` queda como error visible de esa cotización y no se reintenta mientras la revisión sea la misma. Una edición nueva, o `keep_local`, la reintenta; `accept_server` descarta lo local: si nunca se publicó se elimina y, si no, la siguiente descarga es completa y trae la copia del servidor.
- `quotationSyncFeedback` resume las pendientes; `5xx` se reintenta en la siguiente pasada.

### Imágenes y adjuntos

Las imágenes y los adjuntos viajan como referencias `asset:sha256:` (sha256 del texto exacto del data URL, la misma regla de la migración 009). Antes de cada PUT, `publishQuotationAssets` (`src/store/sync/quotationAssets.ts`) calcula la referencia de cada imagen en línea (logo, miniaturas, firma y sello fijados) y sube a `POST /api/document-assets` (`DocumentAssetService`, transporte inyectable; lo subido se recuerda por espacio de trabajo) lo que la base confirmada aún no referencia, más los bytes de los adjuntos que este equipo guarda (`PDFAttachmentStorage`) cuya referencia (`assetId`) se calculó al agregarlos. Los adjuntos ya subidos se recuerdan por espacio de trabajo, id, tamaño y fecha de carga (también entre reinicios, en `localStorage`): no se rehashean en cada publicación. Cada imagen se sube con el tipo real de sus bytes (`normalizeDocumentDataUrl`, `shared/fileSignatures.ts`): un JPEG guardado como PNG funciona; lo que no es PNG, JPEG ni WebP no se intenta subir. Hay que distinguir dos fallos. **Un rechazo definitivo** (lo que no es una imagen admitida, 413, 415 y los demás 4xx salvo 401, 403, 408 y 429, `isPermanentUploadFailure`) no se reintenta ni bloquea: esa imagen se publica vacía y ese adjunto sin su `assetId`, y `quotationAssetIssues[id]` guarda un aviso que nombra la imagen o el adjunto y dice qué hacer (volver a importarla como PNG, JPEG o WebP válido; quitar o reemplazar el adjunto); lo que la base confirmada ya tiene no se toca. **Si algo nuevo no se pudo subir por la red, un 5xx o la sesión, la cotización no se publica en esa pasada** (`assetsPending` en su cambio; el editor dice «Adjunto pendiente de subir») y se reintenta en la siguiente: nunca viaja un hueco vacío que borraría una imagen del servidor ni una referencia que el servidor no tiene. Lo que la base confirmada ya referencia se envía tal cual sin subirlo. La API comprueba que cada referencia que gestiona exista en la organización (400 `unknown_document_asset` con `missing`); el cliente olvida esos hashes como subidos y lo reintenta en la pasada siguiente si este equipo tiene sus bytes; si no los tiene, queda como rechazo visible («quita el adjunto o súbelo desde el equipo que lo tiene») sin prometer reintento. Mientras base y destino están bloqueados, `planQuotationPush` conserva de la base el logo, las miniaturas y las imágenes de la firma y el sello fijados: una copia local sin su imagen (p. ej. tras hidratar) nunca reabre la cotización ni borra la firma del servidor. Al duplicar, los bytes de origen no se borran mientras se copian (`attachmentCopies.ts`). Un adjunto cuya clave no es `asset:sha256:` (una ficha de `equipment_assets` o lo que traiga un anexo de propuesta) no se sube ni se comprueba. La copia local conserva sus imágenes: al aplicar una respuesta o una descarga, un hueco vacío del servidor o con la referencia de la misma imagen recupera la imagen en línea local del mismo hueco (logo, o miniatura del anexo con el mismo id). La comparación de recibos usa la referencia. Mientras el estado confirmado y el destino estén bloqueados, una imagen subida después no cuenta como edición (`planQuotationPush` conserva las imágenes confirmadas): cambiar el estado de una emitida nunca la reabre por eso. Una referencia que no está en este equipo se resuelve al dibujar (`useAssetImage`: `GET /api/document-assets/:sha256`, con caché en memoria).

En la persistencia local (`src/store/persistence/persistedDocumentAssets.ts`) esas imágenes en línea se guardan una sola vez en la clave de activos, como las de las propuestas, en `quotations` y en las copias de `quotationDeletionQueue` (también en los espacios archivados). Se escriben con su propio prefijo `quotation-asset:sha256:` y las claves de cotizaciones quedan fuera de la expansión general de `asset:sha256:` al hidratar: en una cotización esa referencia es un dato del servidor y debe seguir siendo una referencia. Una entrada que falte en la clave de activos se lee como imagen vacía.

### Espacios de trabajo y enganches

- `quotations`, `quotationChanges`, `quotationDeletionQueue`, `quotationSyncCursor` y `quotationNumberCounters` forman parte del espacio de trabajo (`organizationWorkspace`): se guardan, se archivan y se restauran al cambiar de servidor u organización como los clientes (los archivos antiguos sin ellos empiezan vacíos). Las creadas sin cuenta **nunca se asignan automáticamente** a una organización al iniciar sesión.
- `syncProjectsWithServer` sincroniza las cotizaciones justo después de los clientes; su fallo no bloquea las propuestas y el mensaje final indica «cotizaciones pendientes».
- Los `deletedIds` de clientes o de carpetas no tocan las cotizaciones locales: la API ya las desenlazó en la misma transacción del borrado (sube su versión) y la descarga de cotizaciones, que en `syncProjectsWithServer` va justo después, trae esa revisión; así la copia local nunca queda distinta de su versión del servidor.
- Al borrar un cliente (solo cuando su desenlace es inmediato: modo local o cliente nunca publicado) o una carpeta en local, los datos impresos nunca cambian y:
  - en el **espacio local sin cuenta**, todas las cotizaciones enlazadas pierden `clientId`/`folderId` (no hay API que las desenlace);
  - **con sesión**, los **borradores** enlazados pierden el enlace y quedan como cambio pendiente para publicar el desenlace; las que no son borrador **no se modifican**: conservan el id (la API acepta ids desconocidos y, si el borrado llega a publicarse, las desenlaza ella misma), porque cambiar su contenido haría que todo cambio de estado posterior se rechazara con `quotation_locked`.
- El transporte (`src/services/quotationSyncService.ts`) es inyectable (`QuotationSyncService.setTransportFactory`) y envía `PUT {baseVersion, content}`; las pruebas no tocan la red.

## Plantillas, firmas y sellos

Recursos reutilizables del espacio de trabajo (contrato puro en `shared/quotations/library.ts`, API en [migración 012](DATABASE_AND_API_SPECIFICATION.md#plantillas-y-firmas-de-cotización-migración-012)).

| Tipo | Contenido |
| --- | --- |
| `QuotationTemplateContent` | `name` (1–120), `description` (≤ 255), `design` (el de la cotización sin `templateId`: disposición, acento, tipografía, `signatureId?`, `showSignature`, `showStamp`), `notes` y `paymentTerms` (topes de la cotización), `validityDays` (1–365 o `null`), `isDefault`. |
| `QuotationSignatureContent` | `kind` `signature` o `stamp`, `name` (1–120), `role` (cargo, ≤ 120), `image`, `isDefault`. |
| Registro | Contenido + `id`, `version`, `baseVersion`, `createdById`, `createdBy`, `createdAt`, `updatedAt` (`organizationId?`). |

- **Validación** (`validateQuotationTemplate`, `validateQuotationSignature`): normaliza y descarta claves desconocidas, nunca lanza. La imagen de una firma o un sello es una referencia `asset:sha256:` o un data URL PNG/JPEG/WebP **cuyo contenido real coincide con el tipo declarado** (`shared/fileSignatures.ts`, firma de bytes: un SVG o un HTML con `image/png` no pasa) de hasta 512 KB.
- **Predeterminadas** (`defaultQuotationTemplate`, `defaultQuotationSignature`): una plantilla, y una firma y un sello; si por sincronización hubiera varias marcadas, gana la más reciente (a igual fecha, el id menor), igual en todos los equipos.
- **Aplicación.** `applyTemplateToNewContent` pone en un borrador nuevo el diseño (con `templateId`), las notas, las condiciones y la vigencia (`issueDate` + `validityDays`, `addDaysIso`); lo que el contenido ya traiga gana. `designFromTemplate` cambia solo el diseño (elegir plantilla en el editor). `templateFromQuotation` arma una plantilla con el diseño y los textos de una cotización, con la vigencia en días.
- **Firma y sello impresos** (`printedSignature`, `printedStamp` en `src/features/quotations/library.ts`). Un **borrador** sigue la biblioteca: la firma es la elegida en `design.signatureId` (si existe y es una firma) o la predeterminada, solo con `showSignature`; el sello, con `showStamp`, el predeterminado de la organización o, sin él, el del membrete que emitió la cotización (`stampForIssuer`). Al **salir de borrador** (`setQuotationStatus`, `freezePrintedDesign`) se guarda en el contenido una copia fija de lo que se imprime: `design.signature` (`{name, role, image}`) y `design.stampImage` (solo el sello de la biblioteca). Una cotización **bloqueada** imprime solo esa copia: borrar la firma, cambiar la predeterminada o importar la primera firma no cambia su PDF; sin copia (las emitidas antes de existir la biblioteca) no imprime firma (bajo la raya, el vendedor, como antes) y conserva el sello del membrete. Reabrirla vuelve a seguir la biblioteca y volver a emitirla fija la selección de ese momento. Son campos opcionales: un cliente o una API que no los conocen siguen siendo válidos (`validateQuotationContent` los normaliza como imágenes: `''`, `asset:sha256:` o data URL PNG/JPEG/WebP de hasta 700 000 caracteres).

### Store y sincronización de la biblioteca

`src/store/slices/quotationLibrarySlice.ts` guarda `quotationLibrary` (`templates` y `signatures`, cada una con `items`, `changes`, `deletions` y `cursor`) como parte del espacio de trabajo (`organizationWorkspace`): se archiva y restaura con él y lo creado sin cuenta nunca pasa a una organización. Sin cuenta todo funciona en este equipo; con sesión, `syncQuotationLibraryWithServer` (llamada también desde `syncProjectsWithServer`, sin afectar su mensaje: el estado se ve en el gestor) publica primero y descarga después (`?since=` con el cursor del espacio activo). Permisos con `canWrite`.

- Acciones: crear, editar (valida con el contrato; sin cambios no escribe), duplicar («(copia)», nunca predeterminada), marcar o quitar la predeterminada (desmarca al instante las demás de su ámbito sin marcarlas como cambio: la API hace lo mismo y lo trae el delta), eliminar (cola de borrado con la versión confirmada).
- Imágenes: la copia local de una firma guarda su data URL; al publicar se sube (`DocumentAssetService.ensureUploaded`, una vez por espacio de trabajo y sesión de la app) y viaja la referencia; al confirmar, la copia local conserva la imagen si la referencia es la suya. Un 4xx de la subida queda como rechazo visible.
- Predeterminada sin 409 espurio: la respuesta del PUT trae `cleared` (las filas que el servidor desmarcó con su versión nueva) y el cliente toma esa versión como base de sus copias, así editar la anterior predeterminada antes de la siguiente descarga no choca. Resolver un aviso limpia el mensaje y vuelve a sincronizar.
- Conflictos: 409 con registro → `server` (recibo perdido si el contenido es idéntico); 409 o `deletedIds` sobre un cambio pendiente → `server: null`. `resolveQuotationLibraryConflict(kind, id, 'accept_server' | 'keep_local')`: aceptar instala la copia del servidor o descarta la borrada; conservar publica sobre la versión del servidor o, si la borraron, crea otra con id nuevo. Un rechazo 4xx no se reintenta hasta una edición nueva o `keep_local`. Un borrado obsoleto (409 con registro) no se aplica: el registro vuelve a la lista.

### Pendiente: cuota y limpieza de activos

`document_assets` no tiene cuota por organización ni recolección: un archivo subido y luego quitado de toda cotización, firma o propuesta sigue guardado (las referencias son inmutables y una versión anterior puede seguir apuntándolo). Falta decidir una cuota por organización y una limpieza de huérfanos que respete el historial; hoy solo limitan el tamaño por archivo (8 MiB, cuerpo de 11,5 MiB en `POST /api/document-assets`) y por solicitud (20 MiB).

## Catálogo

Vista `quotations-hub` (`src/components/quotations/QuotationsHubView.tsx`, piezas en `src/components/quotations/hub/`, lógica pura en `src/utils/quotationSummary.ts`). Solo existe con la función registrada `quotations` activada ([Funciones](APPLICATION_FEATURES.md#cotizaciones)): el botón «Cotizaciones» del dock principal aparece con ella y, si se apaga mientras se está en el catálogo o el editor, la app vuelve a Inicio (solo cambia la vista). Al reabrir la aplicación, una sesión que quedó en el editor vuelve al catálogo, porque la cotización abierta no se guarda.

**Apagar la función oculta la interfaz, no detiene la sincronización.** `syncProjectsWithServer` sigue sincronizando las cotizaciones y sus cambios pendientes. Si quedaba un conflicto o un rechazo, el mensaje global de sincronización seguirá diciendo «cotizaciones pendientes» sin que haya dónde resolverlo: para resolverlo hay que volver a encender la función y usar el dock de detalle.

- **Vistas**: Todas, Borradores, Emitidas, Aceptadas, Vencidas, Rechazadas y Anuladas, cada una con su recuento por **estado efectivo** (`effectiveQuotationStatus` con la fecha local de hoy, `localIsoDate`): una emitida con la vigencia pasada cuenta como Vencida y no como Emitida. Debajo, las carpetas del espacio de trabajo (`folders`, las mismas de Inicio) filtran con la regla de Inicio (`isProjectInFolderView`): sin carpeta activa se ocultan las cotizaciones de carpetas marcadas «ocultar de la vista general»; con una carpeta activa se ven solo las suyas. Recuentos e indicadores siguen la carpeta activa, no la búsqueda ni la moneda.
- **Indicadores**: Borradores, Emitidas por responder (emitidas vigentes), Aceptadas y Vencidas, cada uno con el número de cotizaciones y la suma de sus totales en **RD$**: el total de cada cotización sale de `computeQuotationTotals` (las líneas `detail` aportan 0; descuentos e ITBIS incluidos) y se convierte con **su propia** `exchangeRate` (`convertCents`), nunca con una tasa común. Son cotizaciones, no ingresos cobrados.
- **Lista**: número resaltado (o «Sin número» si aún es `null`), cliente con `projectLabel` y «Desde propuesta» si tiene `sourceProjectId`, fecha de emisión y vigencia («Vence …», «Venció …», «Sin vigencia»), total en su moneda con bandera y `formatMoney`, y el estado al final (`QuotationStatusChip`). Búsqueda por número, cliente y proyecto (sin distinguir mayúsculas ni acentos), filtro por moneda y orden por fecha de emisión descendente (a igual fecha, número descendente). Con sesión, la fila marca un cambio pendiente de publicar, un conflicto o un rechazo del servidor (`quotationSyncIssue`); un rechazo de una revisión anterior, ya superado por una edición nueva, cuenta como pendiente (se reintentará). Sin cuenta no hay servidor y no se marca nada. La vigencia dice «Vence …»/«Venció …» en borradores y emitidas; en aceptadas, rechazadas y anuladas, «Vigencia …». Clic selecciona; el número, doble clic o Enter abren el editor (`openQuotation`); flechas arriba/abajo recorren las filas.
- **Acciones en lote** (casillas): mover a carpeta y eliminar (con confirmación). Cada una pasa por la acción del store, que decide: mover exige borrador (`moveQuotationToFolder`), así que las que no lo son se cuentan y se explica el motivo junto a la barra.
- **Dock de detalle** de la seleccionada (sin elección, la primera de la lista; seleccionar es estado local y nunca escribe en el store): número y estado, fechas y carpeta, bloque De/Para (`issuer`/`client`), ítems (las líneas `detail` sin precio), subtotal, descuentos aplicados, ITBIS y total (con su equivalente en RD$ si está en dólares), nota, condiciones y adjuntos (título y «Se incluye» o «Relacionado»). Acciones: «Editar» (`openQuotation`), «Duplicar» (selecciona la copia y, si la vista activa no la contiene, pasa a Borradores; `viewShowing`), los cambios de estado que permite `canTransitionQuotation` desde el estado guardado (Emitir, Marcar aceptada, Marcar rechazada, Reabrir, Anular; anular pide confirmación porque no tiene vuelta) y «Eliminar» con `confirmAction`. Un `{ ok: false, error }` se muestra junto a la acción que lo produjo.
- **Conflictos**: el dock explica en una frase cada caso del cambio pendiente (`QuotationChange`) y ofrece «Usar la del servidor» / «Conservar la mía» (`resolveQuotationConflict`), diciendo qué hace cada una: conflicto de versión (`serverQuotation`), eliminada en el servidor (`serverDeleted`: conservar crea un borrador nuevo sin número), borrado obsoleto (`deletionConflict`: conservar vuelve a eliminarla), rechazo de un cambio (`rejected`) y borrado rechazado (comando de `quotationDeletionQueue` con `rejected`). Un cambio de otra cuenta del mismo equipo se muestra sin acciones.
- **Sincronización**: la cabecera dice «Guardadas en este equipo» sin cuenta; con sesión, cuántos cambios propios quedan por publicar (`pendingPublishCount`: escrituras sin conflicto ni rechazo activo y borrados en cola; los conflictos tienen su marca y su aviso) o que hay que revisar la sincronización (`quotationSyncFeedback`, mostrado también como aviso), y ofrece «Sincronizar» (`syncQuotationsWithServer`) con el resultado.
- **Permisos** (`canWrite`, `shared/permissions.ts`): sin cuenta se puede todo; un LECTOR ve vistas, indicadores, lista y detalle completos, abre la cotización con «Ver» y puede sincronizar, pero no tiene «Nueva cotización», casillas ni acciones en lote, duplicar, cambios de estado ni eliminar.
- **Plantillas y firmas**: botón de la cabecera que abre el gestor (`openQuotationLibrary`, [editor](QUOTATION_EDITOR.md#gestor-de-plantillas-firmas-y-sellos)); también para un LECTOR, que lo ve en solo lectura.
- **Estados vacíos**: sin cotizaciones, una explicación y «Nueva cotización» (si se puede escribir); sin resultados, cómo ampliar la búsqueda y «Quitar filtros».

La vista sigue los tokens de `DESIGN.md` en claro y oscuro (`sidebarTheme`) y funciona desde 1024×700: el dock pasa debajo de la lista por debajo de 1400 px de ancho de ventana, los indicadores a dos columnas por debajo de 1280 px y la tabla, si no cabe, se desplaza dentro de su panel (nunca la página).

## Pruebas

`npm test -- Quotation`: `testQuotationTotals` (dinero, totales, entradas hostiles y propiedades sobre 2000 documentos aleatorios con semilla fija), `testQuotationStatus` (estados y numeración), `testQuotationValidation`, `testQuotationFromProposal`, `testQuotationSharedPurity`, `testQuotationStore` (local: numeración, bloqueo, transiciones, duplicado, enlaces, persistencia y espacios de trabajo), `testQuotationPersistedAssets` (imágenes en línea guardadas una vez, referencias del servidor intactas) y `testQuotationSync` (API sintética con el contrato HTTP: número del servidor, `since`, recibos perdidos, conflictos, borrados, rechazos sin bucle, `invalid_client`/`invalid_folder`, creaciones anuladas o rechazadas sin conexión, copias del servidor más nuevas durante un conflicto, borrados ya hechos, obsoletos y rechazados, desenlaces por borrado de clientes y carpetas, imágenes, aislamiento y enganche con `syncProjectsWithServer`), `testQuotationLibraryContracts` (firma real de archivos, validación y topes de plantillas y firmas, tipos disfrazados, predeterminadas, aplicación y «guardar como plantilla») y `testQuotationLibraryPersistedAssets` (firmas, sellos y copias fijadas guardados una vez con prefijo propio, referencias del servidor sin expandir, cuota) y `testQuotationLibrarySync` (local sin cuenta, predeterminada sin 409 espurio, LECTOR, CAS, 409, delta, recibos perdidos, borrados en el servidor, imágenes subidas como referencias, espacios de trabajo, logo y adjuntos de cotizaciones publicados como referencias y una emitida que no se reabre). Catálogo: `testQuotationSummary` (recuentos por estado efectivo, indicadores en RD$ con la tasa de cada cotización, filtro, búsqueda, orden, carpetas, vigencia, transiciones y marcas de sincronización), `testQuotationsHub` (render con datos de ejemplo, LECTOR sin acciones de escritura, transiciones del dock y textos de conflicto) y `testQuotationsFeature` (función registrada, política de una, dos o tres claves y caída a Inicio).
