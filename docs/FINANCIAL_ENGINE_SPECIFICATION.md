# Especificación del motor financiero

Contrato matemático implementado en `src/engine/financeEngine.ts` (`calculateCostMatrixSummary`, `calculateFinancialSummary`, `calculateProjectFinancialSummary`) y, para la energía, `src/engine/solarEngine.ts`. Describe el comportamiento actual del código; no es una validación jurídica de la normativa. Antes de cambiar fórmulas, revisar este documento y [ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md](ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md).

Todos los importes se calculan en USD; DOP se obtiene con la tasa `dopExchangeRate` (`specs.dopExchangeRate`, si no `rates.usdExchangeRate`, si no 60). La mayoría de los resultados se redondean a 2 decimales.

### Supuestos efectivos

Los valores por defecto de este documento (60, 14/25 %, 3,5 %, 12 %, 25 años, 95 %, 25 %, 0,4 %, año 10, 1,13 $/W, 1,25, 170 USD/kWp, 0,481) viven en un solo lugar: `shared/assumptions.ts` ([ADR 0003](adr/0003-supuestos-resueltos.md)). `resolveAssumptions(proyecto)` los resuelve con la tabla `ASSUMPTION_RULES`: un dato ausente, no finito o fuera del rango válido toma el default; un 0 explícito se respeta en inflación, descuento, pérdidas, degradación, mano de obra y retención de exportación, y en tasa de cambio, vida del proyecto, vigencia, cobertura, año de reemplazo, $/W, margen y factor de CO₂ equivale a «sin dato». Los conteos de años y días (vida, año de reemplazo, vigencia) deben ser enteros. Una propuesta guardada nunca toma los ajustes del usuario: estos solo siembran propuestas nuevas (`assumptionFields`). Los motores, el PDF, el dock y el visor leen la misma resolución.

## 1. Generación y balance energético

### 1.1 Capacidad DC

$$P_{dc} = \frac{\sum (P_{panel} \times N_{paneles})}{1000} \quad [\text{kWp}]$$

Con varios grupos de paneles se suman todos los grupos.

### 1.2 Producción mensual

$$E_{m} = P_{dc} \times \text{HSP}_{m} \times D_{m} \times (1 - L_{sys})$$

- $\text{HSP}_m$: horas solar pico de la provincia (`src/data/rdProvinces`) o vector personalizado de 12 valores positivos.
- $D_m$: días del mes (febrero = 28).
- $L_{sys}$: `systemLosses` (0 es válido; rango 0–99); si falta o es inválido, 14% en modo detallado y 25% en modo simple (`resolveSystemLosses`).

$$E_{anual} = \sum_{m=1}^{12} E_{m}$$

### 1.3 Autoconsumo, exportación y ahorro

El modo de cálculo se pasa explícitamente a los motores; si se omite se usa **legacy**, que es el predeterminado. La proyección física es opcional (función `selfConsumptionProjection` en `shared/applicationFeatures.ts`) y se describe en el documento de balance energético.

Modo legacy, por mes:

$$E_{auto,m} = \min\left(C_m,\ E_m \times k\right), \quad k = \begin{cases} 0.90 & \text{con batería} \\ 0.75 & \text{sin batería} \end{cases}$$

$$E_{exp,m} = \begin{cases} 0 & \text{inyección cero} \\ \max(0,\ E_m - E_{auto,m}) & \text{medición neta} \end{cases}$$

El cálculo del excedente depende del **régimen de medición neta** de la propuesta (`rates.netMeteringRegime`, reglas en `shared/netMetering.ts`). Ambos regímenes valen en los dos modos (legacy y proyección física) y no cambian $E_{auto,m}$ ni $E_{exp,m}$.

**Régimen anterior, `legacy_retention`** (toda propuesta guardada, importada, del historial o publicada sin el campo; sus cifras no cambian): la retención (`gridExportFeePct`, 25 si falta; un 0 explícito se respeta; 0 en inyección cero) se aplica solo a la energía exportada:

