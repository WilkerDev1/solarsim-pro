// F7a: el recuento de SOLO LECTURA de las propuestas guardadas que pasarían a «Incompleta» con las reglas de F2b (decisión abierta
// del ADR 0009), `scripts/qa/countIncompleteProposals.ts` y su biblioteca `scripts/qa/incompleteProposalCount.ts`. Sobre fixtures
// SINTÉTICOS (nunca datos del usuario): formatos de entrada, cada motivo y submotivo, lo excluido (papelera, ejemplos antiguos),
// la decisión comercial, el margen guardado y que el script no escribe nada ni usa la red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { proposalCompleteness } from '../domain/proposalCompleteness';
import { editEquipmentGroup } from '../utils/equipmentGroups';
import { migrateLegacySpecs } from '../../shared/equipment';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import {
  MANUAL_PRICE_SOURCE_SINCE, countIncompleteProposals, formatIncompleteCount, parseCountArgs, readExportedProjects,
} from '../../scripts/qa/incompleteProposalCount';
import type { ProjectSimulation } from '../types';

let seq = 0;
const make = (name: string, change: (p: ProjectSimulation) => void = () => {}): ProjectSimulation => {
  const p = structuredClone(BENCHMARK_PROJECT);
  p.id = `fx-${++seq}`;
  p.client = { ...p.client, name: `Nombre Reservado ${seq} (${name})`, projectId: `SP-FX-${seq}` };
  // El caso de referencia, con todo su precio dado por una oferta y una fecha de guardado reciente.
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'panel', { type: 'update', index: 0, patch: { unitPriceUSD: 95, priceSource: 'supplier' } }) };
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, 'inverter', { type: 'update', index: 0, patch: { unitPriceUSD: 1400, priceSource: 'supplier' } }) };
  p.updatedAt = '2026-11-25T10:00:00.000Z';
  change(p);
  return p;
};
const price = (list: 'panel' | 'inverter', patch: Record<string, unknown>) => (p: ProjectSimulation) => {
  p.specs = { ...p.specs, ...editEquipmentGroup(p.specs, list, { type: 'update', index: 0, patch }) };
};

const complete = make('completa');
const zeroInherited = make('cero heredado antiguo', (p) => { price('panel', { unitPriceUSD: 0, priceSource: undefined })(p); p.updatedAt = '2026-10-02T00:00:00.000Z'; });
const zeroInheritedNew = make('cero sin procedencia reciente', (p) => { price('inverter', { unitPriceUSD: 0, priceSource: undefined })(p); });
const zeroManual = make('cero a mano', price('panel', { unitPriceUSD: 0, priceSource: 'manual' }));
const missingPrice = make('sin precio', price('panel', { unitPriceUSD: undefined, priceSource: undefined }));
const bothPrices = make('sin precio y cero', (p) => { price('panel', { unitPriceUSD: undefined, priceSource: undefined })(p); price('inverter', { unitPriceUSD: 0, priceSource: undefined })(p); });
const noConsumption = make('sin consumo', (p) => { p.monthlyConsumption = Array(12).fill(0); });
const noEnergyPrice = make('sin precio de energía', (p) => { p.rates = { ...p.rates, energyCostPerKWh: 0, billingTariff: undefined, energyRateSource: undefined }; });
const inverterZero = make('inversor en cero', price('inverter', { count: 0 }));
const decided = make('aprobada con cero heredado', (p) => { price('panel', { unitPriceUSD: 0, priceSource: undefined })(p); p.commercial = { status: 'approved', note: '' } as ProjectSimulation['commercial']; });
const directWatt = make('precio directo', (p) => { p.specs = { ...p.specs, pricingMode: 'direct_watt' }; price('panel', { unitPriceUSD: 0, priceSource: undefined })(p); });
const trashed = make('en papelera', (p) => { price('panel', { unitPriceUSD: 0, priceSource: undefined })(p); p.isDeleted = true; });
const mock = make('ejemplo antiguo', (p) => { price('panel', { unitPriceUSD: 0, priceSource: undefined })(p); p.id = 'proj-logistics-hub'; });
const all = [complete, zeroInherited, zeroInheritedNew, zeroManual, missingPrice, bothPrices, noConsumption, noEnergyPrice, inverterZero, decided, directWatt, trashed, mock];

// Las fixtures hacen lo que dicen (con la regla del dominio, no con la del script).
const incompleteOf = (p: ProjectSimulation) => proposalCompleteness({ ...p, specs: migrateLegacySpecs(p.specs) });
assert.equal(incompleteOf(complete).incomplete, false, 'la base está completa');
assert.equal(incompleteOf(zeroManual).incomplete, false, 'un 0 a mano es un precio dado');
assert.equal(incompleteOf(directWatt).incomplete, false, 'en precio directo $/W el costo unitario no fija el precio');
for (const p of [zeroInherited, zeroInheritedNew, missingPrice, bothPrices, noConsumption, noEnergyPrice, inverterZero, decided])
  assert.equal(incompleteOf(p).incomplete, true, `${p.client.name}: incompleta`);

