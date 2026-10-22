# Especificación del motor financiero

Contrato matemático implementado en `src/engine/financeEngine.ts` (`calculateCostMatrixSummary`, `calculateFinancialSummary`, `calculateProjectFinancialSummary`) y, para la energía, `src/engine/solarEngine.ts`. Describe el comportamiento actual del código; no es una validación jurídica de la normativa. Antes de cambiar fórmulas, revisar este documento y [ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md](ENERGY_BALANCE_AND_SELF_CONSUMPTION_SPECIFICATION.md).

Todos los importes se calculan en USD; DOP se obtiene con la tasa `dopExchangeRate` (60 si falta). La mayoría de los resultados se redondean a 2 decimales.

## 1. Generación y balance energético

### 1.1 Capacidad DC

$$P_{dc} = \frac{\sum (P_{panel} \times N_{paneles})}{1000} \quad [\text{kWp}]$$

Con varios grupos de paneles se suman todos los grupos.

### 1.2 Producción mensual

$$E_{m} = P_{dc} \times \text{HSP}_{m} \times D_{m} \times (1 - L_{sys})$$

- $\text{HSP}_m$: horas solar pico de la provincia (`src/data/rdProvinces`) o vector personalizado de 12 valores positivos.
- $D_m$: días del mes (febrero = 28).
- $L_{sys}$: `systemLosses`; si falta, 14% en modo detallado y 25% en modo simple.

$$E_{anual} = \sum_{m=1}^{12} E_{m}$$

### 1.3 Autoconsumo, exportación y ahorro

El modo de cálculo se pasa explícitamente a los motores; si se omite se usa **legacy**, que es el predeterminado. La proyección física es opcional (función `selfConsumptionProjection` en `shared/applicationFeatures.ts`) y se describe en el documento de balance energético.

Modo legacy, por mes:

$$E_{auto,m} = \min\left(C_m,\ E_m \times k\right), \quad k = \begin{cases} 0.90 & \text{con batería} \\ 0.75 & \text{sin batería} \end{cases}$$

$$E_{exp,m} = \begin{cases} 0 & \text{inyección cero} \\ \max(0,\ E_m - E_{auto,m}) & \text{medición neta} \end{cases}$$

En ambos modos, la retención (`gridExportFeePct`, 25 si falta; 0 en inyección cero) se aplica solo a la energía exportada:

$$E_{net\_credit,m} = E_{exp,m} \times \left(1 - \frac{F_{grid}}{100}\right)$$

$$E_{saved,m} = E_{auto,m} + E_{net\_credit,m}, \qquad S_m = E_{saved,m} \times T_{kWh}, \qquad S_{yr1} = \sum_{m} S_m$$

$T_{kWh}$ es `energyCostPerKWh` del proyecto.

### 1.4 Factura y cobertura

$$\text{Factura original}_m = C_m \times T_{kWh}, \qquad \text{Factura neta}_m = \max(0,\ \text{Factura original}_m - S_m)$$

$$\text{Cobertura (\%)} = \frac{E_{anual}}{\sum_m C_m} \times 100$$

La cobertura no se limita al 100%; es 0 si el consumo anual es 0.

## 2. Almacenamiento

Capacidad útil y autonomía informadas en el resumen financiero:

$$E_{bat,util} = C_{nominal} \times \frac{\text{DoD}}{100} \times \frac{\eta}{100}$$

con `batteryDOD` (80 si falta) y `batteryEfficiencyPct` (92 si falta). El despacho físico de `solarEngine.ts` usa sus propios valores por defecto (90/90); ver el documento de balance energético.

$$L_{prom} = \frac{E_{consumo\_anual}}{365 \times 24}, \qquad T_{autonomía} = \frac{E_{bat,util}}{L_{prom}} \quad [\text{h}]$$

Si el consumo anual es 0 se asume 100 kWh/día para el promedio.

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

Con grupos multi-equipo, cada grupo usa su propio `unitPriceUSD`. Un grupo sin precio no hereda el de otro modelo ni un precio de referencia: aporta 0 y la cotización muestra que faltan costos; ese subtotal es provisional. Los proyectos antiguos sin grupos conservan la resolución escalar.

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

Para $t = 1 \dots N$ (`projectLifespanYears`):

$$CF_t = S_{yr1} \times (1 - d)^{t-1} \times (1 + i)^{t-1} + \text{Crédito}_t - \text{Reemplazo}_t$$

- $d$ (`resolveAnnualDegradationPct`): en modo detallado, `annualDegradation`. En modo simple, la degradación de los grupos de paneles del catálogo ponderada por potencia DC; si ningún grupo la trae, `annualDegradation`; si falta, 0.5%. Hasta 2.6.x el modo simple usaba siempre 0.5%, así que las propuestas simples existentes pueden ver un flujo de caja ligeramente distinto al recalcular (los enlaces publicados conservan su `calculationSnapshot`).
- $i$: `annualEnergyInflationPct` (3.5% si falta).
- $\text{Crédito}_t = \text{Crédito Ley 57-07}/3$ para $t \le 3$, si no 0.
- $\text{Reemplazo}_t$ = `batteryReplacementCostUSD` en el año `batteryLifespanYears` (10 si falta), solo con batería y costo positivo.

## 6. Indicadores

**Payback** (interpolación lineal en el primer año $k$ con acumulado $\ge 0$; 25 si no se alcanza):

$$\text{Payback} = (k - 1) + \frac{|\text{Acumulado}_{k-1}|}{CF_k}$$

**VAN** con $r$ = `discountRatePct`:

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
