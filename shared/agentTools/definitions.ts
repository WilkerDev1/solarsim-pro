// Single catalog of agent tools shared by the proposal assistant, the general assistant and the local MCP server.
import type { AgentToolDefinition, JsonSchema } from './types';

const ALL = ['app-assistant', 'proposal-assistant', 'mcp'] as const;
const id = (description: string): JsonSchema => ({ type: 'string', minLength: 1, maxLength: 128, description });
const query: JsonSchema = { type: 'string', maxLength: 200, description: 'Texto a buscar; vacío lista los primeros resultados.' };
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: 'object', properties, required, additionalProperties: false,
});
const edits = (sections: string[]): JsonSchema => ({
  type: 'array',
  maxItems: 40,
  description: 'Campos a cambiar. valueJson es el valor serializado en JSON, por ejemplo 95, true, "Santiago" o doce consumos.',
  items: object({
    section: { type: 'string', enum: sections },
    field: { type: 'string', minLength: 1, maxLength: 64 },
    valueJson: { type: 'string', maxLength: 20000 },
  }, ['section', 'field', 'valueJson']),
});

const groups = (description: string): JsonSchema => ({
  type: 'array', maxItems: 6, description,
  items: object({ catalogItemId: id('ID real del catálogo.'), count: { type: 'integer', minimum: 1, maximum: 100000 } }, ['catalogItemId', 'count']),
});
const DISTRIBUTORS = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'];

