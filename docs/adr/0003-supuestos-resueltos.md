# ADR 0003: Supuestos resueltos en un solo módulo

Estado: aceptado. Términos en el [glosario](../../GLOSSARY.md). Continúa los ADR [0001](0001-equipment-model-sin-espejo.md) y [0002](0002-banco-de-baterias.md).

## Contexto

Los valores por defecto de los supuestos de una propuesta (tasa de cambio, pérdidas, inflación de la energía, tasa de descuento, vida del proyecto, cobertura, retención de exportación, vigencia, degradación, año de reemplazo de batería, $/W, margen, mano de obra) estaban escritos como literales en más de veinte archivos: motor solar y financiero, modelos del PDF, visor (Worker), borradores de IA, importación, proyecto nuevo, dock y ajustes. Además se mezclaba `||` (un 0 pasa al default) con `??` (un 0 se conserva) sobre el mismo campo, y los sitios no coincidían:

- El resumen ejecutivo del PDF mostraba pérdidas de 25 % en modo detallado cuando el motor usa 14 (`resolveSystemLossesPct`), y tomaba la tasa de `rates.usdExchangeRate` antes que `specs.dopExchangeRate`, que es la que usa la matriz de costos.
- El motor financiero convertía una inflación de 0 % en 3,5 % (`|| 3.5`) y, sin vida del proyecto o sin tasa de descuento, producía un flujo vacío o un VAN `NaN`.
- Los defaults de una propuesta de IA (60,5 en el formulario, 60 en el normalizador) y de una importada (`|| 12`, `|| 25`) no coincidían con los de un proyecto nuevo.
- Los ajustes del usuario (`DefaultSimulationSettings`) y las constantes compartidas duplicaban los mismos números (7, 95, 25, 3,5, 12…).

## Decisión

1. **Un módulo.** `shared/assumptions.ts` (TypeScript puro; lo compilan el cliente, el servidor con NodeNext y el Worker) es el único dueño de los defaults y de la regla de validez.
   - `resolveAssumptions(proyecto)` devuelve un objeto tipado con los 14 valores efectivos: `dopExchangeRate`, `systemLossesPct`, `annualEnergyInflationPct`, `discountRatePct`, `projectLifespanYears`, `targetCoveragePct`, `gridExportFeePct`, `quoteValidityDays`, `annualDegradationPct`, `batteryReplacementYear`, `pricePerWattUSD`, `saleMarginMultiplier`, `installationUsdPerKwp`, `co2FactorKgPerKWh`.
   - `resolveAssumption(clave, ...candidatos)` es la versión de un solo campo (primer candidato válido, si no el default). Los `resolve*` de `shared/projectDefaults.ts` (`resolveDopRate`, `resolveSaleMarginMultiplier`, `resolvePricePerWattUSD`, `resolveSystemLossesPct`) son envoltorios finos de la misma tabla; `resolveAnnualDegradationPct` del motor también.
   - Lo leen el motor solar y el financiero, el resumen ejecutivo del PDF, los textos dinámicos, la pestaña de cotización y de retorno, el visor (Worker), el slice y el hook de IA, los borradores y el normalizador de IA. El servidor no lee ningún supuesto.
   - El impuesto (ITBIS, Ley 57-07) y los literales de peso en kilos de la matriz quedan fuera: el primero es el candidato #5; los segundos no son supuestos del proyecto.
2. **Rango por campo, en una tabla** (`ASSUMPTION_RULES`: default, máximo y si el 0 cuenta como falta). Ausente, no finito o fuera de rango ⇒ default.
   - El 0 explícito se respeta en inflación, tasa de descuento, pérdidas, degradación y mano de obra (y en la retención de exportación, porque «sin retención» se guarda como 0).
   - El 0 equivale a «sin dato» en tasa de cambio, vida del proyecto, vigencia, cobertura objetivo, $/W, margen y año de reemplazo.
