# ADR 0009: Fábrica única de propuesta nueva, dimensionado y propuesta incompleta

Estado: aceptado (F2b del asistente único). Continúa los ADR [0003](0003-supuestos-resueltos.md) (supuestos resueltos) y [0004](0004-edicion-de-proyecto.md) (edición de proyecto; la mudanza de las reglas del dock al dominio está en su apartado «Reglas del dock en el dominio (F2b)»). Términos en el [glosario](../../GLOSSARY.md).

## Contexto

La caracterización de F0 (`testProposalCreationDefaultsCharacterization`) mostró tres fábricas con valores distintos:

- **«Nueva simulación»** (`createNewProject`) partía del caso de referencia del Centro Médico: factor 1,25 fijo (ignoraba el «Margen bruto objetivo» de Ajustes), mano de obra 170 USD/kWp, las coordenadas, la empresa «Cliente Comercial», 38 paneles con el precio del caso (103,32), un inversor a 2.300, tres baterías Hinaess y 3.279 kWh/mes.
- **El asistente de propuestas y `create_proposal`** (`createAIProposalBase`) usaban mano de obra 0, factor 1,28 (margen objetivo de fábrica 28 %) y forzaban la matriz de costos, y no creaban sin consumo.
- **Duplicar** copia la original (no es una fábrica de contenido).

La revisión del plan añadió que pasar los errores a avisos dejaría al motor rellenar (con el consumo vacío asume 36.000 kWh/año; un equipo sin precio cuenta 0 y el retorno sale ≈0), y que los supuestos de dimensionado no podían ser números sueltos (B3, B4, B5, M3, M6, M10).

## Decisión

### 1. Una sola fábrica, pura

`createNewProposal` (`src/domain/newProposal.ts`) crea la propuesta sin store, reloj ni generador de ids (los recibe: id, fecha, secuencia, usuario, servidor). La usan «Nueva simulación», `createAIProposalBase` (asistente de propuestas, `apply_proposal_draft`, `create_proposal` del asistente flotante y del MCP local) y, para la identidad y la sincronización, duplicar y el borrador de IA (`newProposalIdentity`). Valores, declarados en `NEW_PROPOSAL_DEFAULTS` e iguales por todos los caminos:

| Valor | Decisión |
| --- | --- |
| Consumo sin datos | 1.000 kWh/mes los doce meses, **estimado** |
| Factor de venta | «Margen bruto objetivo» de Ajustes; su valor de fábrica pasa de 28 % a **40 % (1,40)** |
| Mano de obra | **170 USD/kWp** (la constante compartida de ADR 0003) |
| Tarifa | La de referencia de la distribuidora elegida **a ese consumo**, con su fila (factura por bloques); una tarifa fuera de la matriz no recibe precio |
| Tarifa típica | La de Ajustes, mapeada a la distribuidora elegida como lo hace el dock (`mapTariffCodeOnDistributorChange`) |
| Datos del ejemplo | Ninguno: ni coordenadas, ni empresa, dirección, teléfono o datos de factura, ni equipos o baterías del caso de referencia |
| Equipos | `chooseCatalogEquipment`: el modelo de Ajustes si el catálogo le da precio; si no, el de oferta preferida; si no, el más barato en stock (por W, kW o kWh, sin agotados); sin ofertas, el de precio genérico (señalado); sin nada, el modelo de Ajustes **sin precio** |
| Batería | La de Ajustes (capacidad y DOD), siempre en su grupo y oculta mientras «Incluir batería» esté apagado: encenderla no hace que la lectura heredada invente un grupo con precio por defecto |
| Dimensionado | Paneles con la base «mes pico», inversor por DC/AC 1,20 y baterías por la regla activa (punto 2) |

**Política de precio por fuente** (revisión M10): «Nueva simulación» respeta el modo de Ajustes (matriz o $/W); el asistente y los agentes cotizan siempre con la matriz de costos (`enforceAutomatedPricing`).