const PROPOSAL_AND_CATALOG_TOOLS: AgentToolDefinition[] = [
  {
    name: 'create_proposal', title: 'Crear propuesta', kind: 'draft', category: 'proposals', card: 'proposal', surfaces: [...ALL],
    description: 'Crea una propuesta nueva en modo Simple (Catálogo IA): equipos reales del catálogo con precio de la oferta preferida o la más barata disponible. Indica doce consumos mensuales o un promedio. No abre la propuesta; usa open_proposal si el usuario quiere verla.',
    inputSchema: object({
      clientName: { type: 'string', minLength: 1, maxLength: 200 },
      company: { type: 'string', maxLength: 200 },
      province: { type: 'string', maxLength: 100, description: 'Provincia de República Dominicana.' },
      address: { type: 'string', maxLength: 300 },
      phone: { type: 'string', maxLength: 40 },
      email: { type: 'string', maxLength: 200 },
      distributor: { type: 'string', enum: DISTRIBUTORS },
      tariffCode: { type: 'string', minLength: 1, maxLength: 16, description: 'Código tarifario, p. ej. BTS1, BTS2, MTD.' },
      monthlyConsumptionKWh: { type: 'array', maxItems: 12, items: { type: 'number', minimum: 0, maximum: 10000000 }, description: 'Doce consumos de enero a diciembre.' },
      averageMonthlyKWh: { type: 'number', minimum: 1, maximum: 10000000 },
      targetCoveragePct: { type: 'number', minimum: 1, maximum: 300 },
      panels: groups('Grupos de paneles del catálogo.'),
      inverters: groups('Grupos de inversores del catálogo.'),
      batteries: groups('Grupos de baterías del catálogo (opcional).'),
      marginPct: { type: 'number', minimum: 0, maximum: 1000, description: 'Recargo sobre costo en %, p. ej. 28.' },
      installationUnitPriceUSD: { type: 'number', minimum: 0, maximum: 100000, description: 'Mano de obra USD/kWp.' },
    }, ['clientName', 'distributor', 'tariffCode', 'panels', 'inverters']),
  },
  {
    name: 'duplicate_proposal', title: 'Duplicar propuesta', kind: 'draft', category: 'proposals', card: 'proposal', surfaces: [...ALL],
    description: 'Duplica una propuesta como nueva versión enlazada a la original.',
    inputSchema: object({ id: id('ID de la propuesta a duplicar.') }, ['id']),
  },
  {
    name: 'open_proposal', title: 'Abrir propuesta', kind: 'read', category: 'navigation', card: 'proposal', surfaces: [...ALL],
    description: 'Abre una propuesta en la aplicación (resumen, simulador o PDF). Solo cuando el usuario lo pide.',
    inputSchema: object({ id: id('ID de la propuesta.'), view: { type: 'string', enum: ['project-hub', 'simulator', 'pdf-preview'] } }, ['id']),
  },
  {
    name: 'set_proposal_status', title: 'Cambiar estado técnico', kind: 'guarded', category: 'proposals', card: 'pending-action', surfaces: [...ALL],
    description: 'Cambia el estado Borrador/Final/Archivada. Requiere confirmación en la app.',
    inputSchema: object({ id: id('ID de la propuesta.'), status: { type: 'string', enum: ['Draft', 'Final', 'Archived'] } }, ['id', 'status']),
  },
  {
    name: 'set_commercial_status', title: 'Cambiar decisión comercial', kind: 'guarded', category: 'commercial', card: 'pending-action', surfaces: [...ALL],
    description: 'Cambia la decisión comercial (pending, approved, rejected, test). Requiere confirmación en la app.',
    inputSchema: object({ id: id('ID de la propuesta.'), status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'test'] } }, ['id', 'status']),
  },
  {
    name: 'add_commercial_report', title: 'Agregar reporte comercial', kind: 'guarded', category: 'commercial', card: 'pending-action', surfaces: [...ALL],
    description: 'Agrega un reporte fechado al seguimiento comercial; opcionalmente actualiza la decisión. Requiere confirmación.',
    inputSchema: object({
      id: id('ID de la propuesta.'), note: { type: 'string', minLength: 1, maxLength: 4000 },
      status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'test'], description: 'Si se indica, también cambia la decisión actual.' },
    }, ['id', 'note']),
  },
  {
    name: 'move_proposal_to_trash', title: 'Enviar a papelera', kind: 'guarded', category: 'proposals', card: 'pending-action', surfaces: [...ALL],
    description: 'Envía una propuesta a la papelera (recuperable 30 días). Requiere confirmación.',
    inputSchema: object({ id: id('ID de la propuesta.') }, ['id']),
  },
  {
    name: 'list_document_texts', title: 'Consultar textos del documento', kind: 'read', category: 'documents', surfaces: [...ALL],
    description: 'Lista los textos editables del PDF de una propuesta (clave, etiqueta, texto actual, si está personalizado y si admite plantilla). Filtra por sección: company, client, cover, aboutUs, benefits, techIntro, projectDescription, quotation, etc.',
    inputSchema: object({ proposalId: id('ID de la propuesta.'), section: { type: 'string', maxLength: 40 } }, ['proposalId']),
  },
  {
    name: 'set_document_text', title: 'Editar texto del documento', kind: 'draft', category: 'documents', surfaces: [...ALL],
    description: 'Cambia un texto del PDF por su clave (p. ej. quotation.warranty.panel, client.phone, aboutUs.intro). Admite **negrita**, *cursiva* y viñetas "- " en textos enriquecidos y placeholders como {clientName}. Consulta las claves con list_document_texts.',
    inputSchema: object({ proposalId: id('ID de la propuesta.'), key: { type: 'string', minLength: 3, maxLength: 80 }, text: { type: 'string', maxLength: 8000 } }, ['proposalId', 'key', 'text']),
  },
  {
    name: 'reset_document_text', title: 'Restablecer texto del documento', kind: 'draft', category: 'documents', surfaces: [...ALL],
    description: 'Vuelve un texto del PDF a su valor predeterminado (los textos dinámicos vuelven a calcularse).',
    inputSchema: object({ proposalId: id('ID de la propuesta.'), key: { type: 'string', minLength: 3, maxLength: 80 } }, ['proposalId', 'key']),
  },
  {
    name: 'set_document_layout', title: 'Diseño del documento', kind: 'draft', category: 'documents', surfaces: [...ALL],
    description: 'Oculta secciones del PDF, cambia el tema de color o la cabecera/pie. Secciones: cover, tableOfContents, executiveSummary, aboutUs, benefits, techIntro, projectDescription, energy, quotation, roi, cashFlow, costMatrix.',
    inputSchema: object({
      proposalId: id('ID de la propuesta.'),
      hiddenSections: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 40 }, description: 'Secciones a ocultar.' },
      visibleSections: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 40 }, description: 'Secciones a mostrar (p. ej. costMatrix, oculta por defecto).' },
      themeId: { type: 'string', maxLength: 40 },
      showHeadersFooters: { type: 'boolean' },
    }, ['proposalId']),
  },
  {
    name: 'save_document_text_to_company_template', title: 'Guardar textos en la plantilla de la empresa', kind: 'guarded', category: 'documents', surfaces: [...ALL],
    description: 'Guarda textos (no los del cliente) como plantilla de la empresa emisora para futuras propuestas. Requiere la propuesta abierta y confirmación.',
    inputSchema: object({ proposalId: id('ID de la propuesta abierta.'), keys: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 80 } } }, ['proposalId', 'keys']),
  },
  {
    name: 'list_proposal_attachments', title: 'Consultar anexos', kind: 'read', category: 'attachments', surfaces: [...ALL],
    description: 'Lista los PDF anexados a una propuesta (fichas del catálogo y anexos manuales) con su estado de fusión e índice.',
    inputSchema: object({ proposalId: id('ID de la propuesta.') }, ['proposalId']),
  },
  {
    name: 'sync_catalog_datasheets', title: 'Anexar fichas del catálogo', kind: 'draft', category: 'attachments', surfaces: [...ALL],
    description: 'Anexa las fichas técnicas del catálogo de los equipos usados en la propuesta (y retira las de equipos que ya no están).',
    inputSchema: object({ proposalId: id('ID de la propuesta.') }, ['proposalId']),
  },
  {
    name: 'set_attachment_enabled', title: 'Configurar anexo', kind: 'draft', category: 'attachments', surfaces: [...ALL],
    description: 'Activa o desactiva la fusión de un anexo al exportar, su presencia en el índice o su título.',
    inputSchema: object({ proposalId: id('ID de la propuesta.'), attachmentId: id('ID del anexo.'), enabled: { type: 'boolean' }, inTableOfContents: { type: 'boolean' }, title: { type: 'string', maxLength: 200 } }, ['proposalId', 'attachmentId']),
  },
  {
    name: 'attach_file_to_proposal', title: 'Anexar PDF', kind: 'draft', category: 'attachments', surfaces: [...ALL],
    description: 'Anexa un PDF a la propuesta: un archivo adjuntado en el chat (fileId) o, para agentes externos, el contenido en base64 (máx. 8 MB). Nunca rutas del disco.',
    inputSchema: object({
      proposalId: id('ID de la propuesta.'), fileId: { type: 'string', maxLength: 128 }, fileName: { type: 'string', maxLength: 200 },
      contentBase64: { type: 'string', maxLength: 11200000 }, title: { type: 'string', maxLength: 200 },
    }, ['proposalId']),
  },
  {
    name: 'remove_proposal_attachment', title: 'Quitar anexo', kind: 'guarded', category: 'attachments', surfaces: [...ALL],
    description: 'Quita un anexo de la propuesta; una ficha del catálogo queda descartada para no volver a añadirse. Requiere confirmación.',
    inputSchema: object({ proposalId: id('ID de la propuesta.'), attachmentId: id('ID del anexo.') }, ['proposalId', 'attachmentId']),
  },
  {
    name: 'search_clients', title: 'Buscar clientes', kind: 'read', category: 'clients', card: 'client', surfaces: [...ALL],
    description: 'Busca en el directorio de clientes por nombre, RNC/cédula, teléfono o correo. Incluye cuántas propuestas tiene enlazadas cada uno.',
    inputSchema: object({ query: { type: 'string', maxLength: 200 }, kind: { type: 'string', enum: ['persona', 'empresa', 'all'] } }),
  },
  {
    name: 'get_client', title: 'Consultar cliente', kind: 'read', category: 'clients', card: 'client', surfaces: [...ALL],
    description: 'Datos del cliente, propuestas enlazadas y resumen de sus estados (borrador/final/archivada y decisión comercial).',
    inputSchema: object({ id: id('ID del cliente.') }, ['id']),
  },
  {
    name: 'create_client', title: 'Crear cliente', kind: 'draft', category: 'clients', card: 'client', surfaces: [...ALL],
    description: 'Crea un cliente en el directorio. Solo el nombre es obligatorio. Es independiente del nombre impreso en las propuestas.',
    inputSchema: object({
      name: { type: 'string', minLength: 1, maxLength: 255 },
      kind: { type: 'string', enum: ['persona', 'empresa'] },
      taxId: { type: 'string', maxLength: 32, description: 'RNC o cédula.' }, phone: { type: 'string', maxLength: 64 }, email: { type: 'string', maxLength: 255 },
      address: { type: 'string', maxLength: 500 }, province: { type: 'string', maxLength: 100 }, notes: { type: 'string', maxLength: 4000 },
    }, ['name']),
  },
  {
    name: 'update_client', title: 'Editar cliente', kind: 'draft', category: 'clients', card: 'client', surfaces: [...ALL],
    description: 'Actualiza datos opcionales de un cliente del directorio.',
    inputSchema: object({
      id: id('ID del cliente.'), name: { type: 'string', minLength: 1, maxLength: 255 },
      kind: { type: 'string', enum: ['persona', 'empresa'] },
      taxId: { type: 'string', maxLength: 32, description: 'RNC o cédula.' }, phone: { type: 'string', maxLength: 64 }, email: { type: 'string', maxLength: 255 },
      address: { type: 'string', maxLength: 500 }, province: { type: 'string', maxLength: 100 }, notes: { type: 'string', maxLength: 4000 },
    }, ['id']),
  },
  {
    name: 'link_proposal_to_client', title: 'Enlazar propuesta con cliente', kind: 'draft', category: 'clients', surfaces: [...ALL],
    description: 'Enlaza una propuesta con un cliente del directorio (clientId null la desenlaza). No cambia el nombre ni los datos impresos en la propuesta.',
    inputSchema: object({ proposalId: id('ID de la propuesta.'), clientId: { type: 'string', maxLength: 64, nullable: true } }, ['proposalId']),
  },
  {
    name: 'delete_client', title: 'Eliminar cliente', kind: 'guarded', category: 'clients', surfaces: [...ALL],
    description: 'Elimina un cliente del directorio y desenlaza sus propuestas (sus datos impresos no cambian). Requiere confirmación.',
    inputSchema: object({ id: id('ID del cliente.') }, ['id']),
  },
  {
    name: 'apply_proposal_draft', title: 'Aplicar borrador del asistente de propuestas', kind: 'draft', category: 'proposals', card: 'proposal',
    surfaces: ['proposal-assistant'],
    description: 'Aplica el borrador revisado del asistente de propuestas (crear o actualizar la propuesta abierta). Uso interno de la interfaz de revisión.',
    inputSchema: object({ draft: { type: 'object', description: 'Borrador normalizado y revisado por el usuario.' }, createNew: { type: 'boolean' } }, ['draft', 'createNew']),
  },
  {
    name: 'audit_catalog', title: 'Auditar inventario', kind: 'read', category: 'catalog', card: 'catalog-audit', surfaces: [...ALL],
    description: 'Audita el catálogo: precios ausentes o vencidos, sin ficha o imagen, sin potencia nominal, duplicados, sin stock, precios atípicos y equipos de propuestas que no están en el catálogo.',
    inputSchema: object({ staleDays: { type: 'integer', minimum: 1, maximum: 3650 }, type: { type: 'string', enum: ['panel', 'inverter', 'battery'] } }),
  },
  {
    name: 'list_supplier_offers', title: 'Consultar ofertas', kind: 'read', category: 'pricing', surfaces: [...ALL],
    description: 'Lista ofertas de proveedores por equipo, proveedor o texto. Máximo 50.',
    inputSchema: object({ equipmentId: id('ID del equipo.'), supplier: { type: 'string', maxLength: 120 }, query: { type: 'string', maxLength: 200 } }),
  },
  {
    name: 'update_supplier_price', title: 'Actualizar oferta', kind: 'guarded', category: 'pricing', card: 'pending-action', surfaces: [...ALL],
    description: 'Cambia el precio USD y/o la disponibilidad de una oferta existente. Requiere confirmación en la app.',
    inputSchema: object({
      equipmentId: id('ID del equipo.'), offerId: id('ID de la oferta.'),
      priceUSD: { type: 'number', minimum: 0, maximum: 10000000 },
      stockStatus: { type: 'string', enum: ['in_stock', 'on_order', 'out_of_stock', 'consult'] },
    }, ['equipmentId', 'offerId']),
  },
];

