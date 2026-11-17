# ADR 0005: Régimen de medición neta (SIE-007-2026-REG)

Estado: aceptado, con supuestos provisionales (ver «Postura»). Términos en el [glosario](../../GLOSSARY.md). Continúa los ADR [0003](0003-supuestos-resueltos.md) (resolver al leer) y [0004](0004-edicion-de-proyecto.md) (toda edición pasa por `applyProjectEdit`).

## Contexto

El Reglamento SIE-007-2026-REG cambia cómo se cobra la medición neta. El cargo por uso de la red (art. 19.1.e) es la energía inyectada × el 25 % del cargo por energía de la tarifa, y solo aplica a tarifas monómicas (de un solo precio): BTS-1, BTS-2 y RBT-1 de CEPM. Las tarifas con cargo de potencia no lo pagan.

Los valores de fábrica por distribuidora viven en `shared/netMetering.ts` (`FACTORY_GRID_USE_CHARGES`), con resolución y periodo:

| Distribuidora | RD$/kWh inyectado | Fuente |
| --- | --- | --- |
| EDESUR | 3.78 | SIE-121-2026-TF, octubre–diciembre 2026 |
| EDENORTE | 4.02 | SIE-121-2026-TF, octubre–diciembre 2026 |
| EDEESTE | 3.88 | SIE-121-2026-TF, octubre–diciembre 2026 |
| CEPM | 5.73 | SIE-147-2026-TF, septiembre 2026 |

Los tres de las EDE se calculan sobre la tarifa de referencia sin subsidio (15.12, 16.09 y 15.53 × 25 %).

EDESUR comunicó oficialmente (recibido el 16/11/2026) que aplica el esquema desde el 1/11/2026, también a los clientes de medición neta anteriores a octubre de 2021. Hasta entonces todas las propuestas se calculaban con el régimen anterior: una retención porcentual de la energía exportada.

## Decisión

1. **Dos regímenes** (`rates.netMeteringRegime`, `NET_METERING_REGIMES`):
   - `legacy_retention`: se retiene `gridExportFeePct` (25 % por defecto) de lo exportado, en cualquier tarifa.
   - `sie007_2026`: se acredita todo lo inyectado y se cobra `gridUseChargeDOPPerKWh` (0–100) por kWh inyectado, solo con inyección a red y tarifa sin potencia (`gridUseChargeApplies`). Una tarifa sin clasificar lo paga: ante la duda el ahorro se estima a la baja.
2. **Lo guardado sin el campo es `legacy_retention`** (`resolveNetMeteringRegime`, ADR 0003: se resuelve al leer). No hay migración: propuestas, importaciones, historial y enlaces publicados conservan sus cifras. Las propuestas nuevas (simulador, borrador de IA, agentes) nacen en `sie007_2026` con el cargo de fábrica de su distribuidora (`newProposalNetMeteringFields`). Un enlace publicado en `sie007_2026` materializa el régimen y el cargo efectivo (`publishedNetMeteringRates`), de modo que un cambio posterior del valor de fábrica no lo altera.
3. **El régimen anterior está siempre disponible.** Cambiar de uno a otro es una edición `rates` normal. La política de organización `netMeteringRegimeSelector` (beta, activada por defecto) solo muestra u oculta el selector; no cambia el régimen de ninguna propuesta ([función](../APPLICATION_FEATURES.md)).
4. **Actualización explícita y reversible (fase 7).** Ninguna propuesta migra sola. Una propuesta en el régimen anterior, con inyección a red y tarifa de un solo precio recibe en el dock el aviso «Actualizar a SIE-007-2026» (`src/domain/netMeteringUpgrade.ts`), que aplica `sie007UpgradePatch` por `applyProjectEdit` y se puede deshacer. No toca el precio, su procedencia ni la retención guardada. Sin el selector, el aviso tampoco aparece. Inicio y el resumen muestran la insignia «Régimen anterior» solo en las propuestas abiertas (no archivadas, ni en papelera, ni aprobadas o rechazadas).
5. **Facturación por bloques** (`shared/tariffBilling.ts`) solo cuando el precio tiene origen `reference` (`rates.energyRateSource`, `BLOCK_BILLING_RATE_SOURCES`) y la propuesta guarda la fila de su tarifa (`rates.billingTariff`); el ahorro es la factura sin sistema menos la factura con sistema. Un precio de factura (`invoice`) o tecleado (`manual`) se valora con el escalar. En los borradores de IA con tarifas escalonadas (hoy BTS1/BTS2 de las EDE) el precio leído de una línea de la factura es un dato observado (`marginalRateDOP`), no el precio de la energía: el borrador queda en `reference` y se valora con los bloques oficiales.
6. Detalle de fórmulas y de datos: [especificación financiera](../FINANCIAL_ENGINE_SPECIFICATION.md) y [tarifas en el flujo IA](../AI_TARIFF_CONTEXT.md).