3. **Precedencia.** Un dato que falta en una propuesta GUARDADA se resuelve a la constante compartida, nunca a los ajustes del usuario: la misma propuesta da las mismas cifras en cualquier equipo, en el Worker y en cualquier servidor. Los ajustes (`DefaultSimulationSettings`) solo siembran propuestas NUEVAS. No hay migración de datos: la resolución ocurre al leer. Cadenas: cambio = `specs.dopExchangeRate` → `rates.usdExchangeRate` → 60; $/W = `specs` → `financials` → 1,13; pérdidas = las del proyecto → 14 (modo detallado) o 25 (simple); degradación = grupos de paneles ponderados (modo simple) → la configurada → 0,4.
4. **Fábrica única.** `assumptionFields(existente?, ajustes?)` arma los campos de supuestos de un proyecto: el dato del proyecto si existe, si no el ajuste del usuario (solo proyecto nuevo y borrador de IA), si no la constante. La usan `createNewProject`, la importación de `.json` y `createAIProposalBase`. `DEFAULT_SIMULATION_SETTINGS` toma sus valores de las constantes compartidas. Invariante probado: un proyecto nuevo con los ajustes de fábrica es igual, tras resolver, a un archivo importado vacío (`testAssumptionsFactory`). Para ello un archivo sin modo es simple (como un proyecto nuevo) y no hereda del caso de referencia el modo detallado, el 14 % de pérdidas ni el 0,5 % de degradación.
5. **Correcciones del PDF.** El resumen ejecutivo toma pérdidas y tasa de cambio de `resolveAssumptions`, es decir, las mismas del motor: 14 % en modo detallado sin pérdidas; tasa de `specs.dopExchangeRate`, con `rates.usdExchangeRate` de respaldo.
6. **Guarda.** `testNoAssumptionDefaultLiterals` falla ante `|| 3.5`, `?? 25`, `= 60`… sobre un campo de supuesto fuera de `shared/assumptions.ts` y de los ajustes de fábrica. Es una heurística (literal conocido + nombre de campo en la misma línea) con una lista de excepciones justificadas: vigencia del enlace compartido, vida útil por grupo del formato heredado, degradación de equipos del catálogo, tarifa base en RD$.

## Impacto en producción

Revisión de las 51 propuestas de producción antes del cambio:

- 0 tienen un 0 explícito en inflación, descuento, pérdidas, degradación, mano de obra, cambio, vida, vigencia, cobertura, $/W o margen. Por eso el único cambio de comportamiento pensado sobre datos reales es que una inflación de 0 % ahora se respeta (antes pasaba a 3,5 %); ninguna propuesta existente lo usa.
- 0 propuestas tienen valores distintos en `specs.dopExchangeRate` y `rates.usdExchangeRate`, y 0 son modo detallado sin pérdidas, de modo que las dos correcciones del PDF no cambian ningún documento existente.
- 9 propuestas antiguas dependen de los defaults (les faltan inflación, retención, cobertura o vigencia). Siguen dando exactamente las mismas cifras, porque la constante compartida es el valor que el motor ya usaba.

Cambios de comportamiento (cada uno cubierto en `testResolvedAssumptions`, que se escribió antes del refactor y fija el resto):

- Inflación 0 % explícita se respeta.
- El PDF muestra pérdidas de 14 % en modo detallado sin pérdidas, y su tasa de cambio sale de `specs.dopExchangeRate`.
- Sin vida del proyecto (o con 0) el flujo usa 25 años y sin tasa de descuento usa 12 %; antes el flujo quedaba vacío y el VAN en `NaN`/-inversión.
- Con la tasa de cambio solo en `rates`, la matriz de costos la usa (antes usaba 60).
- Degradación sin dato en modo simple: 0,4 % (el de los ajustes de fábrica); antes el motor usaba 0,5 %. Una propuesta guardada siempre trae el campo.
- El dock muestra el valor efectivo que usa el cálculo, resuelto sobre el proyecto completo (tasa DOP/USD con `rates` de respaldo, cobertura, retención, mano de obra, margen, descuento, degradación); una cobertura de 0 o fuera de rango dimensiona los paneles con 95 % (antes 1 %) en el dock, el borrador de IA y su normalizador. `testDockEffectiveAssumptions` lo comprueba para cada campo.
- Un valor fuera del rango de la tabla (por ejemplo, pérdidas de 120 %) cae al default. Los conteos de años y días (vida del proyecto, año de reemplazo de batería, vigencia) deben ser enteros: una fracción cae al default, porque el flujo itera años enteros (0 de 51 propuestas tienen fracciones).
- Propuestas de IA nuevas toman la vigencia de los ajustes (antes 7 días fijos) y el cambio 60 (antes 60,5 en el formulario).

## Consecuencias

- Cambiar un default o un rango toca una tabla; los tres consumidores (cliente, Worker, servidor) lo ven igual.
- Las constantes `DEFAULT_*` de supuestos se re-exportan desde `shared/projectDefaults.ts` y `dockDefaults.ts`; el código existente que las importa no cambia.
- Pendiente fuera de este ADR: el margen objetivo de los ajustes (28 %) siembra solo las propuestas de IA, mientras que un proyecto nuevo parte del multiplicador 1,25; `installationUnitPriceUSD ?? 0` del contexto de IA y los pesos en kilos de la matriz no se tocaron.
