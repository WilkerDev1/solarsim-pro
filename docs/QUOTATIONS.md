# Cotizaciones

Documento comercial simple (líneas, descuentos, ITBIS y total). **No es una factura fiscal ni una propuesta**: es una entidad propia, distinta de `ProjectSimulation` ([ADR 0007](adr/0007-cotizaciones-entidad-propia.md)). Este documento describe el contrato del dominio puro compartido en `shared/quotations/`; la API, el store y la interfaz llegan en fases siguientes.

Reglas del módulo: TypeScript puro (sin `src/`, `server/`, `electron/`, Node ni terceros), imports relativos con extensión `.js`, sin relojes ni generación de ids (la fecha y `newId` entran como argumento), importes en **centavos enteros** y la tasa de ITBIS solo desde `ITBIS_RATE` (`shared/financialRules.ts`). Lo verifica `testQuotationSharedPurity`.

## Tipos (`types.ts`)

| Tipo | Contenido |
| --- | --- |
| `QuotationContent` | Lo editable y validado: `status`, `issueDate`, `validUntil` (`YYYY-MM-DD` o `null`), `currency` (`DOP`/`USD`), `exchangeRate` (DOP por 1 USD, > 0), `clientId?`, `client` (datos impresos), `sourceProjectId?`, `folderId?`, `seller`, `projectLabel`, `items`, `discounts`, `notes`, `paymentTerms`, `design`, `attachments`, `issuer`. |
| `Quotation` | `QuotationContent` + `id`, `number` (`null` hasta que lo asigne la API), `version`, `baseVersion`, `createdById`, `createdBy`, `createdAt`, `updatedAt`. |
| `QuotationLine` | `kind` `item` (con precio) o `detail` (fila descriptiva: descripción y cantidad, precio 0, aporta 0 al total), `quantity` (hasta 3 decimales), `unit`, `unitPriceCents`, `discountPct` (0–100), `taxable`, `catalogItemId?`. |
| `QuotationDiscount` | Global: `fixed` (centavos) o `percentage` (0–100 sobre el subtotal). |
| `QuotationAttachment` | `mode` `include` (se fusiona al PDF) o `related` (solo enlazado); `origin` `manual`/`catalog`/`proposal`. |
| `QuotationDesign`, `QuotationIssuer`, `QuotationPrintedClient` | Presentación del PDF, datos del emisor (logo como data URL o `asset:sha256:`) y del cliente tal como se imprimen. |

`DEFAULT_QUOTATION_DESIGN` (`clasica`, `#087b58`, `sans`, firma y sello visibles) y `emptyQuotationContent(today, overrides?)` (borrador en DOP; la tasa sale de `overrides` o de `DEFAULT_DOP_RATE`) están en el mismo archivo.

## Dinero (`money.ts`)

- `toCents(amount)`: redondeo half-up robusto frente a la coma flotante (`39.2` → 3920, `1.005` → 101). `fromCents`.
- `formatMoney(cents, currency)` → `RD$ 35,966.40`, `US$ 18,450.00`, negativos `-RD$ 10.00`; `formatAmount(cents)` → `35,966.40`. Implementación propia, independiente del idioma del sistema.
- `convertCents(cents, from, to, exchangeRate)`: DOP↔USD con half-up; misma moneda devuelve igual.

## Totales (`totals.ts`)

`computeQuotationTotals({ items, discounts })` es pura, no muta y nunca lanza ni devuelve `NaN` (cantidades negativas o no finitas valen 0, los porcentajes se acotan a 0–100, los precios no finitos o negativos valen 0).

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

Rechaza: estado, moneda, disposición o tipografía desconocidos; fechas que no sean `YYYY-MM-DD` reales; `validUntil` anterior a `issueDate`; `exchangeRate` ausente, no finito o ≤ 0; cantidades o precios negativos o no finitos; porcentajes fuera de 0–100; ids de línea, descuento o anexo vacíos o duplicados; `accent` que no sea `#rrggbb`; y exceder `QUOTATION_LIMITS` (id 64, descripción de línea 500, unidad 16, notas 4000, condiciones de pago 2000, etiquetas 255, 200 líneas, 20 descuentos, 40 anexos…). Fuera de `draft`, el nombre del cliente y al menos una línea `item` son obligatorios.

## Conversión desde propuesta (`fromProposal.ts`)

La propuesta no tiene precio unitario por equipo, así que `quotationFromProposal(source, { today, design?, newId })` recibe un `ProposalQuotationSource` con los importes ya calculados por quien llama (se armará dentro de `src/`, donde vive el motor). Devuelve un `QuotationContent` en `draft` con `sourceProjectId`; primero las `pricedLines` como `item`, después las `detailLines` como `detail`; todos los anexos con `mode: 'related'`, `origin: 'proposal'` y `sourceProjectId`; ids de línea y de descuento de `newId()`. No muta la entrada ni comparte referencias con ella, y el resultado pasa `validateQuotationContent` sin cambios.

## Pruebas

`npm test -- Quotation`: `testQuotationTotals` (dinero y totales), `testQuotationStatus` (estados y numeración), `testQuotationValidation`, `testQuotationFromProposal` y `testQuotationSharedPurity`.