**La marca de estimado** vive en la propuesta como campo opcional `consumptionEstimate: { kind: 'factory_default', monthlyKWh }` y es **derivada**: `isConsumptionEstimated` dice «estimado» mientras los doce meses sigan siendo ese valor. Editar un mes basta para que deje de serlo, y deshacer lo vuelve a mostrar sin que haga falta escribir ni restaurar la marca (el diario de deshacer no restaura campos sueltos fuera de sus secciones). Sin el campo, el comportamiento de siempre. Se muestra discreta en la pestaña Energía (ⓘ «Consumo estimado») y `create_proposal` lo devuelve como aviso.

**Ajustes guardados.** «Margen bruto objetivo» es un ajuste real con control (Ajustes → Costos y margen) y se persiste entero con los ajustes de cada instalación. **No se migra**: una instalación que ya guardó sus ajustes conserva su valor (28 % si nunca lo cambió) y sus propuestas nuevas nacen con ese factor hasta que el usuario lo cambie; solo una instalación nueva (o restablecida) empieza en 40 %. El control lleva un ⓘ que dice el valor de fábrica. Si el dueño quiere que las instalaciones existentes pasen a 40 %, hace falta una migración explícita y visible (decisión pendiente). El mismo ajuste fija la línea de catálogo de una cotización (`automatedSaleMarginMultiplier`), así que en una instalación nueva esa línea también pasa de 1,28 a 1,40.

### 2. Dimensionado puro, con supuestos declarados

`src/domain/sizing.ts`; los supuestos viven en `SIZING_ASSUMPTIONS` y cada resultado los devuelve (`assumptions`):

- **Base de dimensionado de paneles** (decisión del dueño): el mes de mayor consumo como si fuera el promedio (consumo anual de diseño = 12 × mes pico). Se guarda en la propuesta como `specs.sizingBasis` opcional: **sin el campo** (todo lo guardado antes de F2b) es `average`, el consumo real del año, y la propuesta calcula exactamente lo mismo que antes (las copias doradas y las suites del motor no cambian). Las propuestas nuevas nacen con `peak_month`, y el autodimensionado de la edición (`withRecommendedPanels`, ADR 0004) usa la base guardada. El motor sigue siendo quien recomienda la cantidad; `sizing.ts` es su único llamador fuera del motor (guarda del ADR 0004).
- **Inversor**: relación DC/AC objetivo **1,20** (supuesto del equipo de desarrollo, no del dueño; se cambia en `SIZING_ASSUMPTIONS.targetDcAcRatio` o por parámetro). Cantidad = ⌈kWp DC / 1,20 / kW del inversor⌉, mínimo uno.
- **Baterías** (regla propuesta, pendiente de que el dueño la confirme con su jefe): energía **útil** del banco (con DOD y eficiencia, de `batteryBank`, ADR 0002) ≥ 75 % del consumo diario del mes pico (kWh del mes pico / días de ese mes). La alternativa «noche real según el perfil horario + 25 %» está escrita (`nightProfileBatteryRequirementKWh`, `rule: 'night_profile'`) y **no se usa** por defecto.
- **Elección de equipo**: el resolvedor de precios de siempre (`resolveAutoPrice`, ADR 0006); nunca se inventa un precio.
- La cantidad sugerida de un grupo que calculaba el JSX de la revisión del borrador (`ProposalConsumptionReview`) es `suggestedGroupPanelCount`.

### 3. Errores que pasan a estado: propuesta «incompleta»

`proposalCompleteness` (`src/domain/proposalCompleteness.ts`, pura y derivada: no se guarda nada) devuelve `{ incomplete, reasons[] }` con el motivo en español y la ruta del registro donde se corrige. Mínimos: doce meses de consumo finitos ≥ 0 con algo de consumo; un panel y un inversor con potencia y cantidad (una lista guardada vacía es «sin equipo», aunque la lectura heredada la rellenaría); con red, un precio del kWh > 0 o la fila de la tarifa; y, en matriz de costos, precio en cada equipo en uso (en precio directo $/W no fijan el precio). Mientras esté incompleta:

- los resultados se muestran **vacíos con su motivo, nunca en cero**: la pestaña Energía conserva el editor de consumo y pone «—» en lo calculado; Cotización y Retorno, el resumen y sus finanzas muestran «Resultados pendientes» con los motivos; la tarjeta del listado dice «Incompleta» (ⓘ);
- **no se exporta ni imprime el PDF, no se comparte ni se convierte a cotización**: los botones quedan desactivados con el motivo en un ⓘ o en su título, y las acciones lo comprueban también fuera de los botones (`openShareModal`, `createQuotationFromProposal`, `handleExportPDF`/`handlePrint`).