$$E_{net\_credit,m} = E_{exp,m} \times \left(1 - \frac{F_{grid}}{100}\right)$$

$$E_{saved,m} = E_{auto,m} + E_{net\_credit,m}, \qquad S_m = E_{saved,m} \times T_{kWh}, \qquad S_{yr1} = \sum_{m} S_m$$

$T_{kWh}$ es `energyCostPerKWh` del proyecto: una tarifa plana guardada en la propuesta. El motor no lee la matriz de tarifas; la matriz solo sugiere esa tarifa al crear o escanear (tarifa de referencia, ver [Tarifas en el flujo IA](AI_TARIFF_CONTEXT.md)). La referencia de BTS-1 y BTS-2 es el precio medio por bloques del consumo mensual promedio; desde 701 kWh es el precio del cuarto bloque para todo el consumo (Resolución SIE-121-2026-TF, art. 4.d). Cambiar la matriz o esa regla no altera propuestas guardadas: `src/tests/testNetMeteringRegime.ts` fija las cifras actuales de BTS-1, BTD, inyección cero y batería en ambos modos.

En este régimen la retención es un porcentaje uniforme para todas las tarifas, también las que tienen cargo de potencia.

**Régimen SIE-007-2026, `sie007_2026`** (con el que nacen las propuestas nuevas: simulador, borrador de IA y `create_proposal`): la medición neta acredita el 100 % de lo inyectado y el Reglamento SIE-007-2026-REG (art. 19.1.e) cobra un cargo por uso de la red por kWh inyectado, solo a las tarifas de un solo precio:

$$E_{net\_credit,m} = E_{exp,m}, \qquad G_m = E_{exp,m} \times \frac{c_{red}}{FX}, \qquad S_m = (E_{auto,m} + E_{exp,m}) \times T_{kWh} - G_m$$

- $c_{red}$ es `rates.gridUseChargeDOPPerKWh` (RD$/kWh inyectado, editable por propuesta, 0 explícito se respeta, rango 0–100). Si falta o no es válido, el de fábrica de la distribuidora: EDESUR 3.78, EDENORTE 4.02, EDEESTE 3.88 (Res. SIE-121-2026-TF, art. 9, octubre–diciembre 2026, calculados sobre la tarifa sin subsidio) y CEPM 5.73 (Res. SIE-147-2026-TF, art. 2, septiembre 2026). Una distribuidora desconocida usa 4.02 (el mayor de las EDE). Las propuestas nuevas guardan el de fábrica al nacer; cambiar de distribuidora con `applyProjectEdit` lo pasa al de la nueva salvo que se haya editado a mano.
- $c_{red} = 0$ en tarifas con cargo de potencia (`tariffChargeKind` = `demand`: BTD, BTH, MTD-1, MTD-2, MTH, RBT-2, ESTRBT-2) y en inyección cero. Una tarifa sin clasificar (`unknown`) **sí** paga el cargo: es la estimación conservadora (ahorro a la baja) hasta clasificarla.
- $FX$ es la tasa efectiva de la propuesta (`resolveAssumptions(...).dopExchangeRate`). El desglose mensual lleva `gridUseChargeUSD` solo en este régimen; en el anterior el campo no aparece.
- $E_{exp,m}$ es la energía inyectada del modelo: en legacy, $E_m - E_{auto,m}$; en la proyección física, el excedente diario que no carga la batería. Con batería en la proyección física baja la inyección y, con ella, el cargo.
- El cargo es una **estimación no verificada con facturas**; el dock, la revisión y la nota regulatoria lo dicen. La factura por bloques, el cargo fijo por rangos y la liquidación anual del excedente al precio CNE quedan para fases siguientes: $T_{kWh}$ sigue siendo la tarifa plana de la propuesta.

