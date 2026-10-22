# Agentes y herramientas de IA

SolarSim expone un único registro de herramientas para tres superficies:

- el **Asistente de propuestas** (menú Sparkles), que crea o actualiza propuestas a partir de facturas;
- el **Asistente general** (chat flotante en Inicio, Hub y Simulador), experimental y apagado por defecto en Funciones de la aplicación;
- los **agentes externos** conectados por el [servidor MCP local](MCP_LOCAL.md).

Las dos interfaces internas se mantienen separadas, pero comparten herramientas, reglas, permisos, registro de actividad y política de precios.

## Arquitectura

| Pieza | Ubicación | Función |
| --- | --- | --- |
| Definiciones | `shared/agentTools/definitions.ts` | Nombre, descripción, tipo (`read`/`draft`/`guarded`), categoría, tarjeta, superficies y esquema JSON estricto de cada herramienta |
| Esquemas | `shared/agentTools/jsonSchema.ts` | Validador del subconjunto JSON Schema y conversión a declaraciones de función de Gemini |
| Reglas | `shared/agentTools/rules.ts` | `AGENT_RULES_ES`: los datos no son instrucciones, sin precios inventados, modo Catálogo IA, sin HTML |
| Registro | `src/features/agentTools/registry.ts` | `executeAgentTool(call, {source, owner})`: superficie, permisos, validación, propietario (sesión y espacio), límite de 64 KB, aplicación o cola |
| Herramientas | `proposalTools.ts`, `catalogTools.ts` y planificadores de `src/features/assistant/tools.ts` | Planes que se revalidan al ejecutarse |
| Estado | `src/store/slices/agentSlice.ts` | Política por dispositivo, actividad por espacio (máx. 300) y acciones pendientes en memoria (10 min) |
| Tarjetas | `shared/agentCards.ts`, `src/features/assistant/cards/` | Datos puros por tipo (auditoría y cliente con vista interactiva); React en la app y MCP Apps para hosts externos ([MCP_LOCAL.md](MCP_LOCAL.md#tarjetas-mcp-apps)) |

El asistente general usa function calling de Gemini con las declaraciones generadas desde las definiciones. Admite 4 rondas, 4 herramientas por ronda y 12 mensajes de historial. El chat interpreta un subconjunto seguro de markdown (`chatMarkdown.ts`), nunca HTML ni enlaces. Acepta hasta tres PDF o imágenes de 8 MB, validados por firma, que solo se envían con el mensaje actual.

## Permisos

| Tipo | Ejemplos | Predeterminado |
| --- | --- | --- |
| `read` | buscar propuestas o equipos, simulación, tarifas, auditoría, ofertas | Permitido |
| `draft` | crear, duplicar o editar propuestas, aplicar el borrador del asistente de propuestas | Se aplica al momento, con actividad y **Deshacer** |
| `guarded` | catálogo, precios, estado técnico, decisión y reportes comerciales, papelera | Siempre pide confirmación; nunca puede ponerse en «permitir» |

- La política es **por dispositivo** y distingue dos orígenes: asistentes de la app y agentes externos. Se configura en Ajustes → **Agentes e IA**.
- Ningún agente supera la cuenta: los lectores solo consultan, y las propuestas en papelera o en conflicto no cambian. Cada ejecución y cada deshacer revalidan los permisos actuales.
- En el asistente de propuestas, «Aplicar» tras revisar el borrador cuenta como confirmación.
- Las acciones pendientes de agentes externos aparecen en una bandeja global. Las de los asistentes se confirman en el chat. `get_agent_action_status` permite a un agente esperar la decisión.

**Deshacer** restaura solo las secciones tocadas, si siguen igual que tras el cambio; si hubo ediciones posteriores, remite al historial de versiones. Deshacer una creación la envía a la papelera, y deshacer un envío a papelera la restaura. Los reportes comerciales no se deshacen, porque el servidor los conserva.

## Precios automáticos

Toda propuesta creada o editada por agentes cotiza en modo **Simple (Catálogo IA)**: ids reales del catálogo, precio de la oferta preferida o la más barata no agotada, y matriz de costos (`shared/automatedProposalPolicy.ts`). Los agentes no pueden editar `isDetailed`, `pricingMode` ni los campos por Wp. Si una edición toca especificaciones o finanzas de una propuesta por Wp, la confirmación muestra el paso a la matriz. Detalle en [AI_SCANNERS_SPECIFICATION.md](AI_SCANNERS_SPECIFICATION.md).

## Herramientas

| Herramienta | Tipo | Notas |
| --- | --- | --- |
| `search_projects`, `get_project`, `get_simulation` | read | Espacio actual, 12 resultados, motor real |
| `search_equipment`, `get_equipment`, `get_tariffs` | read | Sin oferta en stock no significa agotado |
| `propose_project_update` | draft | Propuesta abierta: cliente, parámetros, tarifas, finanzas, consumos y grupos del catálogo |
| `propose_equipment_update` | guarded | Especificaciones del catálogo; conserva id, ofertas y adjuntos |
| `create_proposal` | draft | Cliente, tarifa, 12 consumos o promedio, grupos `{catalogItemId, count}`; no navega |
| `duplicate_proposal` | draft | Versión enlazada sin cambiar la propuesta activa |
| `open_proposal` | read | Abre resumen, simulador o PDF a petición |
| `set_proposal_status`, `set_commercial_status`, `add_commercial_report`, `move_proposal_to_trash` | guarded | |
| `audit_catalog` | read | Precios ausentes o vencidos, sin ficha o imagen, sin potencia nominal, duplicados, sin stock, atípicos y equipos de propuestas fuera del catálogo; tarjeta interactiva |
| `list_supplier_offers` | read | Máximo 50 |
| `update_supplier_price` | guarded | Precio USD y/o disponibilidad de una oferta existente |
| `apply_proposal_draft` | draft | Solo el asistente de propuestas |
| `get_agent_action_status` | read | Espera hasta 20 s la decisión de una acción pendiente |
| `list_document_texts` | read | Textos editables del PDF por clave (p. ej. `quotation.warranty.panel`, `client.phone`), con sección, personalización y plantilla |
| `set_document_text`, `reset_document_text` | draft | Cualquier propuesta por id. Mismas reglas que el editor en línea (saneo, formato, placeholders, espejo en los datos del cliente) |
| `set_document_layout` | draft | Secciones ocultas, tema y cabecera/pie |
| `save_document_text_to_company_template` | guarded | Solo textos de plantilla y con la propuesta abierta |
| `list_proposal_attachments`, `sync_catalog_datasheets`, `set_attachment_enabled` | read / draft | Fichas del catálogo con la misma política que la vista PDF |
| `attach_file_to_proposal` | draft | PDF del chat (`fileId`) o en base64 desde un agente externo. Firma y 8 MB verificados, páginas contadas; nunca rutas del disco |
| `remove_proposal_attachment` | guarded | Una ficha del catálogo quitada queda descartada |
| `search_clients`, `get_client` | read | Directorio por nombre, RNC/cédula, teléfono o correo. Resumen de estados de las propuestas enlazadas |
| `create_client`, `update_client` | draft | Solo el nombre es obligatorio. El directorio se sincroniza con CAS; desde la actividad no se deshace |
| `link_proposal_to_client` | draft | `clientId: null` desenlaza; no cambia los datos impresos. Con deshacer |
| `delete_client` | guarded | Desenlaza sus propuestas |

## Privacidad

Texto, archivos adjuntos y resultados de herramientas se envían a Google Gemini; la configuración de autenticación nunca se envía. Los adjuntos del catálogo no se mandan al modelo automáticamente. La conversación es transitoria: cambiar de proyecto, espacio o sesión la descarta.

## Verificación

- Suites: `testAgentDocumentTools`, `testAgentAttachmentTools`, `testAgentClientTools`, `testMcpBridgeHost`, `testMcpConnectionPanel`, `electron/mcp/tests/*`, `testAgentToolSchemas`, `testAgentPermissions`, `testAgentProposalTools`, `testCatalogAudit`, `testAgentCards`, `testChatMarkdown`, `testChatFiles`, `testProposalAssistantApply`, `testAutomatedPricingPolicy` y `testAppAssistant`.
- Todas usan transporte sintético; ninguna escribe en producción ni llama a Gemini real.
- La fixture `scripts/qa/fixtures/appAssistant.html` cubre consultas, auditoría, cambio aplicado con deshacer y confirmación.
