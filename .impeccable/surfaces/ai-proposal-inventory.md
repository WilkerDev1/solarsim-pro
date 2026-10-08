# Asistente de propuestas e inventario

Extensión code-led del mundo Operate existente. Fuente: `proposal-workspace.css`, `AIInvoiceScannerModal.tsx`, `ProposalDraftReview.tsx`, `ProposalConsumptionReview.tsx`, `ProposalCommercialReview.tsx` y `EquipmentManagerSettingsTab.tsx`. PRODUCT.md define ingeniería de propuestas dominicanas y escritorio mínimo 1024×700; el usuario confirmó revisión humana antes de aplicar.

## Direction contract

THESIS: Tareas de ingeniería con datos y evidencia revisables antes de confirmar; el análisis prepara un borrador, no modifica silenciosamente propuestas.
OWN-WORLD: Mundo heredado Inter, gris neutro por tema y verde funcional, interfaces empresariales de operación cotidiana.
STORY: Texto/archivos → borrador enlazado al catálogo y tarifas → pestañas consumo/diseño, equipos, cotización y cliente/tarifa → corrección manual o por chat → revisión confirmada → crear o actualizar.
FIRST VIEWPORT: Entrada/compositor y revisión visibles simultáneamente; pie de confirmación fijo en la zona de revisión y pestañas persistentes en su scroll. Contexto y errores preceden los campos.
FORM: Paneles planos, formularios etiquetados y tabla compacta de inventario; escritorio 1024×700 mínimo, 1400×900 principal. Sin comp aprobado ni reemplazo de identidad; código actual como autoridad.

## Quality bar y evidencia

Lectura de nombres completos, unidades explícitas, precios ausentes señalados y supuestos estimados identificados. Tema claro/oscuro equivalente, foco por teclado, Escape, cancelar carga y revisión antes de mutar. Inventario separa nominal y ofertas; importar no equivale a certificar especificaciones del fabricante.

La ampliación final conserva las decisiones anteriores y añade consumo mensual, dimensionamiento por grupo y condiciones comerciales revisables. Finish reviewer sustituto emitió disposition `ship`, sin fixes materiales, sobre código y capturas válidas de `/tmp/solarsim-ai-expanded-qa/`: `consumption-light.jpg`, `commercial-light.jpg`, `equipment-dark.jpg`, `months-dark.jpg`, `minimum-light.jpg` y `minimum-commercial-dark.jpg`. La revisión incluye estados poblados en ambos temas y el mínimo 1024×700. Inventario y modal de datasheets conservan el alcance de revisión previo; esta ampliación no certifica nuevas capturas de esas superficies. Capturas son QA sintética, no assets de producto ni pruebas de producción.

Consumo y generación mantienen leyenda, unidades y tabla editable de doce meses; datos ausentes quedan pendientes. El dimensionamiento identifica el grupo ajustable y requiere aplicar la cantidad sugerida, conservando otros modelos, inversores y baterías. Mes pico requiere confirmar la sustitución del historial por estimación. Costos por modelo se distinguen de ofertas de proveedor; cotización reúne mano de obra, utilidad, extras y descuentos con resumen provisional cuando faltan costos. Todo permanece en el borrador hasta confirmar; editar cotización no modifica inventario, API/CAS ni fórmulas financieras.

El detector registró tamaños 10/11px en editor heredado; el gráfico local lleva anotaciones de 11px. No se canonizan como nueva rampa global. DESIGN.md y sidecar se amplían sólo en esta superficie, conservando decisiones anteriores.