`resolveAssumptions` expone `netMeteringRegime`, `gridUseChargeDOPPerKWh` y `appliedGridUseChargeDOPPerKWh` (0 cuando el cargo no aplica). `src/tests/testSie007GridUseCharge.ts` fija el régimen nuevo; `testNetMeteringRegime.ts` sigue fijando el anterior sin cambios.

### 1.3.1 Tipo de conexión con la red

`rates.gridConnection` (`shared/gridConnection.ts`) es un solo concepto con tres valores; se lee siempre con `resolveGridConnection` y se escribe con `gridConnectionFields`, que guarda también `isZeroExport` coherente (verdadero si no exporta), de modo que una versión anterior que solo lee `isZeroExport` trata un sistema aislado como inyección cero. Una propuesta, importación, versión del historial o enlace publicado sin `gridConnection` se deriva de `isZeroExport`; un `gridConnection` que contradice `isZeroExport` (lo dejó una versión anterior al cambiar solo `isZeroExport`) se descarta.

| Valor | Exporta | Importa de la red | Déficit |
| --- | --- | --- | --- |
| `grid_export` (medición neta) | sí, con retención | sí | factura de la distribuidora |
| `zero_export` (inyección cero) | no: el excedente se recorta | sí | factura de la distribuidora |
| `off_grid` (aislado, «modo isla») | no: el excedente se recorta | nunca | energía no servida (`unservedKWh`) |

En `off_grid`, por mes, $E_{exp,m} = 0$, retención 0 y

$$E_{no\_servida,m} = \max(0,\ C_m - E_{auto,m})$$

En legacy, el factor $k$ supone que la red absorbe el desfase día/noche; sin red no puede servirse más que el balance físico (solar directo + ciclo de batería, sección 2 del documento de balance), así que en `off_grid` $E_{auto,m} = \min(\text{legacy},\ \text{físico})$. En la proyección física el autoconsumo es el mismo que en inyección cero. `calculateFinancialSummary` informa `annualUnservedKWh` solo en `off_grid`; `grid_export` y `zero_export` dan exactamente el mismo resultado que con el `isZeroExport` heredado.

**Valoración del ahorro aislado: alternativa de suministro.** Solo se valora la energía servida, sin crédito por exportación ni cargos fijos evitados: $S_m = E_{auto,m} \times T_{val}$. `rates.supplyAlternative` (`shared/offGridSupply.ts`, junto a `gridConnection`) fija $T_{val}$ y solo cuenta con `off_grid`; con `grid_export` o `zero_export` se ignora por completo (las cifras son idénticas con o sin el campo). Se lee con `resolveSupplyAlternative`/`resolveSavingsBasis` (ausente o desconocido = tarifa; no se repara al hidratar ni al importar) y se escribe con `applyProjectEdit`, que descarta una alternativa desconocida guarda tal cual un costo que sea un número finito (el dock no borra lo que se teclea: «0», «0.35», 1500) y como «sin dato» (`undefined`) lo que no lo es; la validez se decide al leer con `isValidGeneratorCost`, de modo que un 0 o un valor fuera del tope nunca entra en el cálculo y el dock dice el motivo («debe ser mayor que 0», «tope técnico»). Ese predicado es el único para motor, edición, asistente/agentes, publicación y Worker: número finito > 0 y ≤ 1000 USD/kWh (`MAX_GENERATOR_COST_PER_KWH`, tope técnico solo contra valores absurdos). Por encima de 10 USD/kWh (`GENERATOR_COST_WARNING_PER_KWH`) el costo se usa tal cual y el dock solo advierte que confirme que está en USD por kWh.

| `supplyAlternative` | Base (`resolveSavingsBasis`) | $T_{val}$ | Ahorro, flujo, payback, TIR, VAN, ROI |
| --- | --- | --- | --- |
| ausente / `utility_tariff` (por defecto) | `utility_tariff` | `energyCostPerKWh` (rotulado «Costo evitado kWh») | como hasta ahora |
| `generator` con `generatorCostPerKWh` > 0 | `generator` | `generatorCostPerKWh` (USD/kWh, sin default) | calculados con ese costo |
| `generator` sin costo válido (vacío, ≤ 0, no numérico o > 1000) | `generator_missing_cost` | 0 | ninguno: estado incompleto |
| `no_comparison` | `no_comparison` | 0 | ninguno |

