// F5a: mapa puro «ruta del registro → ancla en la interfaz» (`src/domain/fieldAnchors.ts`). Criterio de aceptación del plan:
// cada ruta del registro con un control en el simulador tiene un ancla (la del control, la de su fila o, si no hay id estable,
// la de su sección o pestaña) o una exención explícita con su motivo. Las anclas apuntan a ids que existen de verdad en el dock
// y los componentes del dock los exponen con `data-dock-anchor`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROJECT_FIELDS, concretePath, findProjectField } from '../domain/projectFields';
import { ANCHOR_EXEMPTIONS, DOCK_SECTION_KEYS, anchorForPath, sectionAnchorId } from '../domain/fieldAnchors';
import { ParamRow, ParamSection, StackedField, ItemCard } from '../components/simulator/params/ui';
import { UnitCostRow } from '../components/simulator/params/sections/pricing/UnitCostRow';
import { DOCK_SECTION_KEYS as DOCK_KEYS_OF_DOCK } from '../components/simulator/params/logic/dockSections';

// ── 1. Cada ruta de control tiene ancla o una exención con motivo ──────────────────────────────────────────────────
const exempt = new Map(ANCHOR_EXEMPTIONS.map((entry) => [entry.path, entry.reason]));
const controls = PROJECT_FIELDS.filter((def) => def.origin === 'control');
assert.ok(controls.length >= 50, 'el recorrido cubre los controles del registro');
const missing = controls.filter((def) => !anchorForPath(concretePath(def.path)) && !exempt.has(def.path)).map((def) => def.path);
assert.deepEqual(missing, [], `rutas de control sin ancla ni exención (añade el ancla o la exención con su motivo):\n${missing.join('\n')}`);
for (const [pattern, reason] of exempt) {
  assert.ok(reason.trim().length > 15, `${pattern}: la exención dice por qué`);
  assert.equal(findProjectField(pattern)?.origin, 'control', `${pattern}: solo se exime una ruta de control`);
  assert.equal(anchorForPath(concretePath(pattern)), undefined, `${pattern}: una ruta con ancla no necesita exención`);
}
for (const def of PROJECT_FIELDS.filter((d) => d.origin === 'derived')) assert.equal(anchorForPath(concretePath(def.path)), undefined, `${def.path}: lo derivado de solo lectura no tiene ancla propia`);
assert.equal(anchorForPath('specs.noExiste'), undefined, 'una ruta que no es del registro no tiene ancla');
assert.equal(anchorForPath('customization.contactName'), undefined, 'el documento no es del simulador');

// ── 2. La precisión de cada ancla ───────────────────────────────────────────────────────────────────────────────────
const at = (p: string) => anchorForPath(p)!;
assert.deepEqual([at('rates.targetCoveragePct').place, at('rates.targetCoveragePct').target, at('rates.targetCoveragePct').precision], [{ surface: 'dock', section: 'rates' }, 'pd-rates-coverage', 'control']);
assert.equal(at('client.name').target, 'pd-cli-name');
assert.equal(at('specs.saleMarginMultiplier').target, 'pd-margin');
assert.deepEqual(at('rates.fixedChargeTierBasis').target, 'pd-rates-fixed-tier', 'el rango del cargo fijo ya tiene ancla (pendiente de F5a)');
assert.equal(at('rates.fixedChargeTierBasis').precision, 'control');
// Costo unitario: el índice del grupo entra en el id.
assert.equal(at('specs.panels[0].unitPriceUSD').target, 'pd-cost-panel-0');
assert.equal(at('specs.inverters[1].unitPriceUSD').target, 'pd-cost-inverter-1');
assert.equal(at('specs.batteries[2].unitPriceUSD').target, 'pd-cost-battery-2');
assert.deepEqual(at('specs.batteries[2].unitPriceUSD').place, { surface: 'dock', section: 'costs' });
// Filas de las listas de equipos: la fila del grupo (no hay id por campo).
assert.deepEqual([at('specs.panels[1].count').target, at('specs.panels[1].count').precision], ['dock-equipment-panel-1', 'row']);
assert.equal(at('specs.inverters[0].powerKW').target, 'dock-equipment-inverter-0');
assert.equal(at('specs.batteries[1].capacityKWh').target, 'dock-equipment-battery-1');
assert.equal(at('specs.panels[3]').target, 'dock-equipment-panel-3', 'un grupo añadido o quitado entero cae en su fila');
// La lista entera (añadir/quitar) y lo que no tiene fila: la sección.
assert.deepEqual([at('specs.panels').target, at('specs.panels').precision, at('specs.panels').place], [undefined, 'section', { surface: 'dock', section: 'equipment' }]);
assert.equal(at('specs.autoCalculatePanels').precision, 'section', 'el interruptor sin id cae en la sección');
// La profundidad y la eficiencia de la batería: el control del grupo principal; otro grupo, su fila.
assert.equal(at('specs.batteries[0].dodPct').target, 'dock-battery-dod');
assert.equal(at('specs.batteries[1].dodPct').target, 'dock-equipment-battery-1');
// Ítems y descuentos: la tarjeta del ítem.
assert.deepEqual([at('financials.customItems[2].unitPriceUSD').target, at('financials.customItems[2].unitPriceUSD').precision], ['dock-financials-item-2', 'row']);
assert.equal(at('financials.customDiscounts[0].value').target, 'dock-financials-discount-0');
assert.deepEqual([at('financials.customItems').target, at('financials.customItems').precision], [undefined, 'section']);
// Consumo mensual: la pestaña Energía, no el dock.
assert.deepEqual(at('monthlyConsumption').place, { surface: 'tab', tab: 'energia' });
assert.deepEqual(at('monthlyConsumption[3]').place, { surface: 'tab', tab: 'energia' });
assert.equal(at('monthlyConsumption[3]').target, undefined);
// Acciones que escriben junto con otro control: el control con el que se escriben.
assert.equal(at('rates.isZeroExport').target, 'pd-rates-connection');
assert.equal(at('specs.daytimeSelfConsumptionRatio').target, 'pd-rates-daytime');
assert.equal(at('rates.energyRateSource').target, 'pd-rates-kwh');
assert.equal(at('client.customMonthlyHSP').target, 'pd-cli-source-label');
assert.equal(at('specs.autoSupplierPricing').precision, 'section');
// Lo que no tiene control (factura, RNC…): la sección, y lo dice.
assert.deepEqual([at('client.rnc').precision, at('client.rnc').place], ['section', { surface: 'dock', section: 'client' }]);
assert.match(at('client.rnc').note ?? '', /sin control/i);
// Una ruta concreta y su patrón dan la misma ancla de sección.
assert.equal(sectionAnchorId('rates'), 'dock-rates');
assert.deepEqual([...DOCK_SECTION_KEYS], [...DOCK_KEYS_OF_DOCK], 'el dominio y el dock comparten las secciones');

