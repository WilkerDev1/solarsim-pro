# ADR 0012: Panel completo del asistente único

Estado: aceptado (F5b del asistente único). Continúa la [sesión y el bucle](0011-sesion-y-bucle-del-asistente.md) (F4), el [perfil «edición en vivo»](0010-perfil-edicion-en-vivo.md) (F3b) y el feedback en vivo de F5a ([QA](../QA.md#feedback-en-vivo-del-asistente-f5a)). Términos en el [glosario](../../GLOSSARY.md).

## Contexto

F4 dejó el asistente sobre una sesión fuera de React con un panel mínimo, flotante, apagado por defecto y solo en cuatro vistas; F5a dejó la tarjeta de cambio y el resaltado del dock sin montar. Faltaba lo que el plan llama «el panel»: no tapar los resultados del simulador, estar en todas las vistas, poder escribir mientras trabaja, que cerrar no cancele, que las tres entradas del asistente de propuestas lleven al asistente único y encenderlo para todos. La revisión del plan añadió restricciones: el panel acoplado no cabe en el mínimo del producto (1024 px) junto al dock de parámetros, moverlo entre acoplado y flotante no debe remontarlo, y Esc no debe cerrar ni cancelar en modo acoplado.

## Decisión

### 1. Acoplado o flotante, una función pura

`assistantPanelLayout` (`src/features/assistant/panelLayout.ts`) decide con la vista y el ancho de la ventana. En el simulador, el resumen (`project-hub`) y la vista previa del PDF el panel se acopla como columna derecha si al contenido le quedan al menos **640 px** después del dock principal (64 px) y, en el simulador, del dock de parámetros medido como lo dibuja su CSS (`parameterSidebarPx`, igual que `parameterSidebarCssWidth`: así la pantalla dividida, donde el dock cede al 40 %, no acopla). La columna mide entre **280 y 720 px** (por defecto 380), acotada a lo que deja libre; se arrastra por su borde izquierdo o con las flechas (24 px; Inicio vuelve al de fábrica) y el ancho vive en la sesión. En Inicio y el resto de vistas, o si no cabe, flota como antes. Ejemplos: simulador a 1440 px con el dock de 380 px → columna de 356 px; a 1280 px → flotante; resumen a 1280 px → columna.

Acoplado y flotante son **el mismo elemento** con otra clase (`assistant-widget assistant-docked`), montado una vez en la fila raíz de `App.tsx`: cambiar de modo no remonta el panel ni el compositor. Acoplado no hay «Ampliar» y Esc no cierra la columna (movería el contenido); flotante, Esc cierra sin cancelar.

### 2. Todas las vistas, una clave por espacio y sesión

`assistantVisibleIn(view, { quotations })` devuelve verdadero en todas las vistas de trabajo de `AppView`, salvo las de cotizaciones cuando la política efectiva las oculta (`quotationsFeatureEnabled`). `assistantPanelKey(owner)` solo lleva el espacio de trabajo y la sesión: abrir o crear otra propuesta, o cambiar de vista, ya no remonta el panel.

### 3. Escribir mientras trabaja: cola en la sesión y cesión del bucle

Con un turno en curso, `send` deja el mensaje en `queued` (varios se juntan en uno, con sus adjuntos) y vacía el compositor. El bucle recibe `shouldYield` y lo consulta **al terminar cada paso con herramientas** (regla 9 del bucle): si hay un mensaje en cola, las llamadas de esa respuesta ya se ejecutaron con su resultado real y el turno se cierra como `yielded` con un texto local («Turno pausado: el usuario escribió un mensaje nuevo…»), así entra cerrado en el historial y el mensaje encolado va como el turno siguiente. Si el modelo estaba dando su respuesta final, el turno termina normal y el encolado va detrás. Mientras pasa de un turno al siguiente `busy` no baja, para que nadie cuele otro envío en medio. Se descartó inyectar el texto a mitad de turno: una parte de texto junto a las `functionResponse` rompe la definición de turno de Gemini (`closedTurnProblems` la rechaza) y se confundiría con el inicio de un turno.

**Stop nunca entrega nada**: aborta el turno como siempre y devuelve lo encolado al compositor (texto y adjuntos), para que el usuario decida. No se reenvía el mensaje del turno detenido ni se envía el encolado. Apagar el asistente con algo en cola hace lo mismo.

### 4. Cerrar no cancela; insignia discreta

Cerrar el panel solo cambia `panelOpen`. «Detener» es un botón aparte (en el compositor, junto al de enviar cuando hay cola). Si un turno termina con el panel cerrado, la sesión marca `unseen`; `assistantBadge` da un punto discreto en el botón «Asistente»: claro que respira mientras trabaja (sin animación con `prefers-reduced-motion`), ámbar con respuesta o cambios sin ver; el nombre accesible del botón lo dice. Abrir el panel lo borra.

### 5. Tarjeta de cambio real y resaltado

Cada respuesta de herramienta con cambios deja en el mensaje su entrada de `ChangeCard` (`changeCards`, de `changeCardInputFromResponse` con la `AssistantToolResponse` completa: diff con derivadas, resultados del motor antes y después, avisos y los supuestos que declaró esa llamada). Una consulta no tiene tarjeta; un error solo si la herramienta escribe. `turnChangeCards` (`panelState.ts`) pone al día el estado con lo resuelto desde el panel: deshecho, confirmado o rechazado. `AssistantTurnDetails` pinta las tarjetas en lugar de la lista de texto de F4; Deshacer usa `undoAgentActivity` (espera a que termine el turno), Confirmar y Rechazar la cola real y se pueden pulsar a mitad de turno. En una propuesta incompleta la tarjeta no tiene cifras (F5a). El resaltado del dock ya salía de `commitProjectEdits` con `source: 'assistant'`; la sesión además destaca, al crear una propuesta, las secciones que llenó (no pasa por un lote por ruta).

### 6. Las tres entradas abren el asistente único

`openAssistant(entry)` (`src/features/assistant/assistantEntry.ts`, sin React) lo usan el menú de IA del dock (`dock-menu`), «Crear con el asistente» de Nueva simulación (`new-project`, con el nombre escrito si lo hay) y «Autocompletar con factura» de la pestaña Energía (`invoice`). Abre el panel, cierra los modales que lo tapan, deja un borrador sugerido sin enviarlo ni pisar lo escrito y, para la factura, pide el selector de archivos, que el panel abre al montarse (`filePickerRequested`). Las entradas cargan el módulo con `import()` para no meter la sesión en el bundle de arranque. **Si el asistente estaba apagado, lo enciende** (con el interruptor, que registra la elección): pedirlo desde una entrada es una elección del usuario, y la alternativa dejaba las entradas muertas para quien lo apagó. El modal `ai-invoice`, `electron/ai`, `shared/geminiTransport.ts`, `executeForAssistant` y `propose_project_update` siguen en el código, sin estas entradas: los retira F6.

### 7. Encendido por defecto

`APP_ASSISTANT_ON_BY_DEFAULT` pasa a `true` y corre la migración de una sola vez de F3b ([ADR 0010 §4](0010-perfil-edicion-en-vivo.md#4-encendido-del-asistente-flotante-migración-de-una-sola-vez)): un estado guardado antiguo (sin registro de elección ni marca) arranca encendido y queda la marca; quien lo apague después con el interruptor se queda apagado. El valor de fábrica del store también es `true`, con la marca en 0, para que un estado antiguo que lo hereda al fusionarse siga pasando por la migración. No se registra en `shared/applicationFeatures.ts`, como pedía la revisión: la 2.11.0 es solo de cliente y `shared/` no se toca; es una preferencia de este equipo, no una política de la organización. Sin clave de API no molesta: el botón está, y el panel muestra el aviso discreto con el camino a Ajustes → IA; nada se abre solo al arrancar.

Ajustes → Agentes expone el selector del perfil del asistente general (Edición en vivo / Pedir confirmación para precios) con su ⓘ.

## Alternativas descartadas

- **Portal hacia una ranura de cada vista.** Habría hecho falta una ranura en tres vistas y su orden de montaje; la fila raíz de `App.tsx` ya tiene el sitio y el mismo elemento cambia de clase.
- **Plegar el dock de parámetros mientras el asistente trabaja.** Mueve controles que el usuario puede estar mirando; flotar cuando no cabe es menos sorprendente.
- **Entregar el encolado tras Stop.** Contradice «nunca reenvío tras Stop»: el usuario pulsó Stop.
- **Dejar las entradas con el asistente apagado abriendo el modal antiguo.** Mantendría dos asistentes vivos hasta F6 y dos caminos que probar.

## Consecuencias

- `testAssistantFullPanel` fija las pruebas con las que abre la fase: acoplado/flotante por vista y ancho, cola entregada al cerrar el paso con historial válido, Stop con cola sin reenvío, las tres entradas (la de factura con el selector), `ChangeCard` con los datos reales de `edit_proposal` (Deshacer, Confirmar y Rechazar) y la insignia. `testAssistantPanelKey` y `testAssistantLiveEditProfile` §6 invierten lo que F0/F3b dejaron marcado para F5b; `testAppAssistant` invierte «apagado de fábrica».
- Scroll, foco, arrastre del borde y el selector de archivos abierto por una entrada no se pueden probar sin DOM: guion manual en [QA](../QA.md#asistente-panel-completo-f5b).
- Pendiente de F6: borrar el modal antiguo y sus satélites; la tarjeta «Propuesta creada» con kWp, precio y retorno (hoy la creación no trae diff por ruta y no tiene tarjeta, solo el texto y el resaltado); «Deshacer todo el turno» desde el panel (existe `undo_change` con turno). Pendiente de F7: QA en navegador con el modelo real.
