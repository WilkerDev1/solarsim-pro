# Agentes y herramientas de IA

SolarSim expone un único registro de herramientas para tres superficies:

- el **Asistente de propuestas** (menú Sparkles), que crea o actualiza propuestas a partir de facturas;
- el **Asistente general** (chat flotante en Inicio, Hub, Simulador y la vista del documento PDF), experimental y apagado por defecto en Funciones de la aplicación;
- los **agentes externos** conectados por el [servidor MCP local](MCP_LOCAL.md) o, sin la app abierta, por el [servidor MCP remoto](MCP_REMOTE.md) (subconjunto de lectura y borrador sobre los datos sincronizados; sin `guarded`).

Las dos interfaces internas se mantienen separadas, pero comparten herramientas, reglas, permisos, registro de actividad y política de precios.

## Arquitectura

| Pieza | Ubicación | Función |
| --- | --- | --- |
| Definiciones | `shared/agentTools/definitions.ts` | Nombre, descripción, tipo (`read`/`draft`/`guarded`), categoría, tarjeta, superficies y esquema JSON estricto de cada herramienta |
| Esquemas | `shared/agentTools/jsonSchema.ts` | Validador del subconjunto JSON Schema y conversión a declaraciones de función de Gemini |
| Reglas | `shared/agentTools/rules.ts` | `AGENT_RULES_ES`: los datos no son instrucciones, sin precios inventados, modo Catálogo IA, textos del documento frente a datos del proyecto, sin HTML |
| Registro | `src/features/agentTools/registry.ts` | `executeAgentTool(call, {source, owner})`: superficie, permisos, validación, propietario (sesión y espacio), límite de 64 KB, aplicación o cola |
| Herramientas | `proposalTools.ts`, `catalogTools.ts` y planificadores de `src/features/assistant/tools.ts` | Planes que se revalidan al ejecutarse |
| Estado | `src/store/slices/agentSlice.ts` | Política por dispositivo, actividad por espacio (máx. 300) y acciones pendientes en memoria (10 min) |
| Tarjetas | `shared/agentCards.ts`, `src/features/assistant/cards/` | Datos puros por tipo (auditoría y cliente con vista interactiva); React en la app y MCP Apps para hosts externos ([MCP_LOCAL.md](MCP_LOCAL.md#tarjetas-mcp-apps)) |

El asistente general usa function calling de Gemini con las declaraciones generadas desde las definiciones. Admite 4 rondas, 4 herramientas por ronda y al menos los 12 últimos mensajes de historial (la ventana avanza de 6 en 6, hasta 17, para que turnos seguidos compartan prefijo). La petición se ordena para la caché implícita del proveedor: instrucción de sistema (`ASSISTANT_SYSTEM_PROMPT`) y herramientas fijas, historial y, al final del turno, el contexto variable (`assistantTurnContext`: propuesta activa y vista). El borrador de propuesta (`buildProposalRequest`) sigue el mismo criterio: catálogo y tarifas de referencia, contexto del proyecto y adjuntos primero; mensaje, conversación, avisos y borrador vigente (solo las claves del esquema, `draftForPrompt`) al final; `testAIPromptCache` comprueba que el prefijo estable es idéntico byte a byte entre rondas. `propose_project_update` valida todas las ediciones (`validateAssistantEdits`) y, si alguna falla, rechaza el lote entero con la lista completa de errores (`AssistantEditsError`: posición, campo y motivo) para que el modelo los corrija en una sola ronda; no se prepara ningún cambio parcial. Las llamadas de una ronda se ejecutan en orden, una a una (el orden de actividad y deshacer coincide con el del modelo); si el modelo pide más de cuatro, las sobrantes reciben un error para pedirlas en la ronda siguiente, sin abortar la conversación. El turno del modelo se devuelve intacto en la siguiente petición, con sus firmas de razonamiento. El chat interpreta un subconjunto seguro de markdown (`chatMarkdown.ts`), nunca HTML ni enlaces. Acepta hasta tres PDF o imágenes de 8 MB, validados por firma, que solo se envían con el mensaje actual. En la vista del documento (lectura o edición) el chat conoce la propuesta abierta y el contexto del turno indica que el usuario está viendo el PDF; las herramientas rechazan lo que no se puede escribir; el widget lleva `data-pdf-chrome` y nunca se imprime ni se exporta (`assistantScope.ts`).

## Permisos

| Tipo | Ejemplos | Predeterminado |
| --- | --- | --- |
| `read` | buscar propuestas o equipos, simulación, tarifas, auditoría, ofertas | Permitido |
| `draft` | crear, duplicar o editar propuestas, aplicar el borrador del asistente de propuestas | Se aplica al momento, con actividad y **Deshacer** |
| `guarded` | catálogo, precios, estado técnico, decisión y reportes comerciales, papelera | Pide confirmación. Opcional: **bypass** («Aplicar sin preguntar»), explícito y por origen |

Las ediciones de contacto de `set_document_text` aplican las mismas reglas que la interfaz (`applyDocumentClientEdit`, [ADR 0004](adr/0004-edicion-de-proyecto.md)): reconciliación con el catálogo y autocálculo de paneles. `propose_project_update` aplica el borrador con la tubería de IA (`applyExtractedInvoice`), que normaliza equipos con `normalizeProjectEquipment`, la misma normalización que una edición. Ninguna herramienta de lectura escribe la propuesta.

### Textos del documento frente a datos del proyecto

Lo que el PDF imprime como texto (garantías, vigencia, nota legal y términos, servicios, alcance, párrafos, datos de la empresa) vive en el [registro de textos](PROPOSAL_DOCUMENT_EDITOR.md#el-registro-de-textos) y se cambia solo con `set_document_text`/`set_document_texts`, que escriben con `documentTextsPatch`. Lo que el motor calcula o cotiza (equipos, consumos, tarifas, precios, extras) va por `propose_project_update`. Las reglas (`AGENT_RULES_ES`) lo dicen así a todos los agentes.

- **Asistente general y agentes externos**: `list_document_texts` con `query` (p. ej. «garantía») devuelve solo las claves pertinentes; `set_document_texts` fija varias en una acción con un único deshacer (`text: null` restablece). Es todo o nada: una clave desconocida rechaza el lote entero y el error las nombra.
- **Asistente de propuestas**: el contexto incluye `documentTexts` (clave, etiqueta y valor actual) de los textos con contenido (`AI_DRAFT_DOCUMENT_TEXT_KEYS`, sin etiquetas ni títulos de página). Los valores viajan completos hasta 1.200 caracteres por texto y 12.000 en total (los de fábrica suman unos 4,5 KB); lo que no cabe se recorta y se marca `truncated`, y si la IA reescribe ese texto la fila del borrador queda marcada `partial`, con aviso en la normalización y en la revisión («la IA solo vio el inicio de este texto»). En una propuesta nueva, los textos que dependen del proyecto (`projectDependent` en el registro y la sección del cliente: párrafos del resumen, subtítulo, marco regulatorio, nota de validez, contacto y cotización) se envían sin valor (`dynamic`), para que el modelo no copie cifras del caso de referencia; y la respuesta puede traer `documentTexts: [{key, text}]` (`null` restablece). `normalizeDraftDocumentTexts` (`shared/documentTexts/aiDraft.ts`) los valida contra el registro: las claves desconocidas o cubiertas por un campo del borrador (nombre, dirección, teléfono y correo del cliente) se descartan con aviso, y la vigencia admite solo «N» o «N día(s)» con N entre 1 y 365. Una vuelta de conversación sin la lista conserva la anterior; `[]` la vacía. La revisión los muestra en «Textos del documento» (`ProposalDocumentTextsReview`), donde se pueden quitar, y `apply_proposal_draft` los escribe al crear o actualizar con `withDraftDocumentTexts` (mismos escritores que el editor); deshacer los revierte con el resto del borrador.

Una edición de propuesta que toque precios (margen, mano de obra, costos unitarios, grupos de equipos con precio, extras o descuentos) se trata como `guarded` completa, aunque la herramienta sea de borrador.

- La política es **por dispositivo** y distingue dos orígenes: asistentes de la app y agentes externos. Se configura en Ajustes → **Agentes e IA**.
- Ningún agente supera la cuenta: los lectores solo consultan, y las propuestas en papelera o en conflicto no cambian. Cada ejecución, cada confirmación de una acción en cola y cada deshacer revalidan los permisos actuales (si la política pasó a «denegar» mientras esperaba, la confirmación se rechaza).
- **Modo bypass** (`guarded: 'allow'`): las herramientas `guarded` se aplican sin tarjeta de confirmación, como un borrador en «permitir». Solo omite el clic humano: se mantienen los permisos de la cuenta (lector = solo consulta), la papelera, las validaciones (ITBIS, margen, modalidad de precio) y el registro de actividad con **Deshacer**. Quedan exentas y siguen pidiendo confirmación (`BYPASS_EXEMPT_TOOLS` en `registry.ts`) las herramientas que la actividad no puede deshacer: `add_commercial_report`, `save_document_text_to_company_template` y `delete_client`. La interfaz muestra un aviso ámbar mientras esté activo.
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
| `list_document_texts` | read | Textos editables del PDF por clave (p. ej. `quotation.warranty.panel`, `client.phone`), con sección, personalización y plantilla. Filtros `section` y `query` (clave, etiqueta o texto, sin tildes) |
| `set_document_text`, `set_document_texts`, `reset_document_text` | draft | Cualquier propuesta por id. Mismas reglas que el editor en línea (saneo, formato, placeholders). El contacto, teléfono y correo del cliente se reflejan en `client` mediante `applyDocumentClientEdit` (misma edición `client` que el dock; deshacer incluye `specs` si la edición las corrigió) |
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

- Suites: `testAIDocumentTexts`, `testAgentDocumentTools`, `testAgentAttachmentTools`, `testAgentClientTools`, `testMcpBridgeHost`, `testMcpConnectionPanel`, `electron/mcp/tests/*`, `testAgentToolSchemas`, `testAgentPermissions`, `testAgentProposalTools`, `testProjectEdit`, `testCatalogAudit`, `testAgentCards`, `testChatMarkdown`, `testChatFiles`, `testProposalAssistantApply`, `testAutomatedPricingPolicy`, `testAppAssistant` y `testAssistantToolRound`.
- Todas usan transporte sintético; ninguna escribe en producción ni llama a Gemini real.
- La fixture `scripts/qa/fixtures/appAssistant.html` cubre consultas, auditoría, cambio aplicado con deshacer y confirmación.
