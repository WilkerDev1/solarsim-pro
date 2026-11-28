/**
 * Declaraciones del asistente de la app (F3a). Puro (sin store): lo importan también `toolset.ts` y el script manual
 * `scripts/qa/checkToolDeclarations.ts --toolset app-assistant`.
 *
 * Son del CLIENTE a propósito: `shared/agentTools/definitions.ts` lo comparten el MCP local y el remoto, y sus 12
 * herramientas remotas y AGENT_RULES_ES quedan idénticas byte a byte (copias doradas de F0) para que la 2.11.0 sea solo de
 * cliente. Por eso `create_proposal` y `open_proposal` tienen aquí su propia versión, que sustituye a la compartida SOLO en
 * el conjunto del asistente de la app; la compartida sigue igual para los agentes externos.
 *
 * Kinds: los de siempre (`read`, `draft`, `guarded`); un kind nuevo haría que electron/mcp descartara la lista entera.
 * Esquemas: profundidad acotada (raíz → lista → objeto de una capa) y tamaño limitado; lo vigila `testAssistantToolset`.
 */
import type { AgentToolDefinition, JsonSchema } from '../../../../shared/agentTools/types';
import { findAgentTool } from '../../../../shared/agentTools/definitions';
import { MAX_GRID_USE_CHARGE_DOP_PER_KWH, NET_METERING_REGIMES } from '../../../../shared/netMetering';
import { PROPOSAL_OPERATIONS } from '../../../domain/proposalOperations';
import { editablePathsDigest } from '../../../domain/proposalSnapshot';

const SURFACE = ['app-assistant'] as AgentToolDefinition['surfaces'];
const DISTRIBUTORS = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'];
const id = (description: string): JsonSchema => ({ type: 'string', minLength: 1, maxLength: 128, description });
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const proposalId = id('ID de la propuesta (search_projects). No hace falta que esté abierta.');
const PRICE_RULE = 'Nunca inventes precios: elegir del catálogo toma la oferta de proveedor; sin oferta, el precio genérico, que se avisa como «precio genérico, sin proveedor»; sin ninguno, el equipo queda sin precio y la propuesta incompleta.';
const RESULT_SHAPE = 'Devuelve cambios (ruta, etiqueta, antes, después, derivado), resultados del motor antes y después (o los motivos si está incompleta: nunca cifras), avisos y el resumen actualizado de la propuesta.';

const OPERATION_HELP = [
  'set {path, valueJson}: un campo por ruta (null borra el dato si lo admite)',
  'select_equipment {equipment, catalogItemId, index?, count?}: elige un modelo del catálogo con su precio',
  'add_equipment {equipment, catalogItemId?, count?} y remove_equipment {equipment, index}',
  'set_storage {enabled, catalogItemId?, count?}: «ponle baterías» (incluye, elige del catálogo, dimensiona y resuelve el precio) o quítalas',
  'set_tariff {distributor?, tariffCode?}: trae el precio de referencia y el perfil de carga',
  'set_net_metering {regime?, gridUseChargeDOPPerKWh?}',
  'set_radiation {province?, coordinates?, solarSourceMode?, valueJson? con doce HSP}',
  'set_consumption {averageMonthlyKWh | valueJson con doce consumos}',
  'set_margin_pct {pct}; apply_official_tariff; best_supplier',
  'upsert_item {id?, description, quantity, unitPriceUSD, unit?, exonerateITBIS?, applyMargin?, hideInQuotation?} y remove_item {id}',
  'upsert_discount {id?, description, discountType, value, target?} y remove_discount {id}',
].join('; ');