Sin comparación (`no_comparison` o `generator_missing_cost`) el resumen deja `year1SavingsUSD`, `total25YearSavingsUSD`, `paybackYears`, `irrPct`, `npvUSD` y `roi25YrPct` en 0, `cashFlow25Years` vacío y `savingsUSD`/`originalBillUSD`/`netBillUSD` mensuales en 0; ningún consumidor muestra esos ceros: la interfaz, el PDF y el visor leen la base con `resolveSavingsBasis(rates)` y presentan el estado «sin comparación» (o el aviso de costo faltante). Inversión, energía servida, energía no servida y autonomía no cambian. **Generador sin costo:** no hay valor por defecto (el usuario no tiene una cifra de referencia) y nunca se cae en silencio a la tarifa: se trata como «sin comparación» con un aviso propio en el dock, la pestaña de retorno, Análisis energético, el hub y la vista del documento, para que el usuario complete el costo. El resumen no lleva un campo de texto con la base porque un Worker anterior rechaza métricas no numéricas. La alternativa no cambia el dimensionado, la energía servida ni la autonomía. **Aislado × régimen de medición neta:** sin inyección no hay retención ni cargo por uso de la red, sea cual sea `netMeteringRegime`: `gridUseChargeApplies` es falso con inyección cero y en `off_grid` (lee `resolveGridConnection`), `resolveNetMetering(...).appliedGridUseChargeDOPPerKWh` es 0 y `engineGridUseCharge` no pasa cargo al motor en `off_grid`, de modo que `sie007_2026` y `legacy_retention` dan exactamente las mismas cifras; el dock oculta régimen, retención y cargo, y la nota regulatoria del aislado no los menciona. No se modela el consumo de combustible de un respaldo, el dimensionamiento automático sigue usando la cobertura anual (no garantiza cubrir la noche sin red) y la autonomía de baterías sigue calculándose con la carga media de 24 h.

### 1.4 Factura y cobertura

$$\text{Factura original}_m = C_m \times T_{kWh}, \qquad \text{Factura neta}_m = \max(0,\ \text{Factura original}_m - S_m)$$

$$\text{Cobertura (\%)} = \frac{E_{anual}}{\sum_m C_m} \times 100$$

La cobertura no se limita al 100%; es 0 si el consumo anual es 0.

## 2. Almacenamiento

Capacidad útil y autonomía informadas en el resumen financiero. Las calcula solo `batteryBank` / `batteryAutonomyHours` (`shared/equipment/battery.ts`, [ADR 0002](adr/0002-banco-de-baterias.md)); el motor solar, el resumen financiero, el PDF y la vista previa del dock usan el mismo banco:

$$E_{bat,util} = C_{nominal} \times \frac{\text{DoD}}{100} \times \frac{\eta}{100}$$

con $C_{nominal}$ la suma de capacidad × cantidad de los grupos de baterías (2 decimales) y el DOD y la eficiencia de cada grupo (`dodPct` y `efficiencyPct`; 90/90 si faltan o están fuera de 1–100; DOD ponderado por capacidad y eficiencia ponderada por capacidad × DOD). Un banco de 0 kWh (por ejemplo, «Sí batería» con cantidad 0) no almacena: energía útil 0 kWh y autonomía 0 h. El resumen redondea la energía útil a 0,1 kWh.

$$L_{prom} = \frac{E_{consumo\_anual}}{365 \times 24}, \qquad T_{autonomía} = \frac{E_{bat,util}}{L_{prom}} \quad [\text{h}]$$

La autonomía se redondea a 0,1 h; sin almacenamiento o sin carga es 0. Si el consumo anual es 0 se asume 100 kWh/día para el promedio.

## 3. Matriz de costos (`calculateCostMatrixSummary`)

