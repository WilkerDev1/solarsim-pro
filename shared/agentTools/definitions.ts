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