## Postura

Conservadora y **provisional** mientras las distribuidoras terminan la transición. Cinco supuestos no están verificados con una factura real; cada uno es editable o se señala como «estimado, no verificado con facturas» (`UNVERIFIED_ESTIMATE_LABEL` en el dock; `GRID_USE_CHARGE_ESTIMATE_NOTICE` para el cargo por uso de la red):

1. **Liquidación anual del crédito.** El remanente de diciembre se paga, según el reglamento, al precio de referencia de la CNE de contratos a 10 años, que no está publicado. De fábrica vale 0 (`FACTORY_ANNUAL_CREDIT_SETTLEMENT`, `confirmed: false`); editable en `rates.annualCreditSettlementDOPPerKWh`.
2. **Rango del cargo fijo.** En BTS-1 (0–100 / ≥101 kWh) se elige por la energía retirada, lectura que da la factura más alta (`fixedChargeTierBasis`, `withdrawn`). Las fuentes no lo confirman.
3. **Bloques sobre el consumo neto.** Los bloques escalonados se aplican al consumo neto facturado (retirado − inyectado − crédito del mes anterior), no al retirado.
4. **Cargo sobre la inyección bruta.** El cargo se cobra sobre toda la energía inyectada. El comunicado de EDESUR («energía inyectada») lo respalda, pero ninguna factura lo ha mostrado.
5. **Base del 25 %.** Se usa la tarifa de referencia sin subsidio (el valor más alto, ahorro a la baja), aunque el comunicado habla de «la tarifa asignada al cliente». Si la base fuera la tarifa asignada, el cargo bajaría.

## Evidencias

- Factura de EDESUR BTS1 de 373 kWh: RD$3,138.56 = 128.59 (cargo fijo) + 200 × 6.05 + 100 × 8.59 + 73 × 12.89. Confirma la matriz de bloques y el cargo fijo.
- Factura de EDENORTE BTS-1 de 1,150 kWh a 14.04 por kWh con cargo fijo de 126.81. Confirma el precio único desde 701 kWh y el cargo fijo.
- Ninguna de las dos trae líneas de medición neta, así que no verifican los cinco supuestos.
- El cuadro de EDESUR de noviembre de 2026 es idéntico al de la SIE-121-2026-TF.

## Consecuencias y pendientes

- El comportamiento de lo guardado no cambia; las propuestas nuevas muestran un ahorro menor que con la retención, en tarifas de un solo precio con exportación.
- Pendiente: contrastar los cinco supuestos con una factura que muestre energía inyectada y el cargo por uso de la red. Al hacerlo se ajustan los valores de fábrica o la regla, y este ADR pasa de provisional a definitivo.
- El tope del art. 13 del reglamento no está codificado: sin avisos hasta tener la regla.
- Los valores de fábrica se revisan cada trimestre (cada mes en CEPM) y solo siembran propuestas nuevas.
