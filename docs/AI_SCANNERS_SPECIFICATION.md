# Subsistema IA: propuestas, fichas técnicas, precios y tarifas

Contrato del código de esta rama, revisado el 8 de octubre de 2026. Describe comportamiento implementado; no garantiza un porcentaje de precisión ni de automatización. Los resultados de Gemini son borradores sujetos a validación local y revisión humana.

## Entradas y revisión de propuestas

`src/components/common/ai-invoice/AIInvoiceScannerModal.tsx` presenta un espacio conversacional con texto y adjuntos en una misma entrada. Admite descripción sola, factura sola o ambos; conserva mensajes y borrador durante la sesión del modal. `workspace.ts` valida PDF, PNG, JPG/JPEG y WebP con extensión y MIME coincidentes: hasta cuatro archivos, cada uno de hasta 8 MB, sin archivos vacíos. No promete seleccionar automáticamente páginas relevantes de un PDF: los adjuntos enviados forman parte de la solicitud a Google.

`hooks/useAIInvoiceScanner.ts` combina el catálogo activo, ofertas, configuración del proyecto, irradiación/pérdidas, modo de cálculo y contexto tarifario. El borrador puede refinarse con mensajes posteriores. Cerrar cancela trabajo pendiente pero conserva borrador, adjuntos y conversación en memoria para reabrir; Empezar de nuevo, aplicar con éxito o cambiar sesión/servidor/organización/destino limpia esa memoria. No existe almacenamiento duradero del chat. El usuario elige crear una propuesta o aplicar sobre el proyecto activo, revisa campos y confirma antes de mutar el store. Un cambio de contexto exige conservar la validez del borrador; errores de validación bloquean su aplicación.

`components/ProposalDraftReview.tsx` organiza Consumo y diseño, Equipos, Cotización y Cliente y tarifa en pestañas accesibles. La gráfica compara consumo y generación mensual; la tabla permite editar los doce meses. Los huecos permanecen pendientes. La acción de mes pico requiere confirmar que sustituirá el historial por una estimación. Cambiar cobertura no cambia cantidades: aplicar el cálculo ajusta únicamente el grupo de panel elegido y conserva los demás modelos, inversores y baterías. `shared/aiProposal.ts` construye el prompt/esquema común y normaliza la respuesta; `src/utils/aiProposalNormalization.ts` adapta la referencia local. Electron y navegador utilizan ese contrato, sin copiar reglas incompatibles de selección entre servicios.

### Equipos y cantidades

- Paneles, inversores y baterías son arreglos de grupos: cada grupo lleva ID real del catálogo y cantidad. Se admiten varios modelos distintos de cada tipo.
- IDs, tipo y especificaciones se contrastan contra el catálogo vigente. Solicitudes ambiguas, modelos inexistentes o incompatibilidades de potencia/capacidad quedan como problemas pendientes; no justifican una sustitución silenciosa por una marca más barata.
- Un modelo sin ofertas sigue siendo seleccionable. Su ausencia de precio requiere revisión comercial; la IA no inventa una cotización.
- Se distingue potencia unitaria, cantidad, potencia total y energía. Solicitar un inversor de 16 kW no autoriza sustituirlo por dos de 8 kW. Esa distribución necesita una solicitud explícita y revisión de compatibilidad eléctrica.
- El dimensionamiento local usa los motores existentes y el objetivo configurado. Una meta del 95% es un parámetro de cobertura cuando está seleccionado, no una garantía de calidad de la extracción.
- Los consumos observados se distinguen de estimaciones y contexto del proyecto. Un promedio mensual puede producir doce valores estimados, señalados como tales; un historial documental incompleto exige completar los meses ausentes.
- La intención comercial debe revisarse como margen sobre venta o recargo sobre costo. No son equivalentes. Las notas de ingeniería no se concatenan a la descripción estándar de instalación.

`src/store/slices/aiSlice.ts` vuelve a validar al aplicar y convierte los grupos a las estructuras multi-equipo del proyecto. Los supuestos de una propuesta nueva de IA salen de `assumptionFields` (vigencia de los ajustes, cambio 60, cobertura 95 % si falta o es inválida; [ADR 0003](adr/0003-supuestos-resueltos.md)) y, sobre una propuesta existente, las specs pasan por `normalizeProjectEquipment`, la misma normalización que una edición ([ADR 0004](adr/0004-edicion-de-proyecto.md)). La creación utiliza el perfil y plantilla documental de la empresa emisora. No se cambian los contratos financieros, el modo legacy predeterminado ni la autorización por organización como efecto de una respuesta IA.