// ── Formatos de entrada ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const persisted = (projects: ProjectSimulation[], margin?: number) => ({
  state: { projects, ...(margin === undefined ? {} : { defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: margin } }), activeView: 'dashboard' },
  version: 0,
});
assert.equal(readExportedProjects(persisted([complete], 28)).format, 'persisted_state', 'estado guardado local (clave solarsim-pro-storage)');
assert.equal(readExportedProjects({ app: 'SolarSim Pro', type: 'projects_backup', projects: [complete] }).format, 'projects_backup', 'respaldo de Ajustes → Respaldo & Exportación');
assert.equal(readExportedProjects({ app: 'SolarSim Pro', type: 'single_project', project: complete }).format, 'single_project');
assert.equal(readExportedProjects([complete, zeroManual]).format, 'array');
assert.equal(readExportedProjects(complete).format, 'single_project', 'una propuesta suelta');
assert.equal(readExportedProjects({ projects: [complete], defaultSimulationSettings: { defaultTargetMarginPct: 40 } }).format, 'state');
assert.equal(readExportedProjects({ hola: 1 }).format, 'unknown');
assert.equal(readExportedProjects('texto').projects.length, 0);
assert.equal(readExportedProjects(persisted([complete], 28)).settings?.defaultTargetMarginPct, 28);
assert.equal(readExportedProjects({ type: 'projects_backup', projects: [complete] }).settings, undefined, 'un respaldo de proyectos no lleva los ajustes');
assert.equal(readExportedProjects({ type: 'projects_backup', projects: [complete, null, 7, { client: {} }] }).projects.length, 1, 'lo que no es una propuesta se descarta');

// ── Recuento ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const report = countIncompleteProposals([{ name: 'respaldo.json', json: persisted(all, 28) }]);
assert.equal(report.files, 1);
assert.equal(report.skipped.trashed, 1, 'la papelera no cuenta');
assert.equal(report.skipped.legacyExample, 1, 'los ejemplos antiguos que la hidratación borra no cuentan');
assert.equal(report.evaluated, all.length - 2);
assert.equal(report.complete + report.incomplete, report.evaluated);
assert.equal(report.incomplete, 8, 'cero antiguo, cero reciente, sin precio, sin precio y cero, sin consumo, sin precio de energía, inversor en cero, aprobada con cero');
assert.equal(report.complete, 3, 'completa, cero a mano y precio directo');
assert.equal(report.byReason.missing_equipment_price, 5, 'por precio de equipo: 4 con cero o sin precio + la aprobada');
assert.equal(report.byReason.missing_consumption, 1);
assert.equal(report.byReason.missing_energy_price, 1);
assert.equal(report.byReason.missing_inverter, 1);
assert.equal(report.byReason.missing_panel, 0);
assert.equal(report.priceDetail.zeroWithoutOrigin, 4, 'propuestas con un precio de equipo en 0 sin procedencia (heredado): antiguo, reciente, el de «ambos» y la aprobada');
assert.equal(report.priceDetail.missing, 2, 'propuestas con un equipo sin precio: «sin precio» y «ambos»');
assert.equal(report.priceDetail.zeroSavedBefore, 1, `de los ceros, los guardados antes de ${MANUAL_PRICE_SOURCE_SINCE} (cuando el dock aún no marcaba la procedencia a mano)`);
assert.equal(report.priceDetail.zeroSavedOnOrAfter, 3);
assert.equal(report.priceDetail.zeroNoDate, 0);
assert.equal(report.onlyZeroWithoutOrigin, 3, 'incompletas SOLO por un cero heredado (lo que relajaría la regla): antiguo, reciente y aprobada');
assert.equal(report.inverterCountZero, 1, 'el caso del inversor con cantidad 0 (pendiente del dueño)');
assert.deepEqual(report.byDecision, { pending: 7, approved: 1, rejected: 0 }, 'por decisión comercial: la aprobada sigue contando en los totales, pero no se exporta');

// El margen guardado.
assert.deepEqual(report.margin, { installations: 1, saved28: 1, saved40: 0, other: 0, unknown: 0 });
const margins = countIncompleteProposals([
  { name: 'a.json', json: persisted([complete], 28) }, { name: 'b.json', json: persisted([complete], 40) }, { name: 'c.json', json: persisted([complete], 35) },
  { name: 'd.json', json: { type: 'projects_backup', projects: [complete] } }, { name: 'e.json', json: { type: 'projects_backup', projects: [complete] }, margin: 28 },
]);
assert.deepEqual(margins.margin, { installations: 5, saved28: 2, saved40: 1, other: 1, unknown: 1 }, 'un respaldo sin ajustes es «sin dato» salvo que se pase el margen leído en Ajustes');
assert.equal(margins.files, 5);

