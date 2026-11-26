# Cotizaciones

Documento comercial simple (líneas, descuentos, ITBIS y total). **No es una factura fiscal ni una propuesta**: es una entidad propia, distinta de `ProjectSimulation` ([ADR 0007](adr/0007-cotizaciones-entidad-propia.md)). Este documento describe el contrato del dominio puro compartido en `shared/quotations/`; la API, el store y la interfaz llegan en fases siguientes.

Reglas del módulo: TypeScript puro (sin `src/`, `server/`, `electron/`, Node ni terceros), imports relativos con extensión `.js`, sin relojes ni generación de ids (la fecha y `newId` entran como argumento), importes en **centavos enteros** y la tasa de ITBIS solo desde `ITBIS_RATE` (`shared/financialRules.ts`). Lo verifica `testQuotationSharedPurity`.

## Tipos (`types.ts`)

| Tipo | Contenido |
| --- | --- |
| `QuotationContent` | Lo editable y validado: `status`, `issueDate`, `validUntil` (`YYYY-MM-DD` o `null`), `currency` (`DOP`/`USD`), `exchangeRate` (DOP por 1 USD, entre 1 y 10 000), `clientId?`, `client` (datos impresos), `sourceProjectId?`, `folderId?`, `seller`, `projectLabel`, `items`, `discounts`, `notes`, `paymentTerms`, `design`, `attachments`, `issuer`. |
| `Quotation` | `QuotationContent` + `id`, `number` (`null` hasta que lo asigne la API), `version`, `baseVersion`, `createdById`, `createdBy`, `createdAt`, `updatedAt`. |
| `QuotationLine` | `kind` `item` (con precio) o `detail` (fila descriptiva: descripción y cantidad, precio 0, aporta 0 al total), `quantity` (hasta 3 decimales), `unit`, `unitPriceCents`, `discountPct` (0–100, 2 decimales), `taxable`, `catalogItemId?`. |
| `QuotationDiscount` | Global: `fixed` (centavos) o `percentage` (0–100 con 2 decimales, sobre el subtotal). |
| `QuotationAttachment` | `mode` `include` (se fusiona al PDF) o `related` (solo enlazado); `origin` `manual`/`catalog`/`proposal`; `assetId?`, `thumbnailDataUrl?` (ver imágenes en Validación). |
| `QuotationDesign`, `QuotationIssuer`, `QuotationPrintedClient` | Presentación del PDF, datos del emisor (logo como data URL de imagen o `asset:sha256:`) y del cliente tal como se imprimen. |

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

Formato `COT-AAAA-NNNN` (`QUOTATION_NUMBER_PREFIX = 'COT'`): secuencia con relleno a 4 dígitos, sin truncar pasado 9999 (`COT-2026-12345`). `formatQuotationNumber(year, sequence)` lanza `RangeError` ante un año o secuencia inválidos; `parseQuotationNumber(text)` es estricto (solo acepta lo que el formateador produce) y devuelve `null` en otro caso; `quotationNumberYear(issueDate)` da el año de la fecha de emisión. La asignación del número la hará la API; hasta entonces `Quotation.number` es `null`.

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

## Pruebas

`npm test -- Quotation`: `testQuotationTotals` (dinero, totales, entradas hostiles y propiedades sobre 2000 documentos aleatorios con semilla fija), `testQuotationStatus` (estados y numeración), `testQuotationValidation`, `testQuotationFromProposal` y `testQuotationSharedPurity`.