export const AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = [
  {
    name: 'search_projects', title: 'Buscar propuestas', kind: 'read', category: 'proposals', card: 'proposal', surfaces: [...ALL],
    description: 'Busca propuestas del espacio actual por nombre, código o provincia. Máximo 12.',
    inputSchema: object({ query }),
  },
  {
    name: 'get_project', title: 'Consultar propuesta', kind: 'read', category: 'proposals', card: 'proposal', surfaces: [...ALL],
    description: 'Consulta datos y resultados calculados de una propuesta por id (por defecto la abierta).',
    inputSchema: object({ id: id('ID de la propuesta.') }),
  },
  {
    name: 'get_simulation', title: 'Consultar simulación', kind: 'read', category: 'proposals', card: 'proposal', surfaces: [...ALL],
    description: 'Consulta la simulación actual o indicada; los resultados provienen del motor real.',
    inputSchema: object({ id: id('ID de la propuesta.') }),
  },
  {
    name: 'search_equipment', title: 'Buscar equipos', kind: 'read', category: 'catalog', card: 'equipment', surfaces: [...ALL],
    description: 'Busca catálogo por marca/modelo. unavailableOnly indica sin oferta confirmada in_stock, no implica agotado.',
    inputSchema: object({ query, unavailableOnly: { type: 'boolean' } }),
  },
  {
    name: 'get_equipment', title: 'Consultar equipo', kind: 'read', category: 'catalog', card: 'equipment', surfaces: [...ALL],
    description: 'Consulta un equipo con ofertas y referencias de adjuntos.',
    inputSchema: object({ id: id('ID del equipo del catálogo.') }, ['id']),
  },
  {
    name: 'get_tariffs', title: 'Consultar tarifas', kind: 'read', category: 'reference', surfaces: [...ALL],
    description: 'Consulta las referencias de tarifa y su procedencia.',
    inputSchema: object({}),
  },
  {
    name: 'propose_project_update', title: 'Editar propuesta', kind: 'draft', category: 'proposals', card: 'pending-action', surfaces: [...ALL],
    description: 'Prepara cambios en la propuesta abierta. Grupos panels/inverters/batteries requieren [{id del catálogo,count,unitPriceUSD confirmado}]; no inventes precios. customItems/customDiscounts son listas completas con ids y descripción.',
    inputSchema: object({
      id: id('ID de la propuesta abierta.'),
      title: { type: 'string', maxLength: 150, description: 'Resumen breve del cambio.' },
      edits: edits(['client', 'specs', 'rates', 'financials', 'consumption']),
    }, ['id', 'edits']),
  },
  {
    name: 'propose_equipment_update', title: 'Editar equipo del catálogo', kind: 'guarded', category: 'catalog', card: 'pending-action', surfaces: [...ALL],
    description: 'Prepara cambios de especificaciones del catálogo para confirmar. Preserva id, ofertas y adjuntos.',
    inputSchema: object({
      id: id('ID del equipo del catálogo.'),
      title: { type: 'string', maxLength: 150, description: 'Resumen breve del cambio.' },
      edits: edits(['equipment']),
    }, ['id', 'edits']),
  },
  {
    name: 'get_agent_action_status', title: 'Estado de una acción pendiente', kind: 'read', category: 'reference', surfaces: [...ALL],
    description: 'Consulta si una acción que esperaba confirmación fue aplicada, rechazada o caducó. waitSeconds espera la decisión hasta 20 s.',
    inputSchema: object({ actionId: id('ID devuelto como pending_confirmation.'), waitSeconds: { type: 'integer', minimum: 0, maximum: 20 } }, ['actionId']),
  },
  ...PROPOSAL_AND_CATALOG_TOOLS,
];

export function findAgentTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOL_DEFINITIONS.find((d) => d.name === name);
}
