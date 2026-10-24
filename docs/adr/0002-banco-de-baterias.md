# ADR 0002: Banco de baterías como módulo único

Estado: aceptado. Términos en el [glosario](../../GLOSSARY.md). Continúa el [ADR 0001](0001-equipment-model-sin-espejo.md).

## Contexto

La energía útil del banco (`capacidad total × DOD × eficiencia`) se calculaba por separado en tres sitios: el motor solar (`solarEngine`), el motor financiero (`financeEngine`, que además calcula la autonomía) y la vista previa del perfil de carga (`loadProfilePreview`). Los ponderados de DOD y eficiencia vivían en `shared/projectDefaults` (`resolveBatteryBank*`) y el armado del banco en `batteryBankSpecs`. Los tres sitios no coincidían en dos detalles:

- el motor solar y la vista previa daban «sin almacenamiento» con un banco de 0 kWh, pero el motor financiero, con «Sí batería», recurría a la capacidad del primer grupo (`bank.batteries[0]?.capacityKWh`) y mostraba energía útil y autonomía;
- el motor financiero redondeaba la energía útil a 0,1 kWh y los otros dos no.

## Decisión

1. `shared/equipment/battery.ts` (exportado por `shared/equipment`) es el único lugar que calcula la energía útil y la autonomía:
   - `batteryBank(equipment)` devuelve `{ hasStorage, nominalKWh, dodPct, efficiencyPct, usableKWh }`. No recibe `hasBattery`: `readEquipment` ya entrega `batteries: []` con «Sí batería» apagado y un banco vacío no almacena.
   - `nominalKWh` es `equipmentTotals(...).batteryNominalKWh` (2 decimales), el mismo total que usaban los motores, para que los resultados no cambien un bit.
   - El DOD pesa por capacidad × cantidad del grupo; la eficiencia, por capacidad × cantidad × DOD, de modo que `nominal × DOD × η` conserva Σ(Cᵢ·DODᵢ·ηᵢ). Cada grupo usa `resolveBatteryDodPct`/`resolveBatteryEfficiencyPct` (dato ausente o fuera de 1-100: 90 %). Sin capacidad, el banco informa el DOD y la eficiencia del primer grupo (o los defaults).
   - `batteryAutonomyHours(bank, dailyLoadKWh)` divide la energía útil (a 0,1 kWh, como el resumen financiero) entre la carga horaria y redondea a 0,1 h; sin almacenamiento o sin carga, 0. El llamador decide la carga diaria (el motor financiero usa el consumo anual ÷ 365, o 100 kWh/día sin consumo).
2. Se eliminan `batteryBankSpecs`, `resolveBatteryBankDodPct`, `resolveBatteryBankEfficiencyPct` y `resolvePrimaryBattery*`. El dock, que muestra y edita el grupo 0, usa `resolveBatteryDodPct(grupos[0]?.dodPct)` directamente.
3. Alcance: energía útil y autonomía. El reemplazo del año 10 sigue en el flujo de caja financiero.
4. Una prueba (`testNoBatteryFormulaCopies`) falla ante una copia de la conversión `dodPct / 100` o `eficiencia / 100` fuera del módulo.

## Cambio de comportamiento (único)

«Sí batería» con un banco de 0 kWh (por ejemplo, cantidad 0) significa **sin almacenamiento en todas partes**: energía útil 0 kWh y autonomía 0 h. Antes el motor financiero informaba la energía útil y la autonomía de la capacidad del primer grupo (por ejemplo, un grupo de 10 kWh × 0,8 × 0,8 con cantidad 0 daba 6,4 kWh y 1,4 h). El motor solar y la vista previa ya daban 0, así que el resumen financiero deja de contradecirlos. Se quita el respaldo del primer grupo, no se conserva.

Impacto en producción: 0 de 26 propuestas tienen un banco de baterías con «Sí batería» y cantidad 0, de modo que ninguna propuesta existente cambia su resultado. El resto de la matriz (un grupo, grupos mixtos, DOD/eficiencia ausentes o inválidos, espejo heredado, capacidades fraccionarias) se fijó con una prueba de caracterización escrita antes del refactor (`testBatteryBankModule`) y no cambia.

## Consecuencias

- Un solo lugar para auditar la fórmula; cambiarla (por ejemplo, un modelo de degradación del banco) toca un archivo.
- El redondeo a 0,1 kWh sigue siendo del resumen financiero (presentación); el motor solar y la vista previa usan la energía útil sin redondear, como antes.