## Fichas técnicas e inventario

`geminiDatasheetService.ts` extrae paneles, inversores o baterías; `utils/datasheetImport.ts` normaliza y prepara el lote. Los valores desconocidos permanecen ausentes. Se convierten W/kW cuando corresponde y se puede derivar kWh de Ah y voltaje nominal; no se convierte kVA a kW sin un factor de potencia documentado.

`AIDatasheetScannerModal.tsx` muestra variantes editables y coincidencias de `equipmentMatchingUtils.ts`. Los puntajes de similitud son heurísticos, no probabilidades calibradas ni verificación del fabricante. Coincidencia por potencia o marca no acredita que dos generaciones de equipo sean idénticas.

Antes de guardar se valida todo el lote: marca, modelo, nombre, potencia/capacidad positiva, rangos y duplicados. Dos variantes no pueden reemplazar el mismo ID. Actualizar una coincidencia cambia también `displayName` y `modelSeries`, preservando ID, ofertas y campos técnicos no extraídos. Guardar como nuevo crea un ID independiente y requiere un nombre distinto si ya existe. Las mutaciones se contrastan con permisos y ámbito actuales y se comprueba su efecto antes de mostrar éxito.

`EquipmentManagerSettingsTab.tsx` permite buscar y filtrar el catálogo, consultar especificaciones y ofertas y editar equipos. Los precios de proveedor y las especificaciones de ingeniería permanecen separados; una fila comercial creada sin datos técnicos requiere completarse antes de dimensionar una propuesta.

## Listas de precios

`geminiPriceCatalogService.ts` entrega una extracción revisable. La conversión DOP/USD se recalcula localmente desde el precio original y la tasa indicada. Se rechazan moneda desconocida y precios no positivos/no finitos. Una coincidencia exacta y única por nombre local prevalece sobre un ID incorrecto sugerido por Gemini; el resto de inferencias requiere selección humana. El ID sugerido debe existir y tener el tipo de equipo correcto.

Los proveedores se cotejan por nombre exacto, eliminación de ciertos sufijos y coincidencias de texto. No hay un algoritmo de Levenshtein/Dice ni ponderaciones numéricas de marca/modelo/potencia en este servicio; las antiguas descripciones de esos algoritmos no representaban el código.

`utils/priceCatalogImport.ts` prepara el lote completo antes de escribir: rechaza nombres nuevos duplicados, varias ofertas del mismo proveedor para un único equipo y coincidencias de otra organización/servidor. Actualizar un proveedor conserva su ID de oferta, importante para referencias preferidas. `isPriceCatalogPlanApplied` comprueba el resultado del store; una escritura rechazada no se presenta como importación completada. La sincronización posterior conserva el contrato CAS del catálogo.

## Tarifas y procedencia

Véase [Tarifas en el flujo IA](AI_TARIFF_CONTEXT.md). El contexto compacto incluye distribuidora, código, moneda, cargos, bloques y fuente. Una tasa leída de la factura se diferencia de la referencia histórica. Dividir el total facturado entre kWh no demuestra el precio de energía porque el total puede contener demanda, cargos fijos y otros conceptos.

La extracción de resoluciones es parcial y requiere revisión documental explícita. Conserva filas y cargos no extraídos con procedencia por campo; no convierte su conservación en evidencia de vigencia. JSON transforma el último límite infinito en `null`; hidratación/descarga lo restauran con validación. Los aliases CEPM apuntan a la fila canónica actual.

La matriz base de las EDEs corresponde a enero-marzo de 2026 y no está certificada para octubre. CEPM tiene su propia fuente de referencia. La sincronización de tarifas todavía reemplaza la matriz por organización sin CAS: las protecciones contra carreras locales y sesiones antiguas no impiden que dos administradores distintos se sobrescriban. Corregir ese contrato requiere coordinar API y clientes.

## Transporte, cancelación y credenciales

`shared/geminiTransport.ts` es la excepción de I/O portátil dentro de `shared/`: usa Fetch/AbortController, sin importar Node, React, Electron ni base de datos. Puede recibir un transporte inyectado para Electron o pruebas. La clave viaja mediante `x-goog-api-key`, no en la URL.