### 3.1 Renglones

| Renglón | Costo | ITBIS en la matriz |
| --- | --- | --- |
| Paneles | $N \times P_u$ por grupo | 0% |
| Inversores | $N \times P_u$ por grupo | 0% |
| Baterías (solo si `hasBattery`) | $N \times P_u$ por grupo | 18% |
| Mano de obra y materiales | $P_{dc} \times P_{u,inst}$ | 18% |
| Ítems adicionales (`customItems`) | $\text{cantidad} \times P_u$ | 18% solo si **no** está exonerado |

Un ítem adicional se considera exonerado según `exonerateITBIS` (o, en datos antiguos, `applyITBIS`; exonerado si ambos faltan). Precios por defecto cuando un proyecto antiguo no tiene grupos: panel 103.32, inversor 2300, batería 1990 e instalación 170 USD/kWp.

Con grupos multi-equipo, cada grupo usa su propio `unitPriceUSD`. Un grupo sin precio no hereda el de otro modelo ni un precio de referencia: aporta 0 y la cotización muestra que faltan costos; ese subtotal es provisional. El dock («Costos unitarios») muestra ese grupo con el campo vacío («Sin precio»), nunca con un precio de referencia. Los proyectos antiguos sin grupos conservan la resolución escalar.

### 3.2 Totales, margen y precio de lista

$$\text{Neto base} = \text{Paneles} + \text{Inversores} + \text{Baterías} + \text{Instalación}$$

$$\text{ITBIS base} = 0.18 \times (\text{Baterías} + \text{Instalación})$$

$$\text{Venta base} = (\text{Neto base} + \text{ITBIS base}) \times M_{venta}$$

$M_{venta}$ es `saleMarginMultiplier` (1.25 si falta); es un recargo sobre costo (1.25 = 25% sobre costo), no un margen sobre venta.

Ítems adicionales en la matriz:

$$\text{Venta ítems} = \sum_i (\text{costo}_i + \text{ITBIS}_i) \times \begin{cases} 1 & \text{si applyMargin} = \text{false} \\ M_{venta} & \text{en otro caso} \end{cases}$$

$$I_{lista} = \text{Venta base} + \text{Venta ítems}$$

$$\text{Total neto} = \text{Neto base} + \sum \text{costo ítems} + \text{ITBIS base} + \sum \text{ITBIS ítems}$$

### 3.3 Descuentos comerciales

Cada descuento es fijo (USD) o porcentual (0–100% sobre $I_{lista}$):

$$D_{total} = \min\left(I_{lista},\ \sum_i D_i\right), \qquad I_{final} = \max(0,\ I_{lista} - D_{total})$$

El costo de adquisición no cambia por un descuento. Rentabilidad real:

$$G = I_{final} - \text{Total neto}, \qquad \text{Recargo (\%)} = \frac{G}{\text{Total neto}} \times 100, \qquad \text{Margen sobre venta (\%)} = \frac{G}{I_{final}} \times 100$$

$$P_{watt} = \frac{I_{final}}{P_{dc} \times 1000} \quad [\text{USD/W}]$$

Destino del descuento: `general` no altera la base de la Ley 57-07; `equipment` la reduce (sección 4.2).

### 3.4 Porciones de equipos y mano de obra

$$\text{Venta equipos} = (\text{Paneles} + \text{Inversores} + \text{Baterías} + \text{ITBIS baterías}) \times M_{venta}$$

$$\text{Venta mano de obra} = (\text{Instalación} + \text{ITBIS instalación}) \times M_{venta}$$

## 4. Resumen financiero (`calculateFinancialSummary`)

### 4.1 Modo de precio e inversión bruta