Una propuesta completa no cambia en nada (`proposalResults` devuelve el resumen del motor tal cual). `create_proposal` sin consumo ya no es un error: crea con el consumo estimado y lo avisa. El formato sincronizado y el del visor no cambian: los dos campos nuevos (`consumptionEstimate`, `specs.sizingBasis`) son opcionales y su ausencia es el comportamiento anterior; la API guarda la propuesta como JSON y los conserva.

## Medición

Precio de contrato con el catálogo de fábrica y ofertas de prueba (panel CS 590 W a 95 USD, inversor Lux 8K a 1.400 USD), ajustes de fábrica, sin sesión. Antes = `beta` con F2a2; después = esta rama.

| Camino | Factor | Mano de obra | Consumo | Tarifa (USD/kWh) | Coordenadas | Equipos | Contrato antes | Contrato después |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| «Nueva simulación» | 1,25 → **1,40** | 170 → 170 | 3.279 → **1.000 (estimado)** | EDEESTE BTS2 0,227 → 0,227 | Centro Médico → **ninguna** | 38 × 620 W a 103,32 + inversor a 2.300 (del caso) → **14 × 590 W a 95 + 1 × Lux 8K a 1.400** (oferta) | 13.690,37 (23,56 kWp) | **6.141,74** (8,26 kWp) |
| Asistente de propuestas (700 kWh, 12 paneles) | 1,28 → **1,40** | 0 → **170** | 700 | EDENORTE BTS1 0,180 | ninguna | 12 × 590 W a 95 + 1 × Lux 8K a 1.400 | 3.251,20 | **5.544,35** |
| `create_proposal` (mismos datos) | 1,28 → **1,40** | 0 → **170** | 700 | EDENORTE BTS1 0,180 | ninguna | igual | 3.251,20 | **5.544,35** |
| `create_proposal` sin consumo | — (error «Indica doce consumos…») | 170 | **1.000 (estimado)** | EDENORTE BTS1 0,234 | ninguna | igual | no creaba | **5.544,35** |
| Duplicar | copia la original (sin cambios) | | | | | | | |

Con el catálogo **sin precios** (modo local recién instalado), antes «Nueva simulación» nacía con los precios prestados del caso de referencia (13.690,37) y los caminos del asistente con equipos a 0 (contrato 0,00 y retorno ≈0); ahora las tres nacen **incompletas** («Falta el precio de …»), con los resultados vacíos y el PDF, compartir y cotizar bloqueados hasta poner precios. El motor seguiría calculando 2.263,57 / 1.988,35 (solo la mano de obra), pero esa cifra no se muestra.

La subida del contrato en los caminos del asistente sale de la mano de obra (antes 0) y del factor (1,28 → 1,40); en «Nueva simulación», de dejar de heredar el sistema del Centro Médico (consumo, equipos y precios).

## Consecuencias

- Un valor por defecto nuevo se declara una vez (`NEW_PROPOSAL_DEFAULTS`, `SIZING_ASSUMPTIONS`) y vale para todos los caminos; `testProposalFactory` fija que las tres vías nacen igual.
- Las propuestas nuevas se dimensionan con más holgura (mes pico); las guardadas, igual que siempre.
- La potencia de panel de Ajustes solo se usa cuando el catálogo no ofrece un modelo con precio (antes se escribía sobre el modelo del caso de referencia).
- Lo que no cubre este ADR: `create_proposal` sin ningún argumento sigue siendo un error de argumentos, porque los obligatorios los declara `shared/agentTools/definitions.ts` (compartido con el MCP remoto, fuera del alcance de una 2.11.0 solo de cliente); la herramienta nueva con todo opcional es de F3a. El MCP remoto no crea propuestas (ninguna de sus 12 herramientas ni de las rutas de agente de la API lo hace). Los avisos «guardados» con su ruta (revisión M1) quedan para F3/F5: aquí los motivos son derivados.
