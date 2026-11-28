# Contrato congelado con los agentes externos

Mientras se construye el asistente único (fases F3 a F7 del plan del asistente), lo que ven los agentes externos (Claude Code, Codex, Claude Desktop, ChatGPT y Claude.ai por el [MCP local](MCP_LOCAL.md) o el [remoto](MCP_REMOTE.md)) no cambia ni un byte. Por eso la 2.11.0 es **solo de cliente**: no hay que redesplegar `mcp-remote`, la API ni el visor, ni subir `MIN_CLIENT_VERSION`.

## Qué está congelado

| Pieza | Dónde vive | Quién la recibe |
| --- | --- | --- |
| `AGENT_RULES_ES` | `shared/agentTools/rules.ts` | Instrucciones del MCP local (`electron/mcp`), prefijo de las del remoto y capa 1 del asistente de la app |
| `REMOTE_INSTRUCTIONS` | `mcp-remote/src/protocol.ts` | `initialize` del MCP remoto |
| Las 12 herramientas remotas: `search_projects`, `get_project`, `search_equipment`, `get_equipment`, `get_price_history`, `list_supplier_offers`, `get_tariffs`, `search_clients`, `get_client`, `create_client`, `update_client`, `link_proposal_to_client` (nombre, título, tipo, alcance, descripción y esquema) | `shared/agentTools/definitions.ts` más los parches de `mcp-remote/src/tools.ts` | `tools/list` del MCP remoto |
| La definición de `propose_project_update` | `shared/agentTools/definitions.ts` | MCP local; sigue funcionando una versión más como fachada (ver abajo) |
| Los tipos de herramienta `read`, `draft` y `guarded` | `shared/agentTools/types.ts` | Todos: un tipo desconocido hace que `electron/mcp` descarte la lista entera |

Lo nuevo del asistente de la app se declara en el cliente (`src/features/agentTools/appAssistant/`) y no en `shared/`, justamente para no tocar esto.

## Cómo se vigila

- `src/tests/testFrozenAgentContract.ts`: guarda con las huellas SHA-256 de cada pieza escritas en la prueba. **No** se regenera con `UPDATE_GOLDEN=1`; también comprueba que las copias doradas de F0 dicen lo mismo que el código, así una copia regenerada sin descongelar también falla. Importa el código real de `mcp-remote` (sin red ni dependencias propias), de modo que `npm test` del cliente ya detecta un cambio en las herramientas remotas.
- Las copias doradas de F0: `src/tests/golden/agent-rules-es.txt` y `mcp-local-tools.json` (`testAgentContractGolden`), y `mcp-remote/tests/golden/` (`npm --prefix mcp-remote test`).
- `src/tests/testAssistantInstructions.ts`: la capa 1 de las instrucciones del asistente es `AGENT_RULES_ES` byte a byte y el mismo prefijo que recibe el remoto; los agentes externos reciben solo esa capa.

## Instrucciones en tres capas

`buildSystemInstruction(superficie, contexto)` (`src/features/agentTools/appAssistant/instructions.ts`, puro) compone:

1. **Invariantes compartidos**: `AGENT_RULES_ES` tal cual.
2. **Guía de herramientas**, generada de las declaraciones de la superficie (grupos por tipo, en el orden del conjunto) y del registro de campos; dice el equivalente de las herramientas que nombra la capa 1 y que la app tiene con otro nombre (`propose_project_update` → `edit_proposal`, `set_document_text` → `set_document_texts`).
3. **Conducta del asistente de la app**: proactivo, no se rinde, crea con valores por defecto y lo dice, supuestos solo de la lista cerrada (Ajustes, fábrica, `SIZING_ASSUMPTIONS`, datos de la propuesta; `appAssistant/assumptions.ts`), nunca inventa precios, español y breve. Las cifras que cita salen de las constantes del código.

La superficie `mcp` recibe solo la capa 1 mientras dure el congelamiento. Nada vivo (propuesta abierta, fecha) entra en las instrucciones: el prefijo es estable y cacheable; el contexto vivo va al final del turno y en los resultados de las herramientas. La instantánea es `src/tests/golden/app-assistant-system-instruction.txt` (esta sí se regenera, con `UPDATE_GOLDEN=1 npm test -- AssistantInstructions`, cuando la guía o la conducta cambian a propósito; cambiarla rompe una vez la caché del prefijo). El asistente flotante antiguo sigue con `ASSISTANT_SYSTEM_PROMPT` hasta que F4 lo cambie.

## Fachada de `propose_project_update`

Misma definición y mismo resultado observable para el agente (`{status, edits}`, permisos, cola, actividad y deshacer). Al escribir un plan confirmado, `src/features/agentTools/proposeProjectUpdateFacade.ts` delega en `commitProjectEdits` (una escritura, un sello, un autosync y un paso de deshacer con las rutas de campo) **solo** si la transacción deja exactamente la misma propuesta que el camino antiguo (un parche por sección: cliente, specs, tarifas, finanzas, consumos). Si no, escribe como siempre:

- `rules_differ`: las reglas nuevas darían otra propuesta; p. ej. una tarifa por ruta trae su precio de referencia y su perfil, que el camino antiguo conservaba;
- `rejected`: la transacción rechaza el lote (un campo que el registro no conoce o fuera de su rango estricto);
- `no_changes`: sin cambios, el camino antiguo estampa y sincroniza igualmente.

Lo fija `testProposeProjectUpdateFacade`; la caracterización de F0 (`testAssistantEditCharacterization`, equipos + tarifa) sigue igual.

## Hasta cuándo

Hasta el release que retire el camino antiguo y prevea el despliegue de `mcp-remote` (F7 del plan, después de la 2.11.0). En ese release se decide si `propose_project_update` se retira o queda como alias marcado «obsoleta», y si `AGENT_RULES_ES` se reescribe sin nombres de herramientas (la guía de cada superficie ya los da).

## Cómo se descongela

En **un** PR, a propósito y con estos pasos:

1. Cambiar el texto o la definición.
2. Regenerar las copias doradas (`UPDATE_GOLDEN=1 npm test -- Golden` y `UPDATE_GOLDEN=1 npm --prefix mcp-remote test`) y revisar el diff.
3. Actualizar a mano las huellas de `testFrozenAgentContract.ts` y este documento.
4. Pasar además los gates de `server/` y `mcp-remote/` ([AGENTS.md](../AGENTS.md#gates-antes-de-dar-un-trabajo-por-terminado)).
5. Prever en el release el redespliegue de `mcp-remote` (procedimiento en [MCP_REMOTE.md](MCP_REMOTE.md)) y avisar en las notas de versión: los clientes MCP guardan nombres de herramientas en sus permisos (`mcp__solarsim__…`) y en sus automatizaciones.
