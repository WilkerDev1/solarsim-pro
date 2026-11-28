# ADR 0011: Sesión fuera de React y bucle propio del asistente de la app

Estado: aceptado (F4 del asistente único). Continúa el [puerto LlmClient](0008-puerto-llm-y-sdk-google-genai.md) (F1a), el [conjunto del asistente de la app](../AGENT_TOOLS.md#conjunto-del-asistente-de-la-app-f3a) (F3a), el [perfil «edición en vivo»](0010-perfil-edicion-en-vivo.md) (F3b) y las [instrucciones en capas y los eventos del turno](../AGENT_TOOLS.md#instrucciones-fachada-y-eventos-del-turno-f3c) (F3c). Términos en el [glosario](../../GLOSSARY.md).

## Contexto

El asistente flotante se bloqueaba por diseño (auditoría del plan): la conversación vivía en un `useState` de un panel con clave «espacio + propuesta», así que abrir o crear una propuesta remontaba el panel, abortaba el turno y vaciaba el chat; el bucle (`service.ts`) tenía 4 rondas, 4 llamadas por ronda y 3 cambios por mensaje, abortaba ante cualquier final distinto de `STOP`, guardaba solo texto en el historial y hablaba con Gemini por un transporte REST propio. F3a/F3c dejaron las herramientas nuevas, sus instrucciones y los eventos del turno listos, sin nadie que los usara.

La revisión adversarial del plan fijó ocho reglas para el bucle nuevo; ninguna es negociable:

1. Un turno entra en el historial solo cuando está cerrado: un `functionCall` sin su `functionResponse` daría 400 en todos los turnos siguientes.
2. El contexto vivo viaja dentro de `functionResponse.response`, nunca como una parte de texto aparte (rompería la definición de turno de Gemini y el contrato anti-suplantación del contexto).
3. Las declaraciones de herramientas son fijas durante todo el turno.
4. El modelo de respaldo solo entra antes de la primera respuesta del modelo en el turno (las firmas de pensamiento no se garantizan entre modelos).
5. Sin reintentos del SDK y sin continuación automática: el bucle decide.
6. Límite de pasos por turno con cierre limpio y resumen.
7. Stop cierra el turno sin dejar llamadas a medias y sin reenviar nada (en 2.9.4 hubo un reenvío tras Stop).
8. Las llamadas de un mismo paso que escriben se ejecutan en orden, no en paralelo.

## Decisión

### 1. La sesión es un módulo, no un hook

`src/features/assistant/session/assistantSession.ts` (`createAssistantSession`, y `assistantSession()` para la única de la app) es dueña de la conversación, del historial del modelo (`LlmContent[]` de turnos cerrados), de los adjuntos, del borrador del compositor, de si el panel está abierto y del turno en curso. Expone `getState`/`subscribe` (para `useSyncExternalStore`) y acciones (`send`, `cancel`, `continueTurn`, `reset`, `confirmPending`, `rejectPending`, `undoActivity`, `addFiles`…). La interfaz solo se suscribe: cambiar de vista, abrir otra propuesta, remontar el panel o cerrarlo no toca la sesión ni cancela el turno; un modal o la papelera ocultan el panel sin cancelar (las herramientas revalidan permisos, papelera y conflictos al aplicar). Cambiar de espacio de trabajo o de sesión de la cuenta (`assistantOwner`) la descarta entera, como antes. El texto en streaming vive en la sesión, no en el store de la simulación, para no disparar los selectores del simulador con cada fragmento.

Cada turno reduce los eventos de F3c con `reduceTurnEvent` (texto aceptado, llamadas con su diff, confirmaciones pendientes, supuestos, errores y resumen), con los Ajustes vigentes y la propuesta del turno como referencias para validar los supuestos.

### 2. El bucle es propio, sobre LlmClient

`src/features/assistant/session/agentLoop.ts` (`runAgentLoop`) no conoce el store ni React. Recibe el cliente del puerto, las declaraciones, la instrucción, el historial cerrado, el mensaje del usuario y un ejecutor; transmite con `client.stream` y devuelve el turno cerrado. La sesión le pasa `listAssistantToolset()` (las 19 de F3a), `buildSystemInstruction('app-assistant', { tools })` y un ejecutor que llama a `executeAssistantToolset` con `turnId` y un `callId` por llamada (`c0`, `c1`… del turno: la clave de idempotencia de F3a).

Cómo cumple cada regla:

| Regla | Cómo |
| --- | --- |
| 1. Historial cerrado | El turno se arma aparte y solo se añade al historial al cerrar, y solo si `closedTurnProblems` lo da por bueno. Tras Stop, plazo o error, las llamadas ejecutadas llevan su resultado real y las demás uno sintético `{status:'error', error:{code:'cancelled', retryable:false}}`; lo parcial del stream se descarta; si el turno termina en una respuesta de herramientas, se cierra con un texto del modelo sintético (el resumen local) para que el turno siguiente alterne bien. Sin respuesta del modelo ni herramientas ejecutadas, el turno no entra. |
| 2. Contexto vivo | Primera ronda: la última parte del mensaje del usuario es `{"appContext":…}` (`assistantTurnContext`, como hoy). Rondas siguientes: solo partes `functionResponse`, y cada `response` lleva `appContext` recalculado después de ejecutar la llamada, además del resumen vivo de la propuesta (`proposal`) que ya trae la forma común de F3a. Las tarjetas (`cards`) no viajan al modelo. |
| 3. Declaraciones fijas | Se copian al empezar el turno; ni una navegación ni un cambio de política a mitad las altera. |
| 4. Respaldo | Solo en la ronda 1 y si no llegó ningún evento del modelo (`server` o `not_found`: del modelo elegido al de fábrica, o del de fábrica a `gemini-3.8-flash`); el respaldo queda para todo el turno y se avisa con un ⓘ. Después, un `server`, plazo o red se reintenta una vez con el mismo modelo; si vuelve a fallar, el turno se cierra con lo hecho. |
| 5. Sin automatismos | El adaptador ya fija `automaticContinuation: false` y sin `retryOptions`. Tabla del bucle por motivo de fin: `stop` normal; `max_tokens`/`continuation` se cierra con lo recibido (avisado, nunca encadena otra petición); `malformed_function_call`, `unexpected_tool_call` y `malformed_response`, un único reintento de la ronda sin guardar lo mal formado; `too_many_tool_calls`, `missing_thought_signature`, `safety`, `recitation` y `other` cierran con resumen local. Una respuesta final vacía se cierra con el resumen local, no con un error. |
| 6. Presupuesto | 24 llamadas a herramientas y 180 s por turno, 8 llamadas por respuesta (las que sobran reciben un error en orden y no cuentan) y 30 rondas como red de seguridad. Al agotarse, la llamada que sobra recibe `step_limit`, el turno se cierra con el resumen y el panel ofrece «Continuar», que es un turno propio (`CONTINUE_PROMPT`) y nunca reenvía el mensaje anterior. |
| 7. Stop | `cancel()` aborta la señal del turno: el stream lanza `cancelled`, una herramienta en curso la recibe (la lectura de facturas la respeta) y las siguientes no se ejecutan. No se envía ninguna petición más. El botón Detener sigue siendo el del compositor (claves distintas y `createStopLatch` de 2.9.4). «Reintentar» solo se ofrece si el turno no aplicó nada. |
| 8. Orden | Todas las llamadas de una respuesta se ejecutan en serie y en el orden del modelo; las respuestas vuelven en un solo content, en ese orden y con su id. No hay lecturas en paralelo: `open_proposal` y `extract_invoice` son `read` con efectos, y la ganancia no compensa el riesgo de leer antes de una escritura de la misma respuesta. |

Una herramienta que falla, o que lanza, devuelve su error al modelo como `functionResponse` para que cambie de estrategia; el usuario nunca ve un turno colgado. Una confirmación pendiente no bloquea: el turno sigue y termina con su resumen, y la tarjeta queda en el panel para confirmar o descartar (`confirmAgentAction`/`rejectAgentAction` del store).

Resúmenes de pensamiento (`includeThoughts`) solo en Gemini 3 y 4, los que aceptan `thinkingConfig` con nivel; el nivel es el de fábrica de cada modelo. Sin `maxOutputTokens` propio (el tope de 8.192 del bucle antiguo truncaba turnos con herramientas). Modo de llamada `auto` (el de hoy): `validated` está declarado en el puerto pero nadie lo ha comprobado contra la API real con este conjunto.

### 3. Puertos de F3a conectados por la sesión

- `openProposal`: navegación real (`setActiveProject` en el simulador o el resumen; `pdf-preview` abre el documento).
- `create_proposal` aplicada con `data.openSimulator`: la sesión abre el simulador en la propuesta nueva y se lo dice al modelo en ese mismo resultado (`data.opened: 'simulator'`, `proposal.open: true`, `appContext` ya en el simulador). La herramienta sigue sin navegar por sí misma (la ejecutan también las pruebas y, con otra política, la cola de confirmaciones).
- `extractInvoice`: una subllamada estructurada por LlmClient (`session/invoiceExtraction.ts`) con un esquema propio pequeño y una normalización determinista: doce meses solo si la factura trae los doce; con menos, el promedio de los leídos, marcado como estimado; nunca rellena un mes. La petición va por la política de salida estructurada de los escáneres (`requestStructured`, F1b): un reintento ante JSON inválido, tope de 20 MiB inline, plazo global de 90 s y modelo de reserva dentro de esa subllamada, que es una petición aparte sin el historial ni las firmas del turno (no toca la regla 4).

### 4. Adjuntos

Sin Files API (decisión 8 del plan): el PDF va en línea solo con el mensaje en que se adjunta (hasta 6 MB en total; por encima, solo la referencia y el modelo lo lee con `extract_invoice`). Al cerrar el turno, el historial guarda una referencia por id en lugar del contenido, así un PDF no viaja en cada turno posterior. El historial conserva los 12 últimos turnos enteros (nunca parte un par llamada/respuesta).

### 5. El camino antiguo

El panel flotante pinta solo la sesión nueva; no hay interruptor. Quien tenga el asistente encendido usa el bucle nuevo; la bandera `APP_ASSISTANT_ON_BY_DEFAULT` sigue en `false` (encender por defecto es de F5b). `service.ts`, `useAppAssistant.ts`, `executeForAssistant`, `ASSISTANT_SYSTEM_PROMPT` (en `shared/`, que no se toca), `shared/geminiTransport.ts`, el modal `ai-invoice` y `electron/ai` siguen en el código, sin uso desde el panel, porque los caracterizan sus suites y el asistente de propuestas; F6 los retira. Un interruptor habría duplicado la interfaz y las pruebas de una función que ya está apagada por defecto.

## Alternativas descartadas

- **Un slice del store de la simulación para la sesión.** Cada fragmento del stream pasaría por los selectores del simulador; la sesión no necesita persistirse ni sincronizarse.
- **Truncar el turno cancelado en vez de responder «cancelada».** El modelo perdería qué se aplicó antes de Stop; las respuestas reales y sintéticas se lo dicen.
- **Lecturas contiguas en paralelo.** Ver la regla 8.
- **Cerrar el turno con otra petición al modelo para que resuma.** Sería una continuación automática facturada; el resumen local sale del estado del turno.

## Consecuencias

- `testAssistantLoop` (contrato del bucle con ScriptedLlm) y `testAssistantSession` (la sesión con el store, el conjunto de F3a y sus puertos reales) fijan todo lo anterior, incluido el criterio de aceptación de F4: «Crea una propuesta» desde Inicio termina con respuesta visible, el simulador abierto en la propuesta nueva y el turno cerrado en el historial.
- La clave del panel (`assistantPanelKey`) todavía cambia con la propuesta: remontar ya no pierde nada, pero dejarla solo por espacio/sesión es de F5b (`testAssistantPanelKey`).
- Pendiente de F5a/F5b: la tarjeta de diff rica, las anclas y el resaltado (F5a; aquí los cambios son una lista de texto), el modo acoplado, escribir mientras trabaja, las tres entradas y el encendido por defecto (F5b).
- No verificado contra la API real: que Gemini acepte las 19 declaraciones (`scripts/qa/checkToolDeclarations.ts --toolset app-assistant --prompts`) y que acepte el esquema de la lectura de facturas en `responseJsonSchema` (`checkScannerSchemas.ts` no lo incluye).