Hay como máximo dos intentos totales. Los errores 408/500/502/503/504 permiten un fallback. Un primer MAX_TOKENS permite una recuperación con el mismo modelo y mayor límite de salida (máximo 32768 tokens); consume el mismo presupuesto de dos intentos, no añade un tercer intento tras fallback. Las propuestas comienzan con 16384 tokens; el transporte limita el pensamiento según familia (Gemini 3: low; 2.5 Flash/Pro: 1024). No se encadenan modelos por 401, 403 o 429. Cancelación externa detiene el proceso; cada intento tiene timeout (60 segundos predeterminado). El identificador de modelo se valida. Una respuesta incompleta o sin contenido útil no se aplica como JSON parcial. Los identificadores concretos están en el código/configuración; este documento no promete disponibilidad, cuota gratuita o capacidades del proveedor.

La clave configurada se persiste con preferencias en almacenamiento local. **localStorage no es una bóveda cifrada**: el contexto del renderizador y quien acceda al perfil local pueden leerlo. Los archivos y datos incluidos en el prompt se transmiten a Google cuando se solicita el análisis. No guardar claves en fixtures, documentos, logs ni commits; usar credenciales sintéticas en regresiones. El header evita exposición en URLs, pero no cambia las condiciones de almacenamiento local o de tratamiento de datos del proveedor.

## Evidencia y límites de QA

Las regresiones `testAIProposalCommercial.ts`, `testAIProposalPipeline.ts`, `testAIWorkspaceInputs.ts`, `testDatasheetImport.ts`, `testPriceCatalogImport.ts` y `testAITariffSafety.ts` verifican normalización, revisión, grupos multi-modelo, transporte simulado, lotes y persistencia. La revisión independiente ejecutó las tres suites de importación/tarifas con salida 0 y reprodujo ID real incorrecto frente a nombre exacto y un segundo merge parcial después de JSON con procedencia por campo intacta.

Se registraron dos llamadas reales de prueba de propuestas en esta tarea. Son evidencia de esos casos, no una certificación de exactitud general. La prueba real de extracción/importación de datasheet permanece pendiente; la cobertura sintética no la sustituye. Las pruebas automatizadas no escriben en producción.

## Evidencia adicional del 8 de octubre

La ficha de fabricante `LXP-LB-US-8-10K-datasheet.pdf` de Descargas se analizó con Gemini: la comprobación de las potencias nominales de ambas variantes (8 y 10 kW) pasó. No se enviaron facturas privadas en esta prueba. La primera comprobación falló en el script de QA por acceder a un campo inexistente; se corrigió el script y se repitió una vez. Esta evidencia puntual no garantiza otras fichas.

Al aplicar se preservan provincia del contexto, referencias NIC/NIS/contrato y notas en `project.aiSource`. Los grupos BESS se adaptan a los escalares existentes conservando la suma de energía útil por grupo; no se cambia el motor. La revisión invalida su confirmación si cambia el borrador normalizado. Las notas revisadas quedan visibles en la cotización del simulador.

## Cotización editable antes de aplicar

`shared/aiProposalCommercial.ts` define precios particulares, utilidad, mano de obra, extras y descuentos. El esquema exige representar condiciones comerciales y suministro, con null para valores desconocidos o alternativas inactivas; una ausencia no autoriza inventar datos. La IA y la edición manual pueden reemplazar costos unitarios de equipos para esta propuesta, conservando el inventario y ofertas. El usuario puede restaurar la oferta del inventario. Al cambiar modelo, el costo particular anterior deja de aplicarse.

El recargo sobre costo y el margen sobre venta son alternativas excluyentes. Lo mismo ocurre con mano de obra USD/kWp y costo total; el total se adapta a USD/kWp según potencia DC actual. Precio de venta directo USD/Wp debe ser positivo, mientras costo de compra, recargo y mano de obra admiten cero explícito. Extras tienen cantidad, unidad, costo y tratamiento de utilidad/ITBIS. Los descuentos distinguen importe o porcentaje y destino general o equipos/base DGII. Las listas completas conservan filas anteriores no modificadas; [] las elimina explícitamente. Cambios por chat prevalecen sobre defaults; el borrador revisado acompaña la solicitud posterior.

