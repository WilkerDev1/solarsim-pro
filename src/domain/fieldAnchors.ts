/**
 * Mapa puro «ruta del registro de campos → ancla en la interfaz» (F5a). Dominio: sin React, sin DOM, sin store. Responde a
 * «¿dónde se ve este campo en el simulador?» para resaltar en vivo lo que cambia el asistente (`dockHighlight.ts`) sin
 * navegar ni mover el foco.
 *
 * Precisión, de más fina a más gruesa:
 * - `control`: el control propio (`data-dock-anchor` = su id: `pd-rates-coverage`, `pd-cost-panel-1`…);
 * - `row`: la tarjeta de la fila de una lista (un grupo de equipos, un ítem o un descuento), que no tiene id por campo;
 * - `section`: la sección del dock (`dock-rates`…) o la pestaña (Energía): lo que no tiene control con id, lo que se escribe
 *   junto con otro campo sin control propio y lo que ningún control del simulador edita (RNC, NIC, factura…).
 * Lo que la organización o el modo ocultan (el régimen de medición neta, los cargos que solo existen con la regla nueva) sí
 * tiene ancla de control; si el control no está en pantalla, la vista cae en su sección y lo dice (`dockHighlight.ts`).
 *
 * Las anclas salen del registro (`ProjectFieldDefinition.anchor`) más una tabla corta para lo que el registro no puede decir
 * (acciones que escriben junto con otro control, las listas con fila, el índice del grupo). Una prueba recorre TODAS las rutas
 * de control del registro y falla si alguna queda sin ancla y sin exención con su motivo (`testFieldAnchors`).
 */
import { fieldPattern, findProjectField, type ProjectFieldDefinition } from './projectFields';

/** Secciones del dock, en el orden en que se muestran (el dock las re-exporta). */
export const DOCK_SECTION_KEYS = ['client', 'rates', 'equipment', 'costs', 'financials'] as const;
export type DockSectionKey = (typeof DOCK_SECTION_KEYS)[number];

/** Pestañas del simulador que muestran campos de la propuesta (hoy solo el consumo, en Energía). */
export type SimulatorTabKey = 'energia';

export type AnchorPlace = { surface: 'dock'; section: DockSectionKey } | { surface: 'tab'; tab: SimulatorTabKey };
export type AnchorPrecision = 'control' | 'row' | 'section';

export interface FieldAnchor {
  /** La ruta concreta que se preguntó. */
  path: string;
  /** Sección del dock o pestaña donde se ve. */
  place: AnchorPlace;
  /** Valor de `data-dock-anchor` del control o de la fila; sin él, la ancla es la sección o la pestaña. */
  target?: string;
  precision: AnchorPrecision;
  /** Por qué la ancla es más gruesa que un control. */
  note?: string;
}

/** Id de ancla de una sección del dock: el `id` de su `ParamSection` (`dock-rates`). */
export const sectionAnchorId = (section: DockSectionKey): string => `dock-${section}`;
const SECTION_IDS = new Set<string>(DOCK_SECTION_KEYS.map(sectionAnchorId));

/** Rutas de control que no tienen ancla, con su motivo (ninguna hoy: el recorrido de `testFieldAnchors` las exige explícitas). */
export const ANCHOR_EXEMPTIONS: readonly { path: string; reason: string }[] = [];

const KIND = { panels: 'panel', inverters: 'inverter', batteries: 'battery' } as const;
type EquipmentList = keyof typeof KIND;

/** Ancla de la fila de una lista: el prefijo del `data-dock-anchor` de la tarjeta + el índice. */
export const equipmentRowAnchor = (list: EquipmentList, index: number): string => `dock-equipment-${KIND[list]}-${index}`;
export const itemRowAnchor = (index: number): string => `dock-financials-item-${index}`;
export const discountRowAnchor = (index: number): string => `dock-financials-discount-${index}`;

interface Override {
  /** Control con el que se escribe el campo (el que ve el usuario). */
  target?: string;
  note?: string;
}

/**
 * Lo que el registro no dice en `anchor`: campos que escribe una acción junto con un control, y los que no tienen control.
 * Clave: el patrón del registro.
 */