export const APP_ASSISTANT_OWN_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'get_proposal_state', title: 'Estado de la propuesta', kind: 'read', category: 'proposals', card: 'proposal', surfaces: SURFACE,
    description: `Resumen compacto de una propuesta (cliente, tarifa, consumo, equipos con precio y procedencia, margen, extras y descuentos), sus avisos y si está completa. Con includeEditablePaths, también las rutas editables con su tipo y rango (para edit_proposal; filtra con section). ${RESULT_SHAPE}`,
    inputSchema: object({
      proposalId,
      includeEditablePaths: { type: 'boolean', description: 'Añadir las rutas editables con tipo y rango (solo si las necesitas: ya van resumidas en edit_proposal).' },
      section: { type: 'string', enum: ['client', 'rates', 'specs', 'financials', 'monthlyConsumption'], description: 'Solo las rutas de esta sección.' },
    }, ['proposalId']),
  },
  {
    name: 'create_proposal', title: 'Crear propuesta', kind: 'draft', category: 'proposals', card: 'proposal', surfaces: SURFACE,
    description: `Crea una propuesta nueva. Todo es opcional: sin datos nace con los valores de fábrica (consumo estimado de 1.000 kWh/mes, avisado; tarifa de referencia; margen objetivo de Ajustes) y el sistema dimensionado con equipos del catálogo. Acepta extractionId de extract_invoice en lugar de transcribir la factura. ${PRICE_RULE} No abre la propuesta: el resultado indica openSimulator; ábrela con open_proposal si el usuario quiere verla.`,
    inputSchema: object({
      clientName: { type: 'string', maxLength: 200 },
      company: { type: 'string', maxLength: 200 },
      province: { type: 'string', maxLength: 100, description: 'Provincia de República Dominicana.' },
      address: { type: 'string', maxLength: 300 },
      distributor: { type: 'string', enum: DISTRIBUTORS },
      tariffCode: { type: 'string', maxLength: 16, description: 'Código tarifario, p. ej. BTS1, BTS2, MTD.' },
      monthlyConsumptionKWh: { type: 'array', maxItems: 12, items: { type: 'number', minimum: 0, maximum: 10000000 }, description: 'Doce consumos de enero a diciembre.' },
      averageMonthlyKWh: { type: 'number', minimum: 1, maximum: 10000000 },
      extractionId: { type: 'string', maxLength: 128, description: 'Referencia devuelta por extract_invoice; los campos sueltos indicados mandan sobre ella.' },
    }),
  },
  {
    name: 'extract_invoice', title: 'Leer factura', kind: 'read', category: 'proposals', surfaces: SURFACE,
    description: 'Lee una factura eléctrica adjunta en el chat con un esquema fijo y devuelve una referencia (extractionId) a los datos normalizados, con un resumen y lo que no pudo confirmar. Pasa la referencia a create_proposal; no transcribas los consumos.',
    inputSchema: object({ fileId: id('ID del archivo adjunto en el chat.') }, ['fileId']),
  },
  {
    name: 'size_system', title: 'Dimensionar sistema', kind: 'read', category: 'proposals', card: 'proposal', surfaces: SURFACE,
    description: `Calcula paneles, inversor y, si se piden o la propuesta ya las incluye, baterías, con los supuestos declarados (base de dimensionado, relación DC/AC, regla del banco). NO escribe: devuelve ops listas para edit_proposal y la vista previa del cambio. ${RESULT_SHAPE}`,
    inputSchema: object({
      proposalId,
      coveragePct: { type: 'number', minimum: 1, maximum: 300, description: 'Cobertura objetivo; sin ella, la de la propuesta.' },
      includeBatteries: { type: 'boolean', description: 'Dimensionar también el banco de baterías.' },
      batteryCatalogItemId: id('Batería del catálogo con que dimensionar (opcional).'),
    }, ['proposalId']),
  },
  {
    name: 'edit_proposal', title: 'Editar propuesta', kind: 'draft', category: 'proposals', card: 'proposal', surfaces: SURFACE,
    description: `Aplica una lista de operaciones a una propuesta como UN solo cambio con un deshacer: todo o nada, con validación estricta; un error dice la ruta y cómo corregirlo. Operaciones: ${OPERATION_HELP}. ${PRICE_RULE} Cotiza siempre en modo Simple con matriz de costos: un lote que toca precios la deja así y el precio directo $/W no se cambia desde aquí (es del dock). Un lote con operaciones contradictorias se rechaza. Lo que la organización oculta (p. ej. el régimen de medición neta) se rechaza. ${RESULT_SHAPE}`,
    inputSchema: object({
      proposalId,
      title: { type: 'string', maxLength: 150, description: 'Resumen breve del cambio.' },
      ops: {
        type: 'array', maxItems: 40, description: 'Operaciones, en una sola capa: op y sus argumentos.',
        items: object({
          op: { type: 'string', enum: [...PROPOSAL_OPERATIONS] },
          path: { type: 'string', maxLength: 80, description: `Ruta para set; [n] es el número de fila desde 0. Rutas: ${editablePathsDigest()}.` },
          valueJson: { type: 'string', maxLength: 20000, description: 'Valor en JSON, p. ej. 95, true, "Santiago" o doce números.' },
          equipment: { type: 'string', enum: ['panel', 'inverter', 'battery'] },
          index: { type: 'integer', minimum: 0, maximum: 11, description: 'Fila del grupo de equipos (0 = principal).' },
          catalogItemId: id('ID del equipo en el catálogo (search_equipment).'),
          count: { type: 'integer', minimum: 1, maximum: 10000 },
          enabled: { type: 'boolean' },
          distributor: { type: 'string', enum: DISTRIBUTORS },
          tariffCode: { type: 'string', maxLength: 16 },
          regime: { type: 'string', enum: [...NET_METERING_REGIMES] },
          gridUseChargeDOPPerKWh: { type: 'number', minimum: 0, maximum: MAX_GRID_USE_CHARGE_DOP_PER_KWH },
          solarSourceMode: { type: 'string', enum: ['province', 'gps'] },
          province: { type: 'string', maxLength: 100 },
          coordinates: { type: 'string', maxLength: 60, description: 'Latitud, longitud.' },
          averageMonthlyKWh: { type: 'number', minimum: 0, maximum: 10000000 },
          pct: { type: 'number', minimum: 0, maximum: 1000, description: 'Margen en %, p. ej. 35.' },
          id: { type: 'string', maxLength: 128, description: 'ID del ítem o descuento (get_proposal_state); omítelo para uno nuevo.' },
          description: { type: 'string', maxLength: 200 },
          quantity: { type: 'number', minimum: 0, maximum: 1000000 },
          unit: { type: 'string', maxLength: 10 },
          unitPriceUSD: { type: 'number', minimum: 0, maximum: 10000000 },
          exonerateITBIS: { type: 'boolean' },
          applyMargin: { type: 'boolean' },
          hideInQuotation: { type: 'boolean' },
          discountType: { type: 'string', enum: ['fixed', 'percentage'] },
          value: { type: 'number', minimum: 0, maximum: 10000000 },
          target: { type: 'string', enum: ['general', 'equipment'] },
        }, ['op']),
      },
    }, ['proposalId', 'ops']),
  },
  {
    name: 'undo_change', title: 'Deshacer cambio', kind: 'draft', category: 'proposals', card: 'proposal', surfaces: SURFACE,
    description: `Deshace un cambio del asistente (activityId) o un turno entero (turnId) en una propuesta; sin ninguno, el último cambio del asistente en ella. Revierte del más reciente al más antiguo y se detiene si la propuesta cambió después del cambio del asistente (cualquier cambio, no solo el mismo campo): entonces hay que usar el historial de versiones. Deshacer un cambio de precios o la creación de una propuesta pide la misma confirmación que el cambio original. ${RESULT_SHAPE}`,
    inputSchema: object({
      proposalId,
      activityId: id('ID del cambio (activityId de un resultado).'),
      turnId: { type: 'string', maxLength: 128, description: 'ID del turno cuyos cambios se deshacen.' },
    }, ['proposalId']),
  },
  {
    name: 'open_proposal', title: 'Abrir propuesta', kind: 'read', category: 'navigation', card: 'proposal', surfaces: SURFACE,
    description: 'Abre una propuesta en la aplicación (simulador, resumen o documento). Solo cuando el usuario lo pide o tras crearla.',
    inputSchema: object({ proposalId, view: { type: 'string', enum: ['simulator', 'project-hub', 'pdf-preview'] } }, ['proposalId']),
  },
];

