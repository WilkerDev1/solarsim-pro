# Asistente de propuestas e inventario

Extensión code-led del mundo Operate existente. Fuente: `proposal-workspace.css`, `AIInvoiceScannerModal.tsx`, `ProposalDraftReview.tsx`, `ProposalConsumptionReview.tsx`, `ProposalCommercialReview.tsx` y `EquipmentManagerSettingsTab.tsx`. PRODUCT.md define ingeniería de propuestas dominicanas y escritorio mínimo 1024×700; el usuario confirmó revisión humana antes de aplicar.

## Direction contract

THESIS: Tareas de ingeniería con datos y evidencia revisables antes de confirmar; el análisis prepara un borrador, no modifica silenciosamente propuestas.
OWN-WORLD: Mundo heredado Inter, gris neutro por tema y verde funcional, interfaces empresariales de operación cotidiana. La conversación permanece azul marino como el dock en ambos temas por petición explícita del usuario, con texto claro y controles de mayor contraste.
STORY: Texto/archivos → borrador enlazado al catálogo y tarifas → pestañas consumo/diseño, equipos, cotización y cliente/tarifa → corrección manual o por chat → revisión confirmada → crear o actualizar.
FIRST VIEWPORT: Toda la ventana: dock principal completo a la izquierda, chat/compositor junto al dock, revisión con pestañas a la derecha y pie fijo de confirmación, sin cabecera horizontal exterior. Entrada y revisión visibles simultáneamente, con scroll propio. Pendientes del borrador aparecen en el chat; contexto y errores preceden los campos.
FORM: Extensión local especificada del editor de inventario; exenta de concept-seed según reference/new-work.md:39 (identidad heredada, sin reemplazo visual). Paneles planos, formularios etiquetados y tabla compacta de inventario; escritorio 1024×700 mínimo, 1280×720 principal. Envolvente 100vw × 100dvh, sin sombra ni radio exterior; dock compartido de 64px y altura completa; el cuerpo restante contiene chat minmax(330px,30%), reducido a 300px a 1100px. Divisores de pestañas, secciones y pie de 2px; filas de tabla de 1px. Sin comp aprobado ni reemplazo de identidad; código actual como autoridad.

## Quality bar y evidencia

Lectura de nombres completos, unidades explícitas, precios ausentes señalados y supuestos estimados identificados. Revisión claro/oscuro equivalente y chat permanentemente oscuro, foco por teclado, Escape, cancelar carga y revisión antes de mutar. Inventario separa nominal y ofertas; importar no equivale a certificar especificaciones del fabricante.

La ampliación final conserva las decisiones anteriores y añade consumo mensual, dimensionamiento por grupo y condiciones comerciales revisables. Finish reviewer sustituto emitió disposition `ship`, sin fixes materiales, sobre código y capturas válidas de `/tmp/solarsim-ai-expanded-qa/`: `consumption-light.jpg`, `commercial-light.jpg`, `equipment-dark.jpg`, `months-dark.jpg`, `minimum-light.jpg` y `minimum-commercial-dark.jpg`. La revisión incluye estados poblados en ambos temas y el mínimo 1024×700. Inventario y modal de datasheets conservan el alcance de revisión previo; esta ampliación no certifica nuevas capturas de esas superficies. Capturas son QA sintética, no assets de producto ni pruebas de producción.

Consumo y generación mantienen leyenda, unidades y tabla editable de doce meses; datos ausentes quedan pendientes. El dimensionamiento identifica el grupo ajustable y requiere aplicar la cantidad sugerida, conservando otros modelos, inversores y baterías. Mes pico requiere confirmar la sustitución del historial por estimación. La tabla detallada de costos en USD presenta componente, cantidad, unitario, total e ITBIS, con origen por fila y pendientes explícitos. La base documental distingue compra, venta y pendiente; los totales de ficha se concilian sin convertirse en extras. Costos por modelo se distinguen de ofertas de proveedor; cotización reúne mano de obra, utilidad, extras y descuentos con resumen provisional cuando faltan costos. Todo permanece en el borrador hasta confirmar; editar cotización no modifica inventario, API/CAS ni fórmulas financieras.

El detector registró tamaños 10/11px en editor heredado; el gráfico local lleva anotaciones de 11px. No se canonizan como nueva rampa global. DESIGN.md y sidecar se amplían sólo en esta superficie, conservando decisiones anteriores.

## Actualización del 12 de octubre de 2026

La revisión final utilizó capturas válidas de `/tmp/solarsim-oct12-qa/`: `commercial-table-light.jpg`, `theoretical-light.jpg` y `commercial-minimum-dark.jpg`. Cubren tabla detallada, procedencia teórica y mínimo oscuro. El finish reviewer alcanzó su ceiling y devolvió únicamente corregir persistencia documental: geometría anterior 1220px/94vh y paleta del chat obsoleta; no reportó fixes visuales materiales. No se extrapola esa cobertura al inventario ni a otros estados.

La procedencia de consumo distingue observado, estimado, del proyecto y teórico temporal igual a producción; el modo sin factura se etiqueta y bloquea redimensionar contra su propia producción. Pendientes y bloqueadores acompañan el diálogo bajo «Revisemos estos detalles» y se actualizan al editar. La revisión humana conserva el paso final antes de aplicar. Las capturas y datos de fixture continúan siendo evidencia QA, nunca assets del producto.

## Dock compartido: actualización de código

El asistente reutiliza `PrimaryIconDock` completo, con tema, proyectos, simulador, herramientas IA, nueva simulación, papelera, actualizaciones y ajustes. `assistantActive` marca IA como página actual con el tratamiento violeta heredado y evita marcar el proyecto o simulador de fondo. `beforeNavigate` llama al cierre del asistente antes de cambiar de destino; ese cierre cancela el análisis en curso. Los estilos de campos y botones del asistente se limitan al cuerpo de propuesta, de modo que el dock conserva sus clases y estados compartidos.

Esta actualización registra la implementación del dock reutilizable y su geometría. Las revisiones y capturas anteriores describen sus estados anteriores; no se presentan como revisión visual completada del nuevo dock.