// ── 3. Los ids existen de verdad en el dock ─────────────────────────────────────────────────────────────────────────
const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}
const sources = [...walk(path.join(root, 'src/components/simulator/sidebar')), ...walk(path.join(root, 'src/components/simulator/params'))].map((file) => readFileSync(file, 'utf8')).join('\n');
const present = new Set<string>();
for (const match of sources.matchAll(/\b(?:id|htmlFor|labelId)=["']((?:pd|dock)-[a-z0-9-]+)["']/g)) present.add(match[1]);
for (const kind of ['panel', 'inverter', 'battery']) present.add(`pd-cost-${kind}-0`);
const ROW_PREFIXES = ['dock-equipment-panel-', 'dock-equipment-inverter-', 'dock-equipment-battery-', 'dock-financials-item-', 'dock-financials-discount-'];
for (const def of PROJECT_FIELDS) {
  if (def.origin === 'derived') continue;
  const anchor = anchorForPath(concretePath(def.path));
  if (!anchor?.target) continue;
  const target = anchor.target.replace(/-\d+$/, '-0');
  if (anchor.precision === 'row') assert.ok(ROW_PREFIXES.some((prefix) => anchor.target!.startsWith(prefix)), `${def.path}: ${anchor.target} es la fila de una lista`);
  else assert.ok(present.has(target), `${def.path}: ${anchor.target} no existe en el dock`);
}
// Las tarjetas de fila declaran el mismo id que calcula el dominio (la plantilla del dock, con el índice).
assert.ok(sources.includes('anchor={`dock-equipment-${kind}-${index}`}'), 'EquipmentGroupList: la tarjeta de cada grupo lleva su ancla');
assert.ok(sources.includes('anchor={`dock-financials-item-${index}`}'), 'ItemsList: la tarjeta de cada ítem lleva su ancla');
assert.ok(sources.includes('anchor={`dock-financials-discount-${index}`}'), 'DiscountsList: la tarjeta de cada descuento lleva su ancla');
assert.ok(sources.includes('labelId="pd-rates-fixed-tier"'), 'el rango del cargo fijo expone su ancla');

// ── 4. Los componentes del dock exponen el ancla con un atributo de datos estable ─────────────────────────────────
const html = (node: React.ReactElement) => renderToStaticMarkup(node);
assert.match(html(React.createElement(ParamRow, { label: 'Cobertura', htmlFor: 'pd-rates-coverage' })), /data-dock-anchor="pd-rates-coverage"/, 'ParamRow: el id del control');
assert.match(html(React.createElement(ParamRow, { label: 'Modo', labelId: 'dock-equipment-mode' })), /data-dock-anchor="dock-equipment-mode"/, 'ParamRow de grupo de botones: el id de la etiqueta');
assert.doesNotMatch(html(React.createElement(ParamRow, { label: 'Sin id' })), /data-dock-anchor/, 'una fila sin id no inventa ancla');
assert.match(html(React.createElement(StackedField, { label: 'Nombre', htmlFor: 'pd-cli-name' })), /data-dock-anchor="pd-cli-name"/, 'StackedField');
assert.match(html(React.createElement(UnitCostRow, { id: 'pd-cost-panel-0', label: 'Panel', value: 100, onChange: () => undefined })), /data-dock-anchor="pd-cost-panel-0"/, 'UnitCostRow');
assert.match(html(React.createElement(ItemCard, { anchor: 'dock-equipment-panel-1' })), /data-dock-anchor="dock-equipment-panel-1"/, 'ItemCard con ancla de fila');
assert.doesNotMatch(html(React.createElement(ItemCard, {})), /data-dock-anchor/, 'ItemCard sin ancla');
assert.match(html(React.createElement(ParamSection, { id: 'dock-rates', title: 'Tarifas', icon: null, open: false, onToggle: () => undefined })), /<section[^>]*data-dock-anchor="dock-rates"/, 'ParamSection: la sección es su ancla');

console.log('PASS: anclas por ruta: cada control del registro tiene ancla o exención, los ids existen y el dock los expone con data-dock-anchor.');
