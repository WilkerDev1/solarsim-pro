# Editor del documento de propuesta

Todo texto del PDF se edita directamente en la hoja A4, con una barra tipo procesador de textos. El dock lateral conserva solo lo que no es texto: estructura (orden y visibilidad de secciones, puntos extra del índice, anexos) y diseño (logotipos, marca de agua, tema, cabecera y pie).

## Piezas

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Registro | `shared/documentTexts/` | Claves estables, valores por defecto, resolución, escritura, plantillas y texto enriquecido. TypeScript puro, sin imports de `src/`: lo compilan la app y el Worker. |
| Diseño | `shared/documentLayout.ts` | Secciones visibles, tema y cabecera/pie (reglas puras). |
| Editor React | `src/components/pdf/editor/` | `DocumentEditorProvider`, `<EditableText k="…">`, `RichTextEditor`, `DocumentEditorToolbar`, `OptionalTextRow`. |
| Exportación | `src/components/pdf/export/` | `exportProposalPdf` y `editorChrome` (quita el cromo del editor). |
| Dock | `src/components/pdf/controls/` | `PDFSectionToggles`, `PDFExtraTocEditor`, `PDFDesignControls`, `PDFAttachmentsSection`. |
| Visor web | `workers/share-viewer/` | Muestra los textos publicados como `doc:<clave>`. |

## El registro de textos

Cada texto tiene una definición (`DocumentTextDefinition`): `key`, sección, etiqueta, formato (`plain` o `rich`), `multiline`, `templatable`, longitud máxima, marcadores admitidos y valor por defecto, fijo o calculado desde un `DocumentTextContext` (nombre del cliente, tarifa, inyección cero, equipos, cifras de la simulación).

- Claves: `quotation.warranty.panel`, `company.phone`, `client.phone`, `projectDescription.regulatoryNote`, `toc.<sección>.title`, `page.<sección>.title`. Las claves son contrato: no se renombran.
- **Dónde se guarda un texto.** Las claves con `legacyField` escriben en el campo heredado de `DocumentCustomization` (`panelWarrantyText`, `regulatoryNote`…); así las propuestas de 2.6.x y los enlaces publicados siguen funcionando. El resto va en `customization.texts[clave]`. Los datos del cliente y de la cotización (`client.name`, `quote.number`, `quote.date`, `quote.validityDays`, `client.address`) viven en `project.client`. Contacto, teléfono y correo del cliente se escriben en el campo heredado y se reflejan en `client`.
- **Valores de fábrica.** Un campo heredado igual a un valor de fábrica conocido (`KNOWN_FACTORY_VALUES`) cuenta como «sin personalizar». Las propuestas nuevas ya no copian el texto de fábrica: muestran el predeterminado, y la nota regulatoria y la nota de validez siguen la tarifa, la inyección cero, los días de validez y las baterías.
- **Restablecer** escribe `''` en el campo heredado (o quita el campo si distingue vacío de «sin definir») o borra la entrada de `texts`. Escribir exactamente el texto predeterminado equivale a restablecer.
- **Marcadores.** `{clientName}` (alias `{cliente}`), `{contactName}`, `{clientPhone}`, `{clientEmail}`, `{companyName}` y `{validityDays}` en cualquier texto; los párrafos del proyecto admiten además `{panelCount}`, `{panelModel}`, `{systemCapacityKWp}`, `{annualProductionKWh}`, `{annualConsumptionKWh}`, `{energyCoveragePct}`, `{inverterCount}`, `{inverterModel}`, `{batteryCount}`, `{batteryModel}` y `{scopeText}`. Un párrafo personalizado mantiene sincronizados sus números con la simulación.

### API para otros módulos (herramientas de IA, MCP)

Todo es puro y no importa la interfaz:

- `listDocumentTexts(source, ctx, { section? })` y `resolveDocumentText(key, source, ctx)` → `{ text, source, isCustomized }`.
- `documentTextPatch(key, valor, source, ctx)`, `documentTextResetPatch(key, source)` y `documentTextsPatch({ clave: valor | null })` → parche de `customization` y `client`; `applyDocumentTextPatch` lo aplica.
- En el store: `setDocumentTexts({ clave: valor | null })` (registra deshacer, respeta la papelera, los lectores y los conflictos) y `saveDocumentTextsToCompanyTemplate(claves | 'all')`.
- `setDocumentLayout(parche)` para secciones visibles, tema y cabecera/pie.

## Plantillas de empresa