- **Matriz de costos** (predeterminado en modo detallado): $I_{bruta} = I_{final}$ de la matriz.
- **Precio directo por W** (`pricingMode: 'direct_watt'`, o modo simple sin `pricingMode: 'cost_matrix'`). Solo se usa por elección manual: las propuestas automáticas fijan `AUTOMATED_PRICING` (`shared/automatedProposalPolicy.ts`: `isDetailed: false`, `pricingMode: 'cost_matrix'`) y el predeterminado de fábrica es la matriz. base $= P_{dc} \times 1000 \times P_{W}$, con $P_W$ = `specs.pricePerWattUSD`, si no `financials.pricePerWattUSD`, si no 1.13. El precio de lista suma los ítems adicionales y su ITBIS no exonerado, y los descuentos se recalculan sobre ese precio. `directPriceSurplusTarget` (`margin` o `labor`) decide cómo se reparte la diferencia respecto al costo en la matriz mostrada.
- `financials.customCostUSD > 0` sustituye la inversión en ambos modos.

**Ítems adicionales:** llevan $M_{venta}$ salvo `applyMargin === false`, tanto en la matriz de costos como en el total de precio directo y en el desglose de ITBIS (`appliesItemMargin` en `shared/financialRules.ts`). El ITBIS de un ítem se calcula sobre su precio de venta (`customItemsTaxBreakdown`); la exoneración la decide `isItemItbisExonerated` (`exonerateITBIS`, o el campo heredado `applyITBIS`, exonerado por defecto). El visor web usa las mismas funciones para enlaces antiguos sin `customItemsNonExoneratedITBISUSD`.

**Ítems ocultos en la factura:** `hideInQuotation: true` (ausente = visible) cobra el ítem con todas las reglas anteriores, pero `visibleQuotationItems` (`shared/quotationItems.ts`) lo excluye de las filas de «EQUIPOS Y MATERIALES» en el PDF, la vista de cotización y el visor web. Es solo presentación: el motor no lo lee y SUB-TOTAL, ITBIS, Ley 57-07 y precio por watt no cambian. Las ediciones de la IA y de los agentes que reescriben la lista completa conservan el flag por `id` (`preserveHiddenInQuotation`) salvo que envíen `false`.

### 4.2 Ley 57-07

**ITBIS exonerado** (si `applyITBISExemption`):

$$\text{ITBIS exonerado} = \text{ITBIS base} \times M_{venta} + \sum_{i \in \text{exonerados}} 0.18 \times \text{venta}_i$$

En precio directo, $M_{venta}$ es el multiplicador implícito (precio base / costo neto base). `customITBISSavedUSD > 0` sustituye el primer término. Si la exoneración está desactivada vale 0.

**Crédito fiscal del 40%** (si `applyLey5707`), solo sobre equipos (paneles, inversores y baterías), excluyendo mano de obra e ítems adicionales:

$$\text{Base equipos} = \max(0,\ \text{Venta equipos} - D_{equipos})$$

$$\text{Crédito Ley 57-07} = 0.40 \times \text{Base equipos}$$

$D_{equipos}$ es la suma de descuentos con destino `equipment`. `customLey5707CreditUSD` sustituye el cálculo. El crédito se aplica en tres cuotas anuales iguales (años 1 a 3).

### 4.3 Precio de contrato e inversión neta

$$\text{Precio de contrato} = \begin{cases} I_{bruta} & \text{con exoneración de ITBIS} \\ I_{bruta} + \text{ITBIS base} \times M_{venta} & \text{sin exoneración} \end{cases}$$

$$I_{neta} = \text{Precio de contrato} - \text{Crédito Ley 57-07}$$

(`financeEngine.ts:554-559`). Sin exoneración, `customITBISSavedUSD` también sustituye el término de ITBIS sumado. El crédito no es un descuento en la factura: el cliente lo recupera ante la DGII en tres años.

## 5. Flujo de caja

Desembolso del año 0: $CF_0 = \text{Precio de contrato}$.

Para $t = 1 \dots N$ (`projectLifespanYears`, entero; 25 si falta o es 0):

$$CF_t = S_{yr1} \times (1 - d)^{t-1} \times (1 + i)^{t-1} + \text{Crédito}_t - \text{Reemplazo}_t$$