const OVERRIDES: Readonly<Record<string, Override>> = {
  'client.customMonthlyHSP': { target: 'pd-cli-source-label', note: '«Obtener radiación» escribe la radiación propia junto con el origen solar.' },
  'rates.energyRateSource': { target: 'pd-rates-kwh', note: 'La procedencia del precio se ve junto al precio del kWh.' },
  'rates.billingTariff': { target: 'pd-rates-tariff', note: 'La fila de la tarifa va con la tarifa elegida.' },
  'rates.isZeroExport': { target: 'pd-rates-connection', note: 'La inyección cero se escribe con «Conexión a la red».' },
  'specs.daytimeSelfConsumptionRatio': { target: 'pd-rates-daytime', note: 'Alias del consumo diurno: se escribe con él.' },
  'specs.autoSupplierPricing': { note: 'Botón «Mejor proveedor» del encabezado de costos unitarios (sin id).' },
};

const sectionOf = (def: ProjectFieldDefinition): AnchorPlace | undefined => {
  switch (def.section) {
    case 'energy': return { surface: 'tab', tab: 'energia' };
    case 'document': return undefined;
    default: return { surface: 'dock', section: def.section };
  }
};

/** Ruta → (patrón, índices). `specs.panels[1].count` → `['specs.panels[].count', [1]]`. */
const split = (path: string): [string, number[]] => [fieldPattern(path), [...path.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]))];

function coarse(path: string, place: AnchorPlace, note?: string): FieldAnchor {
  return { path, place, precision: 'section', ...(note ? { note } : {}) };
}

/** La fila de una lista de equipos, de ítems o de descuentos a la que pertenece un patrón (`specs.panels[].count`), si es de una. */
function rowAnchorOf(pattern: string, index: number | undefined): string | undefined {
  if (index === undefined) return undefined;
  const equipment = /^specs\.(panels|inverters|batteries)\[\]/.exec(pattern);
  if (equipment) return equipmentRowAnchor(equipment[1] as EquipmentList, index);
  if (/^financials\.customItems\[\]/.test(pattern)) return itemRowAnchor(index);
  if (/^financials\.customDiscounts\[\]/.test(pattern)) return discountRowAnchor(index);
  return undefined;
}

/**
 * El ancla de una ruta concreta del registro (`specs.panels[1].count`, `monthlyConsumption[3]`) o `undefined` si la ruta no es
 * del registro, es de solo lectura derivada (la escribe otra ruta) o pertenece al documento y no al simulador.
 */
export function anchorForPath(path: string): FieldAnchor | undefined {
  const [pattern, indexes] = split(path);
  const def = findProjectField(path);
  // Un elemento entero de una lista (`specs.panels[3]`, un grupo añadido o quitado): su fila.
  if (!def) {
    const element = /^(.*)\[(\d+)\]$/.exec(path);
    const list = element ? findProjectField(element[1]) : undefined;
    if (!list || list.type !== 'list' || !element) return undefined;
    const place = sectionOf(list);
    const row = rowAnchorOf(`${fieldPattern(element[1])}[]`, Number(element[2]));
    return place && row ? { path, place, target: row, precision: 'row' } : place ? coarse(path, place, list.anchorNote) : undefined;
  }
  if (def.origin === 'derived') return undefined;
  const place = sectionOf(def);
  if (!place) return undefined;
  const override = OVERRIDES[def.path];
  if (override) return override.target ? { path, place, target: override.target, precision: 'control', note: override.note } : coarse(path, place, override.note);

  // La lista entera de ítems o de equipos (añadir, quitar): la sección, no una fila.
  if (def.type === 'list') return coarse(path, place, def.anchorNote);

  const index = indexes[0];
  if (!def.anchor) {
    // Un control del dock sin ancla ni override no se inventa: la prueba lo exige explícito. La tabla de la pestaña Energía no
    // tiene id por mes: la pestaña. Lo que no es un control (hidden/action): la sección.
    if (def.origin === 'control') return place.surface === 'tab' ? coarse(path, place, def.anchorNote) : undefined;
    return coarse(path, place, 'Sin control en el simulador: se edita en otro sitio (asistente, factura o texto del documento).');
  }
  const row = rowAnchorOf(pattern, index);
  if (SECTION_IDS.has(def.anchor)) {
    // Ancla de sección en el registro: si el campo es de una fila, su tarjeta; si no, la sección.
    return row ? { path, place, target: row, precision: 'row', note: def.anchorNote } : coarse(path, place, def.anchorNote);
  }
  // Control con id. Los de un grupo de equipos son del principal: otro grupo cae en su fila.
  if (index !== undefined && index > 0 && /^specs\.batteries\[\]\.(dodPct|efficiencyPct)$/.test(def.path) && row) return { path, place, target: row, precision: 'row', note: def.note };
  return { path, place, target: def.anchor.replace('{i}', String(index ?? 0)), precision: 'control' };
}

/** `true` si el valor es el id de una sección del dock. */
export const isSectionAnchorId = (id: string): boolean => SECTION_IDS.has(id);