`saveDocumentTextsToCompanyTemplate` guarda solo claves `templatable`. Antes de guardar, `templatizeText` cambia el nombre, el contacto, el teléfono y el correo del cliente de la propuesta por marcadores (valores completos, nunca dentro de otra palabra), de modo que ningún dato de un cliente pase a la siguiente propuesta. Contacto, teléfono, correo, fecha, anexos y puntos extra del índice no entran en la plantilla (`reusableDocumentTemplate`).

## Texto enriquecido

Subconjunto de Markdown guardado como string: `**negrita**`, `*cursiva*` (también dentro de una palabra; los asteriscos separados por espacios, como `* Precios en USD *`, o junto a cifras son literales), viñetas con `- ` y párrafos separados por una línea en blanco.

- `sanitizeRichText` normaliza cualquier entrada (espacios, caracteres de control, longitud, formato plano de una línea).
- `serializeEditableDom` convierte el DOM de `contentEditable` a ese subconjunto; es lo único que se guarda, nunca HTML.
- `renderRichTextHtml` (Worker) y `RichText` (app) dibujan párrafos y viñetas como spans con `•`, sin `<ul>`/`::marker`.

## Edición en la hoja

- Modo edición desde la barra superior; solo con permiso de escritura y sin papelera ni conflicto de sincronización (`canEditDocument`). En esos casos la barra explica el motivo.
- Atajos: Ctrl+B / Ctrl+I, Enter (párrafo, o confirmar en campos de una línea), Shift+Enter (salto), Esc (cancelar), Ctrl+Enter, clic fuera o «Editando» (confirmar). Pegar entra siempre como texto plano.
- La barra ofrece negrita, cursiva, lista, restablecer, guardar en la plantilla, deshacer y rehacer, el campo activo y el chip «Personalizado». Deshacer cierra el editor activo antes de revertir.
- Un mismo texto puede aparecer en varias páginas (fecha, validez, nombre de la empresa): solo se edita la copia pulsada (`activeInstance`).
- Filas opcionales (correo del cliente, RNC y correo de la empresa) solo se imprimen con valor; en edición siempre se ven (`OptionalTextRow`).

## Exportación sin cromo

Todo lo que existe solo para editar lleva `data-pdf-chrome`. El PDF nunca lo muestra:

1. `PDFProposalView` pasa el editor a modo `export` (`flushSync`) antes de capturar.
2. `exportProposalPdf` quita `[data-pdf-chrome]` y los atributos de edición del clon, y pasa `ignoreElements` a html2canvas.
3. `@media print` oculta `[data-pdf-chrome]`.

Las reglas generales de maquetación están en [.agents/rules/html2canvas_pdf_export_rules.md](../.agents/rules/html2canvas_pdf_export_rules.md).

## Diseño persistente

`customization.layout` (`hiddenSections`, `visibleSections`, `themeId`, `showHeadersFooters`) guarda solo las diferencias con el valor por defecto: todo visible salvo la matriz de costos interna. `useDocumentLayout` lo lee y lo escribe con `setDocumentLayout` (con deshacer). Los nombres de sección salen de `shared/documentTexts/sections.ts`, única fuente para el dock, el índice y las cintas de título.

## Propuesta web (Worker)

El Worker solo acepta strings en `customization` (`workers/share-viewer/src/validation.ts`). Al publicar, `publishedDocumentTexts` añade `doc:<clave>` con el texto ya resuelto de cada texto personalizado que el visor dibuja (`VIEWER_TEXT_KEYS`). El visor prefiere `doc:<clave>`, luego el campo heredado y por último el texto por defecto compartido (`viewerText`); los enlaces anteriores, sin claves `doc:`, se renderizan igual. La validación solo admite claves del registro, de tipo string, con tope de longitud y de cantidad.

## Cómo añadir un texto

1. Define la clave en `shared/documentTexts/registry.ts` (textos con contexto, campo heredado o espejo) o `pageTexts.ts` (textos fijos de una página) con su valor por defecto actual.
2. Dibújalo con `<EditableText k="…">`; las cifras y unidades dinámicas se pasan con marcadores y `children`.
3. Si el visor web lo muestra, añade la clave a `VIEWER_TEXT_KEYS` y úsala en el Worker.
4. `testDocumentTextCoverage` falla si un texto del registro no aparece en ninguna página (salvo los condicionales listados en la prueba).

## Pruebas

`testDocumentTextRegistry` (caracterización de los 26 puntos de 2.6.x, resolución, escritura y plantillas), `testRichText`, `testDocumentEditorStore`, `testDocumentTextCoverage`, `testPDFLayoutPersistence`, `testProposalPdfExport`, `testShareDocumentTexts` y, en el Worker, `documentTexts.test.ts`. El fixture `scripts/qa/fixtures/documentEditor.html` (`?trash=1`, `?role=lector`, `?legacy=1`) permite revisar la edición a mano.