// El estado guardado archiva los otros espacios de trabajo (local u organización) en `organizationWorkspaces`: también cuentan, con su margen.
const archived = {
  state: {
    projects: [complete], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: 40 },
    organizationWorkspaces: {
      'https://x.invalid::org-1': { projects: [zeroInherited, zeroInheritedNew, complete], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: 28 } },
      'https://x.invalid::org-2': { projects: [noConsumption] },
    },
  },
  version: 0,
};
const withArchive = countIncompleteProposals([{ name: 'estado.json', json: archived }]);
assert.equal(withArchive.evaluated, 4, 'activo (1) + organización (3 sin repetir la completa que ya estaba) + otro espacio (1) = 1 + 2 + 1');
assert.equal(withArchive.incomplete, 3, 'las incompletas del espacio archivado cuentan');
assert.deepEqual(withArchive.margin, { installations: 3, saved28: 1, saved40: 1, other: 0, unknown: 1 }, 'el margen se mira por espacio de trabajo, no solo en el activo');
assert.equal(readExportedProjects(archived).workspaces.length, 3);
assert.ok(formatIncompleteCount(withArchive).includes('espacios de trabajo'), 'el informe habla de espacios de trabajo');

// La copia archivada del espacio ACTIVO es una foto vieja: no se cuenta como un espacio más.
const staleActive = {
  state: {
    workspaceScope: 'https://x.invalid::org-1', projects: [complete], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: 40 },
    organizationWorkspaces: { 'https://x.invalid::org-1': { projects: [complete, zeroInherited], defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultTargetMarginPct: 28 } } },
  },
  version: 0,
};
const stale = countIncompleteProposals([{ name: 'activo.json', json: staleActive }]);
assert.equal(stale.evaluated, 1, 'solo el espacio activo');
assert.equal(stale.incomplete, 0);
assert.deepEqual(stale.margin, { installations: 1, saved28: 0, saved40: 1, other: 0, unknown: 0 });

// Varias instalaciones suman; un archivo ilegible se cuenta aparte y no tumba el resto.
const many = countIncompleteProposals([{ name: 'a.json', json: persisted([complete, zeroInherited], 28) }, { name: 'b.json', json: persisted([zeroInheritedNew], 40) }, { name: 'rota.json', json: { hola: 1 } }]);
assert.equal(many.evaluated, 3);
assert.equal(many.incomplete, 2);
assert.deepEqual(many.unreadable, ['rota.json']);

// ── Informe ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const text = formatIncompleteCount(report);
for (const needle of ['8 de 11', 'Precio de equipo', 'sin procedencia', 'Decisión comercial', '28 %', 'solo por un cero heredado', 'inversor']) assert.ok(text.includes(needle), `el informe dice «${needle}»:\n${text}`);
assert.ok(!all.some((p) => p.client.name && text.includes(p.client.name)), 'el informe agregado no imprime nombres de clientes');
const detail = formatIncompleteCount(countIncompleteProposals([{ name: 'respaldo.json', json: persisted(all, 28) }], { detail: true }), { detail: true });
assert.ok(detail.includes(zeroInherited.client.projectId) && detail.includes('missing_equipment_price'), 'con --detail, el código de cada propuesta incompleta y su motivo');
assert.ok(!all.some((p) => p.client.name && detail.includes(p.client.name)), 'ni siquiera con --detail se imprimen nombres de clientes (solo el código de la propuesta)');
assert.ok(!new RegExp(`${complete.client.projectId}\\b`).test(detail), 'las completas no se listan');
assert.equal(countIncompleteProposals([{ name: 'vacío.json', json: persisted([]) }]).evaluated, 0);

// ── Argumentos ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
assert.deepEqual(parseCountArgs(['a.json']), { ok: true, files: ['a.json'], detail: false, json: false });
assert.deepEqual(parseCountArgs(['a.json', 'b.json', '--margin', '28', '--detail', '--json']), { ok: true, files: ['a.json', 'b.json'], margin: 28, detail: true, json: true });
for (const bad of [[], ['--margin', '28'], ['a.json', '--margin'], ['a.json', '--margin', 'x'], ['a.json', '--margin', '-3'], ['a.json', '--nope']]) {
  const parsed = parseCountArgs(bad);
  assert.equal(parsed.ok, false, `${bad.join(' ')} se rechaza`);
}

// ── Solo lectura: ni escribe, ni usa la red, ni toca el almacén ─────────────────────────────────────────────────────────────────────
for (const file of ['../../scripts/qa/incompleteProposalCount.ts', '../../scripts/qa/countIncompleteProposals.ts']) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.ok(!/writeFile|appendFile|unlink|rmSync|renameSync|mkdirSync|createWriteStream|copyFile/.test(source), `${file}: no escribe en disco`);
  assert.ok(!/fetch\(|node:http|node:https|XMLHttpRequest|WebSocket/.test(source), `${file}: sin red`);
  assert.ok(!/useSimulationStore|localStorage|solarsim-pro-storage'\)/.test(source.replace(/\/\/.*$/gm, '')), `${file}: no abre el almacén de la app`);
  assert.ok(!/shared\/geminiTransport|electron\/ai|ai-invoice/.test(source), `${file}: no depende de lo que F6 borra`);
}

console.log('PASS: incomplete proposals count (formats, reasons and sub-reasons, exclusions, commercial decision, saved 28 % margin, read-only).');
