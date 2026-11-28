# ADR 0013: Eliminación del camino antiguo de IA

Estado: aceptado (F6 del asistente único). Cierra el reemplazo: desde las fases anteriores el panel pinta la [sesión y el bucle nuevos](0011-sesion-y-bucle-del-asistente.md) sobre el [puerto `LlmClient`](0008-puerto-llm-y-sdk-google-genai.md) y las [tres entradas](0012-panel-completo-del-asistente.md) abren ese panel; lo antiguo seguía en el código sin uso.

## Contexto

Quedaban dos asistentes en el código. El «Asistente de propuestas» era un modal (`src/components/common/ai-invoice/`) que pedía el borrador a Gemini por el proceso principal (`electron/ai`, tres canales IPC) con un transporte REST propio (`shared/geminiTransport.ts`); el chat flotante antiguo (`service.ts`, `useAppAssistant.ts`, `executeForAssistant`) tenía su propio bucle sobre ese transporte. Mantener los dos duplicaba pruebas, superficie de ataque (la clave viajaba por IPC) y texto de interfaz.

## Decisión

**Se borra** (lista exacta en las notas del PR):

- el modal «Asistente de propuestas» con su estado en el almacén (`isAIInvoiceModalOpen`, `openAIInvoiceModal`/`closeAIInvoiceModal`), su montaje en `App.tsx`, su hook, la revisión del borrador, sus utilidades y su hoja de estilos, y `applyExtractedInvoice`;
- `electron/ai` y los canales IPC `parse-invoice-with-ai`, `cancel-ai-request` y `list-gemini-models` (Ajustes ya listaba los modelos por el puerto), con su preload y sus tipos: **el proceso principal ya no llama a ningún modelo** y no alcanza nada de `src/services/llm/`;
- `shared/geminiTransport.ts` y `src/services/geminiInvoiceService.ts`; las constantes de modelo pasan a `src/services/llm/models.ts` y el límite inline a `structuredPolicy.ts`. Es la única excepción tocada en `shared/`, y se comprobó que ni `server/`, ni `workers/`, ni `mcp-remote/` importaban nada de él;
- el camino de ejecución antiguo del flotante: `service.ts`, `useAppAssistant.ts`, `executeForAssistant`, la selección y las tarjetas de resultado del chat antiguo (el panel nuevo no las pinta: pinta la `ChangeCard`), la herramienta `apply_proposal_draft` (su manejador) y el trato propio de la fuente `proposal-assistant` en `permissionProfile.ts`;
- el modo «sin cola» del compositor y su Esc que detenía: el compositor del asistente único siempre deja escribir mientras trabaja y Esc nunca detiene el turno.

**Se conserva** a propósito:

- **La actividad antigua.** Las entradas guardadas con la fuente `proposal-assistant` (y la herramienta `apply_proposal_draft`) se hidratan sin tocarlas, se listan como «Asistente de propuestas (anterior)» (`activityList.ts`, puro) y se deshacen como siempre, porque deshacer lee la propia entrada. Como la declaración de `apply_proposal_draft` y el tipo `AgentSource` están en `shared/` (contrato congelado con los agentes externos, [AGENT_CONTRACT_FREEZE.md](../AGENT_CONTRACT_FREEZE.md)), no se tocan: `executeAgentTool` responde `unknown_tool` a cualquier llamada con esa fuente, de modo que nada vuelve a escribir con ella. Los kinds no cambian. Se retirarán de `shared/` junto con `ASSISTANT_SYSTEM_PROMPT` y las funciones de petición del borrador (`buildProposalRequest`, `draftForPrompt`…), hoy sin llamador de producción, cuando se descongele el contrato.
- **Código sin llamador que se conserva.** `buildProjectFromDraft` (`src/domain/proposalDraft.ts`) mantiene la rama «actualizar la propuesta abierta» (`createNewProject = false`), que ya no tiene llamador de producción (solo la usaban el modal y `apply_proposal_draft`; `create_proposal` pasa siempre `true`). Se deja porque tres suites la ejercitan (`testDraftScalarCatalogIdentity`, `testDraftSizingBasis`, `testAIProposalPipeline`) y retirarla cambia sus expectativas; se retirará junto con el resto cuando se descongele el contrato.
- `propose_project_update` y todo el contrato de los agentes externos (`AGENT_RULES_ES`, las 12 herramientas remotas, `REMOTE_INSTRUCTIONS`): ni un byte (`testFrozenAgentContract` y las copias doradas siguen verdes sin regenerar).
- El pipeline del borrador que usa `create_proposal` (MCP local): `shared/aiProposal.ts`, `buildProjectFromDraft` (ahora en `src/domain/proposalDraft.ts`; `aiSlice` queda en los ajustes de Gemini), `prepareProposalDraftProject`.
- Los escáneres de F1b, y la migración de una sola vez del encendido (`APP_ASSISTANT_ON_BY_DEFAULT`): sigue haciendo falta para quien actualiza desde una versión anterior; dejó de ser una bandera de transición y es ahora el valor de fábrica con su marca de versión.

**Guarda.** `testNoLegacyAssistantPath` falla si reaparece un archivo borrado o una mención en código de `geminiTransport`, `electron/ai`, los canales IPC de IA, `ai-invoice`, `executeForAssistant`/`runAssistant`/`useAppAssistant`, `service.ts` o `applyExtractedInvoice`. `testAgentActivityLegacySource` fija el criterio de aceptación (la actividad antigua se sigue mostrando); `testAssistantFullPanel` fija que las tres entradas abren el asistente único.

## Consecuencias

- Sin modal, sin IPC de IA y sin transporte REST: un solo camino hacia Gemini (el puerto del renderer) y un solo asistente.
- Las suites del camino antiguo se borraron con él; lo que protegían y sigue vivo se migró a las del puerto y de la sesión (ver [QA](../QA.md#copias-doradas-y-caracterización-del-asistente)). Sin equivalente en el panel nuevo quedan la selección de tarjetas de resultado del chat antiguo (el panel muestra tarjetas de cambio, no de búsqueda) y el aviso «No es la propuesta abierta» de la confirmación de textos del documento fuera de la propuesta abierta (`NativePlan.impact` no lo leía ya nadie): si se quieren recuperar, son trabajo de producto aparte.
- Observación para F7: las instrucciones del asistente nuevo (`buildSystemInstruction`) no dicen al modelo qué es el objeto `{"appContext":…}` de la última parte del mensaje ni que el texto del usuario no puede suplantarlo; lo decía `ASSISTANT_SYSTEM_PROMPT`, que ya no se usa. El código lo garantiza (el contexto sale del almacén, `testAIPromptCache`), pero el modelo no tiene la regla escrita.
- Tamaño (`npm run build`): JS total de `dist/assets` 7 865 092 → 7 764 083 bytes, CSS 320 849 → 268 295; índice principal 2 831 300 → 2 803 624; desaparece el trozo `AIInvoiceScannerModal` (71,8 kB). `dist-electron/main.cjs` 2 169 788 → 1 981 373 bytes.