/**
 * El conjunto ÚNICO que verá el asistente de la app (F4 lo declarará entero al empezar cada turno, sin cambiarlo a mitad).
 * Las siete propias más las compartidas que siguen siendo útiles (textos y diseño del documento, anexos, clientes, catálogo,
 * ofertas, estado y decisión comercial). Entre 10 y 20 activas, como recomienda Google.
 */
export const APP_ASSISTANT_TOOLSET = [
  'get_proposal_state', 'create_proposal', 'extract_invoice', 'size_system', 'edit_proposal', 'undo_change', 'open_proposal',
  'search_projects', 'search_equipment', 'get_tariffs', 'list_supplier_offers',
  'list_document_texts', 'set_document_texts', 'set_document_layout', 'list_proposal_attachments',
  'search_clients', 'link_proposal_to_client', 'set_proposal_status', 'set_commercial_status',
] as const;
export type AppAssistantToolName = (typeof APP_ASSISTANT_TOOLSET)[number];

/** Las declaraciones del conjunto, en su orden: la propia del cliente si existe, si no la compartida (sin copiarla ni cambiarla). */
export function appAssistantToolDefinitions(): AgentToolDefinition[] {
  return APP_ASSISTANT_TOOLSET.map((name) => {
    const definition = APP_ASSISTANT_OWN_TOOLS.find((d) => d.name === name) ?? findAgentTool(name);
    if (!definition) throw new Error(`Herramienta del asistente sin declarar: ${name}`);
    return definition;
  });
}