`src/utils/proposalDraftProject.ts` es el adaptador puro compartido por vista previa y aplicación del store. Utiliza los motores vigentes, sin replicar fórmulas financieras. Una propuesta nueva limpia overrides de costo y beneficios fiscales del benchmark. Validar varias veces nunca hace desaparecer errores ni costos inválidos; grupos repetidos con costos contradictorios requieren unificar precios. El resumen señala costos pendientes y la gráfica energética sigue disponible cuando sólo faltan condiciones comerciales. Una edición invalida la confirmación anterior.

## Conversación y documentos de costos

El esquema distingue `discussion` (respuesta/pregunta sin reemplazar borrador) de `draft` (crear/refinar). La respuesta conversacional acompaña el contexto de ambos roles y el borrador normalizado; la solicitud envía los últimos veinte mensajes acotados y las instrucciones actuales. Los datos pendientes se presentan en el chat lateral, actualizados al editar. Se conserva la confirmación humana antes de crear/actualizar y no se pierde trabajo cuando el store rechaza aplicar.

La extracción es genérica, no depende de una hoja específica: detecta cantidades, precios de compra/venta, USD/DOP, tipo de mano de obra, factor de venta o margen. El factor se convierte a recargo matemáticamente; los valores del documento prevalecen sobre defaults sin volver a convertir USD. Si compra/venta es ambiguo se pregunta y bloquea la aplicación hasta aclarar costos. `sourceTotals` sólo concilia importes informativos; nunca añade impuestos/subtotales/ganancia como extras ni reemplaza fórmulas del simulador. La tabla de cotización permite editar cantidad y costo por grupo, y toma el ITBIS del motor existente. Las ofertas del inventario permanecen intactas.

Los nombres genéricos de equipo se cotejan por marca, tipo, magnitud y unidades normalizadas. Palabras como watts, kWh y garantía no convierten una coincidencia válida en alternativa. Códigos explícitos, diferencias de marca/potencia/fase o unidades incompatibles siguen requiriendo corrección. No se sustituye un equipo nominal por varias unidades de otro modelo.

## Consumo teórico temporal

`consumptionSource=theoretical` requiere petición explícita o selección visible del usuario, equipos con cantidades y ubicación; no se infiere sólo por ser una instalación solar. El motor comparte factores mensuales sin redondear (`getMonthlySolarProductionFactors`), y el borrador redondea después de aplicar su potencia DC exactamente como la producción. Por tanto C=G por mes; no es una factura, demanda medida ni promesa de ahorro. El store revalida con los mismos factores antes de guardar, sin habilitar automáticamente la proyección física.

Cantidades/modelos/pérdidas/ubicación recalculan esa referencia durante el borrador. Se desactiva dimensionar desde esa demanda derivada, evitando circularidad. Un historial observado conserva su procedencia; editar manualmente los meses termina el modo teórico. Tras aplicar, los meses son una referencia guardada: cambios posteriores del diseño requieren revisarlos; el simulador avisa de ese origen y reemplazar consumos termina la etiqueta teórica. No se cambia el contrato financiero ni las gráficas de publicaciones ya existentes.

Sin precio de energía explícito se consulta sólo una distribuidora/código válido del catálogo, usando consumo mensual para tarifas escalonadas y marcándolo aproximado. Cambiar consumo o código recalcula referencias; tasas manuales/de factura se conservan. Se informa la necesidad de verificar vigencia. No se selecciona silenciosamente BTS2 ante código desconocido.

## Modalidad de precio de las propuestas automáticas

Toda propuesta creada o actualizada por IA (asistente de propuestas, asistente general y agentes externos) cotiza en modo **Simple (Catálogo IA)**: grupos con ID real del catálogo, costos de las ofertas de proveedor y matriz de costos (`AUTOMATED_PRICING` en `shared/automatedProposalPolicy.ts`). El esquema solo admite `cost_matrix`; si el modelo o el usuario piden precio por Wp, `normalizeCommercial` lo convierte a la matriz y emite el aviso `automated_pricing_forced`. La revisión muestra la modalidad como etiqueta fija y los agentes no pueden editar `isDetailed`, `pricingMode` ni los campos por Wp. El precio por Wp sigue disponible a mano en el simulador.

El predeterminado de fábrica de Ajustes → Simulación es la matriz. Antes era precio por Wp y se guardaba en cada instalación, por lo que al hidratar se migra a matriz salvo que el usuario lo haya elegido explícitamente (`pricingModeChosenByUser`). Las propuestas manuales nuevas empiezan en modo Simple.
