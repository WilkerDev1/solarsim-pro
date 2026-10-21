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
];

export function findAgentTool(name: string): AgentToolDefinition | undefined {
  return AGENT_TOOL_DEFINITIONS.find((d) => d.name === name);
}
