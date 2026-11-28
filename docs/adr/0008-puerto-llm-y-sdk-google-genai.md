# ADR 0008: Puerto LlmClient propio sobre el SDK oficial @google/genai

Estado: aceptado (2026-11-27). Primera fase (F1a) del asistente único: puerto, adaptador, doble de pruebas y listado de modelos. Los escáneres (F1b) y el bucle del asistente (F4) se migran después; `shared/geminiTransport.ts` sigue vivo para `electron/ai` hasta F6.

## Contexto

- La app habla con Gemini en siete sitios con un transporte REST propio (`shared/geminiTransport.ts`): URL, cabeceras y cuerpo armados a mano, y un conversor de esquemas al dialecto OpenAPI con pérdidas (`toGeminiSchema`: enums numéricos como cadenas, sin `additionalProperties`).
- El asistente flotante necesita streaming, historial completo con firmas de pensamiento, cancelación con motivo y errores que distingan plazo, cancelación, cuota y servidor. Hacerlo a mano sobre REST multiplica el código que hay que mantener al ritmo de la API.
- Google publica el SDK oficial `@google/genai`. La serie 3.x tiene semanas (8 versiones entre el 6 y el 18 de noviembre de 2026) y trae valores de fábrica que rompen reglas del proyecto: continuación automática que encadena peticiones facturadas, reintentos que incluyen el 429 si se activan, un plazo que aborta sin motivo y `v1` como versión por defecto.

## Decisión

1. **Puerto propio.** El código de la app habla con `LlmClient` (`src/services/llm/types.ts`): `generate`, `stream` (eventos tipados: texto, pensamiento, llamada a función con su id y firma, uso y fin), `structured` (JSON con esquema) y `listModels`. Tipos propios, sin reexportar los del SDK. El historial conserva las partes completas del modelo; las firmas de pensamiento, las partes que la app no interpreta (código ejecutable, partes solo de firma) y los campos de parte que no lee (`partMetadata`, por ejemplo) viajan como dato opaco y vuelven intactos. Límite: el serializador del SDK filtra a nivel de parte los campos que no conoce, así que solo sobreviven los que conoce la versión fijada; y de `functionCall` solo viajan `id`, `name` y `args` (`willContinue` y `partialArgs` son de Vertex y el SDK lanza si se le reenvían). Errores tipados (`LlmError`: cancelado con el motivo de quien cancela, plazo, cuota, servidor, clave (401 o `API_KEY_INVALID`; otro 403 es petición rechazada), petición rechazada con el mensaje del servidor, modelo inexistente, red, respuesta mal formada, bloqueo) y un `finishReason` propio cerrado con `unknown` explícito para valores nuevos.
2. **Un solo adaptador** (`src/services/llm/geminiAdapter.ts`) es el único archivo que importa el SDK, y lo hace por `@google/genai/web`: el mismo código en el renderer y en las pruebas. Lo fija en un único sitio:
   - `apiVersion: 'v1beta'` escrita en el código. En `v1` no existen los modelos `-preview` ni los alias `-latest` que un usuario puede tener elegidos, ni partes de la API que usa la app; cambiarla será una decisión explícita con su prueba de contrato.
   - `automaticContinuation: false`, sin `retryOptions` y sin `httpOptions.timeout`. La política de reintentos, modelo de reserva y plazo global es del bucle o del escáner que llama, no del adaptador.
   - Un `AbortController` propio por intento con nuestro plazo; la cancelación de quien llama se traduce a `LlmError` `cancelled` con su `reason` (el SDK aborta sin motivo). Ningún `await` del SDK puede colgar el intento aunque el `fetch` ignore la señal.
   - Llamada automática a funciones desactivada; declaraciones por `parametersJsonSchema` (el mismo JSON Schema que valida el registro); nunca `temperature`, `topP` ni `topK`.
   - `fetch` inyectable por `httpOptions.fetch`.
3. **Versión exacta** `3.6.1` (sin `^`) en `dependencies`, con `package-lock.json` en el mismo cambio. Cada subida se prueba contra la prueba de contrato.
4. **En el renderer.** El puerto corre donde hoy corren el asistente flotante y los escáneres. `electron/` no importa el SDK ni directa ni transitivamente: no puede acabar en `dist-electron/main.cjs`. El catálogo de modelos (`src/services/llm/models.ts`) no importa el SDK porque `electron/ai` lo reexporta hasta F6.
5. **Pruebas sin red.** La prueba de contrato (`testLlmAdapterContract`) inspecciona con un `fetch` falso lo que el SDK manda de verdad: URL `v1beta`, clave en `x-goog-api-key` y nunca en la URL, `alt=sse` en streaming, una sola petición ante 429 y 503, ninguna continuación automática, motivo de cancelación antes y a mitad de stream, cuerpo sin muestreo, firmas y partes opacas intactas, y 403 de permiso distinto de clave inválida. `transportAsFetch` convierte los fixtures REST actuales (`GeminiTransport`) en ese `fetch`; `ScriptedLlm`/`FakeLlmClient` implementa el puerto con un guion para probar bucle y escáneres. Ambos viven en `src/tests/support/`. `testLlmBoundary` guarda la frontera por imports.

## Alternativas descartadas

- **Seguir con REST a mano.** Cada novedad de la API (streaming, firmas, nuevos motivos de fin) se reimplementaría y se probaría dos veces; el conversor de esquemas con pérdidas seguiría.
- **Llamada automática a funciones del SDK.** Ejecuta todas las llamadas de una respuesta de golpe y se queda con el bucle: no hay punto entre llamadas para ordenar las escrituras, mostrar el cambio, pedir confirmación o deshacer. Además Google la retira de `models.generateContent` en la próxima versión mayor.
- **Agent Development Kit 2.5.** Depende de `@google/genai` 2.x (dos copias del SDK en el bundle), arrastra 11 paquetes de OpenTelemetry, un ORM y un logger de servidor, y duplica lo que ya hacen el store, los permisos y el deshacer.
- **Interactions API.** Es la vía que Google recomienda, pero guarda las conversaciones 55 días por defecto (`store: true`) y cambia la forma de las peticiones. Criterio de salida: si se adopta, será una segunda implementación del mismo puerto con `store: false`, sin tocar el bucle ni la interfaz.
- **SDK en el proceso principal** con la clave cifrada. Más seguro, pero exige transmitir el streaming por IPC; queda como decisión abierta y el puerto lo permite sin cambiar a quien lo usa.

## Consecuencias

- El bundle del renderer crece con el SDK web; las cifras de cada cambio van en su PR.
- `shared/geminiTransport.ts` y su excepción en AGENTS.md siguen hasta F6, que retira `electron/ai`, el IPC `parse-invoice-with-ai`, `list-gemini-models` y `geminiInvoiceService.ts` en el mismo cambio.
- Ajustes → IA lista los modelos por el puerto (todas las páginas) en Electron y en web.
- `scripts/qa/checkToolDeclarations.ts` comprueba a mano, con una clave real y fuera de CI, que la API acepta todas las declaraciones de `shared/agentTools/definitions.ts` ([QA](../QA.md#ensayos-fuera-de-npm-test)).