- $d$ (`resolveAnnualDegradation`, `shared/assumptions.ts`): en modo detallado, `annualDegradation`. En modo simple, la degradación de los grupos de paneles del catálogo ponderada por potencia DC; si ningún grupo la trae, `annualDegradation`; si falta o está fuera de 0–5%, 0.4%. Un 0 explícito se respeta. Hasta 2.6.x el modo simple usaba siempre 0.5%, así que las propuestas simples existentes pueden ver un flujo de caja ligeramente distinto al recalcular (los enlaces publicados conservan su `calculationSnapshot`).
- $i$: `annualEnergyInflationPct` (3.5% si falta o es inválida; una inflación de 0% se respeta).
- $\text{Crédito}_t = \text{Crédito Ley 57-07}/3$ para $t \le 3$, si no 0.
- $\text{Reemplazo}_t$ = `batteryReplacementCostUSD` en el año `batteryLifespanYears` (entero; 10 si falta o es 0), solo con batería y costo positivo.

## 6. Indicadores

**Payback** (interpolación lineal en el primer año $k$ con acumulado $\ge 0$; 25 si no se alcanza):

$$\text{Payback} = (k - 1) + \frac{|\text{Acumulado}_{k-1}|}{CF_k}$$

**VAN** con $r$ = `discountRatePct` (12% si falta; un 0 es válido):

$$\text{VAN} = -CF_0 + \sum_{t=1}^{N} \frac{CF_t}{(1 + r)^t}$$

**TIR**: Newton-Raphson desde 15%, hasta 100 iteraciones, tolerancia $10^{-6}$:

$$r_{n+1} = r_n - \frac{\text{VAN}(r_n)}{\text{VAN}'(r_n)}, \qquad \text{VAN}'(r) = -\sum_{t=1}^{N} \frac{t \times CF_t}{(1 + r)^{t+1}}$$

**ROI**:

$$\text{ROI} = \frac{\sum_{t=1}^{N} CF_t - CF_0}{CF_0} \times 100$$

**CO₂ evitado** con $F_{CO_2}$ = `co2FactorKgPerKWh` (0.481 si falta):

$$\text{CO}_2 = \frac{E_{anual} \times F_{CO_2}}{1000} \quad [\text{t/año}]$$

## 7. Caso de referencia

`src/engine/referenceCase.ts` define `BENCHMARK_PROJECT` (38 paneles de 620 W = 23.56 kWp, 2 inversores de 8 kW, 3 baterías de 16 kWh, matriz de costos con $M_{venta}$ 1.25, `customITBISSavedUSD` 1770.46, consumo 3279 kWh/mes) y `validateReferenceCase()` comprueba en modo legacy:

| Métrica | Esperado | Tolerancia |
| --- | ---: | ---: |
| Capacidad DC | 23.56 kWp | ±0.1 |
| Inversión bruta | 25,371.12 USD | ±1.0 |
| Crédito Ley 57-07 | 7,785.38 USD | ±1.0 |
| ITBIS exonerado | 1,770.46 USD | ±1.0 |
| Payback | 2.3 años | ±0.8 |

En ese caso $I_{neta} = 25{,}371.12 - 7{,}785.38 = 17{,}585.74$ USD. Estas tolerancias se comprueban en `src/tests/testFinancialEngineComprehensive.ts` (TEST 16), que también cubre ítems adicionales, ITBIS, margen por defecto y descuentos.

```bash
npm test -- testFinancialEngineComprehensive
```

## 8. Entrada documental del asistente

Una hoja comercial aporta datos de entrada, no fórmulas: cantidades y costos USD, tasa DOP/USD, factor de venta, mano de obra y extras/descuentos. Los totales extraídos solo sirven para conciliar y no se vuelven a sumar. La tabla del asistente muestra el ITBIS de la matriz de costos del motor; no replica el tratamiento fiscal en la interfaz. El origen compra/venta debe estar claro antes de usar precios como costos.
