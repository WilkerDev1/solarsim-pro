# Tarifas en el flujo IA

## Fuentes y vigencia

La matriz de fábrica (`src/data/rdTariffs.ts`) es solo la referencia que se propone al crear o escanear una propuesta. Las propuestas guardan su tarifa escalar y no cambian cuando cambia la matriz; la matriz que cada usuario guarda en su equipo o cada organización en el servidor tampoco se reemplaza (al hidratar se conserva la guardada; la de fábrica solo llega a instalaciones nuevas, a «Restablecer» o cuando la nube no tiene pliego).

- **EDESUR, EDENORTE y EDEESTE**: tarifas de transición a aplicar en octubre-diciembre de 2026 de la [Resolución SIE-121-2026-TF](https://sie.gob.do/wp-content/uploads/2026/10/SIE-121-2026-TF.pdf) (art. 2, cuadro de la pág. 9; el art. 1 lo repite en la pág. 8). Cada EDE tiene sus propios valores. BTS-1 y BTS-2 llevan cuatro bloques; `baseEnergyRateDOP` es el precio del cuarto bloque. BTS-1 guarda además el cargo fijo por rango en `fixedChargeTiersDOP` (0–100 kWh y ≥101 kWh; `fixedChargeDOP` es el de ≥101 kWh). BTH y MTH guardan la potencia en punta y fuera de punta en `peakDemandChargePerKWDOP` y `offPeakDemandChargePerKWDOP`; `demandChargePerKWDOP` sigue siendo la de punta. Los tres campos son opcionales. El cargo fijo por rango entra en la facturación por bloques (`shared/tariffBilling.ts`); la potencia en punta y fuera de punta todavía no la lee nadie. La resolución no publica energía en punta/fuera de punta, así que la matriz ya no la trae. La retención del 25 % es la política histórica del producto, no un dato de la resolución.
- **CEPM**: pliego de septiembre de 2026 reconocido por la [Resolución SIE-147-2026-TF](https://sie.gob.do/wp-content/uploads/2026/11/SIE-147-2026-TF.pdf) (art. 1, pág. 5): RBT-1 22.90 RD$/kWh; RBT-2 14.00 RD$/kWh y 2,251.45 RD$/kW-mes; RMT-1 0.2789 US$/kWh (tarifa en dólares, sin potencia). La resolución no publica cargos fijos ni la tarifa ESTRBT-2 de CEB. Esos valores son los del catálogo anterior y quedan marcados por campo en `source.fieldSources` como «Catálogo anterior (no confirmado)». El contexto IA avisa de esas filas.

Una fecha de inicio no prueba que el pliego siga vigente. `buildAITariffContext` avisa cuando la fecha pasa del periodo de un pliego conocido (SIE-176-2025-TF: enero-marzo de 2026; SIE-121-2026-TF: octubre-diciembre de 2026; SIE-147-2026-TF: septiembre de 2026).

### Código de tarifa y tarifa de referencia

`shared/tariffRules.ts` es la única regla. `normalizeTariffCode` lleva cualquier forma escrita a la clave de la matriz: BTS-1, «BTS 1» y bts1 → BTS1; MTD-1 → MTD1; RBT1 → RBT-1. `tariffMatrixKey` añade los alias de CEPM (BTS1/BTS2 → RBT-1, BTD → RBT-2, MTD1/MTD2 → RMT-1). Lo usan el borrador de IA y del escáner de facturas (`shared/aiProposal.ts`), `resolveAITariffSelection`, `getReferenceEnergyRateUSD`, el nombre visible de la tarifa, el cambio de distribuidora y las ediciones del asistente.

`averageBlockEnergyRateDOP` calcula el precio medio de un consumo mensual con tarifa por bloques. Aplica los bloques escalonados, salvo en BTS-1 y BTS-2 con consumo de 701 kWh o más: ahí todos los kWh van al precio del cuarto bloque (SIE-121-2026-TF, art. 4.d, pág. 11). La usan la tarifa de referencia del dock, el borrador de IA y la factura por bloques del motor.

### Fila de facturación y procedencia del precio (fase 3)

Al fijar el precio de referencia (propuesta nueva, cambio de distribuidora o tarifa, «Aplicar tarifa oficial» o borrador de IA con `energyRateSource: 'reference'`), la propuesta guarda también la fila de su tarifa (`rates.billingTariff`, `referenceBillingTariff` en `src/data/rdTariffs.ts`: tramos, cargo fijo o por rango y resolución) y `rates.energyRateSource: 'reference'`. Solo con una fila exacta: un código desconocido o una tarifa en US$ no guarda fila. En el régimen `sie007_2026` esas propuestas se facturan por bloques ([especificación financiera, §1.3.0](FINANCIAL_ENGINE_SPECIFICATION.md)). Un precio de factura queda como `invoice`, uno tecleado como `manual` (también en el dock y en las ediciones de agentes, por `applyProjectEdit`): ambos se valoran con el escalar. Cambiar después la matriz no cambia la fila guardada.

### Cargo por uso de la red (SIE-007-2026)

El cargo de fábrica en RD$/kWh inyectado vive con los supuestos, no en la matriz de la organización: `FACTORY_GRID_USE_CHARGES` en `shared/netMetering.ts`, con resolución y periodo (EDESUR 3.78, EDENORTE 4.02 y EDEESTE 3.88 de la SIE-121-2026-TF, art. 9; CEPM 5.73 de la SIE-147-2026-TF, art. 2; verificados en las tablas de las resoluciones). `buildAITariffContext` lo devuelve en `gridUseCharges` (también `get_tariffs`). Solo aplica a las tarifas de un solo precio (`tariffChargeKind`); 0 con potencia o inyección cero; las tarifas sin clasificar lo pagan (criterio conservador). Es un valor estimado, no verificado con facturas.

El borrador de IA nuevo nace en el régimen `sie007_2026` con el cargo de fábrica de su distribuidora. El esquema (`PROPOSAL_JSON_SCHEMA`) admite `netMeteringRegime` (`legacy_retention` | `sie007_2026`) y `gridUseChargeDOPPerKWh` (0–100) solo si el usuario los indica; un valor no válido se ignora con aviso (`invalid_net_metering_regime`, `invalid_grid_use_charge`). Un borrador sobre una propuesta existente no cambia su régimen salvo que lo indique. Las herramientas de agentes los aceptan en `create_proposal` y en `propose_project_update` (sección `rates`, validados en `src/features/assistant/validation.ts`). El escáner de resoluciones todavía no extrae el cargo (fase siguiente).

## Propuestas y extracción

`buildAITariffContext(matrix, now?)` entrega únicamente códigos, monedas, cargos, bloques y fuente, ordenados; omite descripciones extensas y aliases duplicados. `resolveAITariffSelection` acepta una fila disponible o devuelve `null`: una distribuidora o código desconocido no se convierte silenciosamente en BTS2. Los aliases CEPM históricos se resuelven explícitamente.

La IA extrae la distribuidora y el código desde los datos. Las tasas documentadas de factura y las tasas de referencia se distinguen durante la revisión. El total de factura incluye cargos distintos de energía: dividirlo por consumo no demuestra el precio de energía. El motor existente calcula el promedio por bloques y convierte DOP a USD usando la tasa del proyecto. Se corrigió la anchura continua de bloques impresos inclusivos (por ejemplo, 0–100 y 101–200) y la resolución de aliases CEPM sobre la fila canónica actual; no se añadió ahorro automático sobre cargo fijo o potencia.

Las propuestas conservan sus importes escalares y su fila de facturación guardada; cambiar el pliego no reescribe propuestas existentes. La matriz global es una ayuda de referencia para crear/revisar la propuesta, no un reemplazo de los datos históricos del documento.

El escáner de resoluciones usa un borrador **parcial**. Exige resolución, fecha válida, emisor, moneda y cargos de energía/fijo explícitos. Rechaza números negativos/no finitos, porcentajes fuera de rango y bloques con huecos/superposición o sin último tramo abierto. Solo se actualizan las filas presentes, sobre la matriz actual del usuario. Las demás retienen su fuente individual `UtilityTariffDetails.source`. En una fila actualizada parcialmente, demanda, bloques y cargos omitidos permanecen con su procedencia anterior en `source.fieldSources`; los campos leídos reciben la procedencia nueva. Esa distinción se conserva tras JSON y extracciones posteriores. Para una fila extraída, `source.fields` indica los campos efectivamente documentados; una retención omitida conserva la política configurada, no se atribuye al nuevo pliego como un dato extraído. Cargos opcionales ausentes no se inventan ni se copian de otra moneda.

El modal requiere contraste explícito con el documento antes de aplicar. Cambiar archivo/cerrar/cambiar sesión cancela o descarta la extracción anterior; aplicar un borrador sobre un pliego local modificado exige volver a escanear. Sincronización usa el transporte de sesión ya existente y descarta respuestas de otra generación/organización; una descarga no pisa modificaciones locales que ocurrieron durante la solicitud.

## Transporte y persistencia

El escáner comparte `shared/geminiTransport.ts`: clave por `x-goog-api-key`, identificador de modelo validado, timeout/AbortSignal y como máximo dos intentos solo ante errores transitorios; no encadena peticiones con 401/403/429. Modelos y deprecaciones se contrastan con [Google](https://ai.google.dev/gemini-api/docs/deprecations/); se retiró la cascada antigua 1.5/2.0 de este servicio.

JSON transforma `Infinity` en `null`; `normalizeStoredTariffMatrix` restaura exclusivamente el bloque final sin límite con validación. Hidratación y descarga usan ese adaptador para conservar cálculos de consumos superiores a 700 kWh. Una matriz local inválida se conserva con aviso para revisión, sin borrar silenciosamente personalizaciones. El cero explícito se respeta al resolver la tasa de referencia. Las etiquetas de tarifas no incluyen precios estáticos que contradigan una matriz actualizada.

## Verificación

`src/tests/testAITariffSafety.ts` cubre extracción parcial, procedencia de filas conservadas, moneda/fecha/bloques inválidos, retención y tasas cero, contexto determinista sin duplicados, round-trip real serialización/hidratación con 2,000 kWh, key fuera de URL, rechazo sin cascada de credenciales inválidas, parse de respuesta Gemini, descarga contra edición concurrente y descarte por cambio de sesión. Todo usa datos sintéticos y red simulada; no escribe en producción ni consume llamadas Gemini.

Queda como límite del backend actual el reemplazo de la matriz por organización mediante `/api/tariffs/sync`: no tiene control CAS de esa matriz. La validación y preservación del cliente no equivalen a control concurrente entre administradores distintos. La revisión de contrato/migración del backend debe ser una entrega coordinada con todos los clientes antes de volverlo obligatorio.
