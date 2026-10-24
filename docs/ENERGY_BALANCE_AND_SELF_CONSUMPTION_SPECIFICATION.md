# Balance de energía, autoconsumo físico y despacho BESS

Alcance: este documento describe el **modelo físico opcional** (`calculationMode = 'self_consumption'`) de `calculateMonthlySolarProduction` en `src/engine/solarEngine.ts`. El modelo predeterminado es **legacy** (autoconsumo = min(C, 0.75·G) sin batería o min(C, 0.90·G) con batería); ver [FINANCIAL_ENGINE_SPECIFICATION.md](FINANCIAL_ENGINE_SPECIFICATION.md#13-autoconsumo-exportación-y-ahorro) y [APPLICATION_FEATURES.md](APPLICATION_FEATURES.md) para política y visibilidad. La proyección física se activa con la función `selfConsumptionProjection` de `shared/applicationFeatures.ts` (desactivada por defecto).

## 1. Motivación

Con medición neta, la retención configurada (`gridExportFeePct`, 25% por defecto) se aplica solo a la energía exportada. Un kWh autoconsumido vale el 100% de la tarifa; uno exportado se acredita al 75%. Por eso el modelo físico separa la energía consumida en sitio (directa o vía batería) de la que sale a la red.

## 2. Algoritmo mensual

El motor usa un día representativo por mes ($D_m$: 31, 28, 31, 30, ...).

### 2.1 Partición de carga

$$C_{diario} = \frac{C_m}{D_m}, \qquad L_{dia} = C_{diario} \times R_{diurno}, \qquad L_{noche} = C_{diario} - L_{dia}$$

$R_{diurno}$ (ventana 8:00–17:00) se toma de `daytimeLoadRatio`, si no de `daytimeSelfConsumptionRatio`, si no de `getRecommendedLoadProfile` y se limita a 15%–95%:

- Residencial (códigos `BTS*`, `RBT`, `RESID`): 35%.
- Comercial (`BTD*`, `CBT`, `VMT1`, `COMER`): 75%.
- Industrial (`MTD*`, `MTH*`, `ATD*`, `CMT`, `VMT2`, `VMT3`, `INDUS`): 90%.
- Sin tarifa reconocida: por consumo promedio mensual (≤1500 kWh residencial, ≤15000 comercial, mayor industrial); por defecto residencial.

### 2.2 Solar directo

$$P_{diario} = \frac{E_m}{D_m} = P_{dc} \times \text{HSP}_m \times (1 - L_{sys})$$

$L_{sys}$ = `systemLosses`; si falta, 14% en modo detallado y 25% en modo simple.

$$E_{directo} = \min(P_{diario}, L_{dia}), \qquad E_{excedente} = \max(0, P_{diario} - E_{directo})$$

### 2.3 Batería

$$E_{bat,util} = C_{nominal} \times \frac{\text{DoD}}{100} \times \frac{\eta}{100}$$

con el DOD y la eficiencia de cada grupo de baterías (`dodPct` y `efficiencyPct`; 90 y 90 si faltan en este motor). $C_{nominal}$ es la suma de capacidad × cantidad de los grupos de baterías. Solo aplica con `hasBattery` y capacidad positiva.

En régimen diario estacionario la batería solo puede recargar lo que descargó la noche anterior:

$$E_{ciclo} = \min(E_{excedente},\ E_{bat,util},\ L_{noche}), \qquad E_{carga} = E_{descarga} = E_{ciclo}$$

### 2.4 Autoconsumo y exportación

$$E_{auto,m} = \min\big(C_m,\ \min(E_m,\ (E_{directo} + E_{descarga}) \times D_m)\big)$$

$$E_{exp,m} = \max(0, E_{excedente} - E_{carga}) \times D_m$$

con la restricción $E_{auto,m} + E_{exp,m} \le E_m$ (si se supera, $E_{exp,m} = E_m - E_{auto,m}$). En inyección cero (`isZeroExport`), $E_{exp,m} = 0$ y la retención es 0.

$$E_{net\_credit,m} = E_{exp,m} \times \left(1 - \frac{F_{grid}}{100}\right), \qquad E_{retenida,m} = E_{exp,m} - E_{net\_credit,m}$$

### 2.5 Ahorro

$$E_{ahorro,m} = E_{auto,m} + E_{net\_credit,m}, \qquad \text{USD}_m = E_{ahorro,m} \times T_{kWh}$$

El ahorro anual alimenta el mismo flujo de caja, VAN, TIR y payback del motor financiero.

## 3. Ejemplo: utilidad de la batería según la partición diurna

Ejemplo ilustrativo: 13 paneles de 630 W (8.19 kWp), Santo Domingo / Distrito Nacional, pérdidas 25% (11,844 kWh/año), 2 baterías de 5.12 kWh con DoD 90% y η 95% (8.76 kWh útiles/día), consumo 853 kWh/mes (≈28.4 kWh/día en un mes de 30 días), retención 25% y tarifa 0.18 USD/kWh.

Ciclo diario aproximado en un mes de 30 días:

| $R_{diurno}$ | $L_{dia}$ | $L_{noche}$ | Ciclo BESS | Capacidad útil sin ciclar |
| --- | ---: | ---: | ---: | ---: |
| 35% | 9.9 kWh | 18.5 kWh | 8.8 kWh | 0% |
| 67% | 19.1 kWh | 9.4 kWh | 8.8 kWh | 0% |
| 80% | 22.7 kWh | 5.7 kWh | 5.7 kWh | ~35% |
| 95% | 27.0 kWh | 1.4 kWh | 1.4 kWh | ~84% |

Resultados anuales del motor (`calculateMonthlySolarProduction`, modo `self_consumption`):

| $R_{diurno}$ | Autoconsumo | Aporte BESS | Exportación | Crédito neto | Ahorro | Ahorro USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 35% | 6,779 kWh | 3,196 kWh | 5,065 kWh | 3,799 kWh | 10,578 kWh | 1,903.9 |
| 67% | 10,054 kWh | 3,196 kWh | 1,790 kWh | 1,343 kWh | 11,397 kWh | 2,051.4 |
| 80% | 10,236 kWh | 2,047 kWh | 1,608 kWh | 1,206 kWh | 11,442 kWh | 2,059.5 |
| 95% | 10,236 kWh | 512 kWh | 1,608 kWh | 1,206 kWh | 11,442 kWh | 2,059.5 |

Por encima de aproximadamente 67–69% de carga diurna, la batería deja de ciclar su capacidad completa porque la demanda nocturna es menor que su capacidad útil. En este ejemplo el ahorro se estabiliza (el consumo queda cubierto al 100% con solar directo y batería), pero la capacidad de batería adicional ya no aporta valor.

## 4. Presentación

Con la función desactivada (legacy) se muestran la gráfica de consumo/producción y la tabla de 5 columnas (Mes, Consumo, Producción, Ahorro facturable, % Cobertura), y el aporte BESS es 0. Con la función activa se muestran además autoconsumo, inyección y la curva de autoconsumo; la opción visual por proyecto (`showSelfConsumptionBreakdown` / `showSelfConsumptionInProposal`) puede ocultar el desglose sin cambiar el modelo de cálculo.

## 5. Archivos relacionados

- [src/engine/solarEngine.ts](../src/engine/solarEngine.ts): producción, partición y despacho BESS.
- [src/engine/financeEngine.ts](../src/engine/financeEngine.ts): flujo de caja, Ley 57-07 e indicadores.
- [src/components/simulator/sidebar/RatesParamsSection.tsx](../src/components/simulator/sidebar/RatesParamsSection.tsx): control de partición diurna.
- [src/components/simulator/tabs/EnergyAnalysisTab.tsx](../src/components/simulator/tabs/EnergyAnalysisTab.tsx): gráfica y tabla.
- [src/components/pdf/pages/PDFPage1Energy.tsx](../src/components/pdf/pages/PDFPage1Energy.tsx): página de energía del PDF.
- [src/tests/testEnergyBalanceTransparency.ts](../src/tests/testEnergyBalanceTransparency.ts): pruebas de balance y conservación.
