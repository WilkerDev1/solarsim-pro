import assert from 'node:assert/strict';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';
import { buildDocumentTextContext } from '../utils/documentTextContext';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { projectSummaryParagraph1Default, projectSummaryParagraph2Default, syncProjectSummaryParagraph1 } from '../../shared/documentTexts/dynamicTexts';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import { ASSISTANT_EDITABLE_FIELDS, validateAssistantEdits } from '../features/assistant/validation';
import { assistantFieldLabel } from '../features/assistant/labels';
import { executeAssistantTool, assistantOwner } from '../features/assistant/tools';
import { useSimulationStore } from '../store/useSimulationStore';
import { ShareProposalService, type SharedProposalRecord } from '../services/shareProposalService';
import { EQUIPMENT_FALLBACK_NAME, LEGACY_MIRROR_FIELDS, migrateLegacySpecs, readEquipment } from '../../shared/equipment';
import type { BatteryItemSpec, InverterItemSpec, PanelItemSpec, ProjectSimulation, SystemSpecs } from '../types';

/*
 * Oleada 3 (ADR 0001): los lectores de textos, IA y asistente leen equipos solo con `shared/equipment`.
 * Cada caso se ejecuta con specs viejas (solo espejo), nuevas (solo grupos) y varios modelos.
 */
const mirrorKeys = (specs: object) => LEGACY_MIRROR_FIELDS.filter((key) => key in specs);
const panel = (id: string, brandModel: string, powerW: number, count: number): PanelItemSpec => ({ id, brandModel, powerW, count, unitPriceUSD: 100 });
const inverter = (id: string, brandModel: string, powerKW: number, count: number): InverterItemSpec => ({ id, brandModel, powerKW, count, unitPriceUSD: 1000 });
const battery = (id: string, brandModel: string, capacityKWh: number, count: number): BatteryItemSpec => ({ id, brandModel, capacityKWh, count, unitPriceUSD: 800 });

const legacyProject = (): ProjectSimulation => {
  const project = structuredClone(BENCHMARK_PROJECT);
  Object.assign(project.specs, {
    panelBrandModel: 'JA Solar JAM72', panelPowerW: 580, panelCount: 20,
    inverterBrandModel: 'Deye SUN', inverterPowerKW: 10, inverterCount: 1,
    batteryBrandModel: 'Pylontech US5000', batteryCapacityKWh: 4.8, batteryCount: 2,
  });
  return project;
};
/** Specs nuevas: solo grupos, sin ningún campo del espejo. */
const groupsProject = (panels: PanelItemSpec[], inverters: InverterItemSpec[], batteries: BatteryItemSpec[], hasBattery = true): ProjectSimulation => {
  const project = legacyProject();
  const specs = migrateLegacySpecs({ ...project.specs, hasBattery });
  const next = { ...specs, panels, inverters, batteries } as SystemSpecs;
  assert.deepEqual(mirrorKeys(next), [], 'la fixture nueva no trae espejo');
  return { ...project, specs: next };
};
const failures: string[] = [];
const section = (name: string, run: () => void) => {
  try { run(); } catch (error) { failures.push(`${name}: ${(error as Error).message.split('\n').slice(0, 4).join(' | ')}`); }
};
const context = (project: ProjectSimulation) => buildDocumentTextContext(project, calculateProjectFinancialSummary(project), { currentDateStr: 'hoy' });

// 1. Contexto de textos, specs viejas (caracterización): mismo resultado visible que antes.
section('1. Contexto de textos, specs viejas (caracterización): mismo resultado visible que antes.', () => {
  const ctx = context(legacyProject());
  assert.equal(ctx.panelCount, 20);
  assert.equal(ctx.panelsSummaryText, '20 JA Solar JAM72 (580W)');
  assert.equal(ctx.panelModelText, 'JA Solar JAM72 (580W)');
  assert.equal(ctx.inverterCount, 1);
  assert.equal(ctx.invertersSummaryText, '1 Deye SUN (10 kW)');
  assert.equal(ctx.batteryCount, 2);
  assert.equal(ctx.batteriesSummaryText, '2 Pylontech US5000 (4.8 kWh)');
  assert.equal(ctx.hasBatteryStorage, true);
  assert.match(projectSummaryParagraph1Default(ctx), /instalación de \*\*20 JA Solar JAM72 \(580W\)\*\*/);
  assert.match(projectSummaryParagraph2Default(ctx, 'con todo.'), /\*\*1 Deye SUN \(10 kW\)\*\* y \*\*2 Pylontech US5000 \(4\.8 kWh\)\*\* con todo\./);
});

// 2. Specs nuevas (solo grupos): mismos nombres, cantidades y potencias.
section('2. Specs nuevas (solo grupos): mismos nombres, cantidades y potencias.', () => {
  const ctx = context(groupsProject([panel('p', 'JA Solar JAM72', 580, 20)], [inverter('i', 'Deye SUN', 10, 1)], [battery('b', 'Pylontech US5000', 4.8, 2)]));
  assert.equal(ctx.panelCount, 20);
  assert.equal(ctx.panelsSummaryText, '20 JA Solar JAM72 (580W)');
  assert.equal(ctx.invertersSummaryText, '1 Deye SUN (10 kW)');
  assert.equal(ctx.batteriesSummaryText, '2 Pylontech US5000 (4.8 kWh)');
  assert.equal(ctx.batteryCapacityKWh, 9.6, 'capacidad nominal total del banco');
  assert.equal(ctx.hasBatteryStorage, true);
});

// 3. Varios modelos: modelo principal + «y N modelo(s) más» en frases; el conteo es el total.
section('3. Varios modelos: modelo principal + «y N modelo(s) más» en frases; el conteo es el total.', () => {
  const two = context(groupsProject([panel('a', 'JA Solar JAM72', 580, 20), panel('b', 'Trina Vertex', 500, 4)], [inverter('i', 'Deye SUN', 10, 1)], [battery('b', 'Pylontech US5000', 4.8, 2)]));
  assert.equal(two.panelCount, 24);
  assert.equal(two.panelsSummaryText, '24 JA Solar JAM72 (580W) y 1 modelo más');
  assert.equal(two.panelModelText, two.panelsSummaryText, 'con varios modelos el texto sincronizable es el resumen completo');
  const three = context(groupsProject([panel('a', 'Trina Vertex', 500, 4), panel('b', 'JA Solar JAM72', 580, 20), panel('c', 'Longi Hi-MO', 550, 2)],
    [inverter('i', 'Deye SUN', 10, 1), inverter('j', 'Growatt MIN', 5, 1)], [battery('b', 'Pylontech US5000', 4.8, 2), battery('c', 'Dyness', 5, 1)]));
  assert.equal(three.panelCount, 26);
  assert.equal(three.panelsSummaryText, '26 JA Solar JAM72 (580W) y 2 modelos más', 'el principal es el de mayor potencia total');
  assert.equal(three.inverterCount, 2);
  assert.equal(three.invertersSummaryText, '2 Deye SUN (10 kW) y 1 modelo más');
  assert.equal(three.batteryCount, 3);
  assert.equal(three.batteriesSummaryText, '3 Pylontech US5000 (4.8 kWh) y 1 modelo más');
  assert.match(projectSummaryParagraph1Default(three), /\*\*26 JA Solar JAM72 \(580W\) y 2 modelos más\*\*/);
  // Dos grupos con el mismo modelo cuentan como uno.
  const same = context(groupsProject([panel('a', 'JA Solar JAM72', 580, 10), panel('b', 'JA Solar JAM72', 580, 10)], [inverter('i', 'Deye SUN', 10, 1)], []));
  assert.equal(same.panelsSummaryText, '20 JA Solar JAM72 (580W)');
  // Un párrafo personalizado se mantiene sincronizado con el resumen de varios modelos.
  const synced = syncProjectSummaryParagraph1('Se propone la instalación de **5 Módulos Viejo (400W)**, alcanzando una potencia DC instalada de **1 kWp**.', three);
  assert.match(synced, /\*\*26 JA Solar JAM72 \(580W\) y 2 modelos más\*\*/);
});

// 4. Nombres de reserva unificados y sin batería.
section('4. Nombres de reserva unificados y sin batería.', () => {
  const ctx = context(groupsProject([panel('a', '', 580, 10)], [inverter('i', '', 10, 1)], [battery('b', '', 4.8, 1)]));
  assert.match(ctx.panelsSummaryText, new RegExp(`^10 ${EQUIPMENT_FALLBACK_NAME.panel} \\(580W\\)$`));
  assert.match(ctx.invertersSummaryText, new RegExp(`^1 ${EQUIPMENT_FALLBACK_NAME.inverter} \\(10 kW\\)$`));
  assert.match(ctx.batteriesSummaryText, new RegExp(`^1 ${EQUIPMENT_FALLBACK_NAME.battery} \\(4.8 kWh\\)$`));
  const none = context(groupsProject([panel('a', 'JA Solar JAM72', 580, 10)], [inverter('i', 'Deye SUN', 10, 1)], [], false));
  assert.equal(none.hasBatteryStorage, false);
  assert.equal(none.batteryCapacityKWh, 0);
});

// 5. Borrador de IA: arma los grupos sin escribir campos heredados a mano.
section('5. Borrador de IA: arma los grupos sin escribir campos heredados a mano.', () => {
  const data = {
    monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
    panels: [{ id: 'p', brandModel: 'P', powerW: 600, count: 10, unitPriceUSD: 100 }], inverters: [{ id: 'i', brandModel: 'I', powerKW: 5, count: 1, unitPriceUSD: 900 }],
    batteries: [{ id: 'b', brandModel: 'B', capacityKWh: 10, count: 1, unitPriceUSD: 1500, dodPct: 80, efficiencyPct: 90 }],
  };
  const base = createAIProposalBase(BENCHMARK_PROJECT, { defaultBatteryDOD: 85 } as never, 'Santiago');
  assert.equal(base.specs.batteries![0].dodPct, 85, 'la base de IA trae grupos');
  assert.equal(readEquipment(base.specs).batteries[0].dodPct, 85, 'el DOD por defecto vive en el grupo');
  const grounded = prepareProposalDraftProject(base, data as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: true });
  assert.equal(grounded.specs.panels![0].count, 10);
  assert.equal(grounded.specs.batteries![0].dodPct, 80);
  // Borrador por selección única (sin grupos de catálogo): también termina en grupos.
  const selected = prepareProposalDraftProject(base, { ...data, panels: undefined, inverters: undefined, batteries: undefined, recommendedPanelCount: 12, selectedPanelWatts: 550,
    selectedPanelModel: 'Longi 550', selectedPanelUnitPriceUSD: 90, selectedInverterModel: 'Growatt 8K', selectedInverterPowerKW: 8, selectedInverterCount: 2, selectedInverterUnitPriceUSD: 1200,
    hasBattery: true, selectedBatteryModel: 'Dyness 10', selectedBatteryCapacityKWh: 10, selectedBatteryCount: 2, selectedBatteryUnitPriceUSD: 1400 } as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: true });
  assert.deepEqual([selected.specs.panels![0].brandModel, selected.specs.panels![0].powerW, selected.specs.panels![0].count, selected.specs.panels![0].unitPriceUSD], ['Longi 550', 550, 12, 90]);
  assert.deepEqual([selected.specs.inverters![0].brandModel, selected.specs.inverters![0].powerKW, selected.specs.inverters![0].count], ['Growatt 8K', 8, 2]);
  assert.deepEqual([selected.specs.batteries![0].brandModel, selected.specs.batteries![0].capacityKWh, selected.specs.batteries![0].count, selected.specs.batteries![0].unitPriceUSD], ['Dyness 10', 10, 2, 1400]);
  // Un proyecto existente solo con grupos conserva su DOD de grupo principal.
  const existing = groupsProject([panel('a', 'JA Solar JAM72', 580, 20)], [inverter('i', 'Deye SUN', 10, 1)], [{ ...battery('b', 'Pylontech', 4.8, 2), dodPct: 70, efficiencyPct: 85 }]);
  const updated = prepareProposalDraftProject(existing, { ...data, panels: undefined, inverters: undefined, batteries: [{ id: 'x', brandModel: 'X', capacityKWh: 5, count: 1 }, { id: 'y', brandModel: 'Y', capacityKWh: 5, count: 1 }] } as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: false });
  assert.equal(updated.specs.batteries![0].dodPct, 70);
  assert.equal(updated.specs.batteries![0].efficiencyPct, 85);
});

// 6. Asistente: validación, etiquetas y guardia de edición escalar con grupos y sin espejo.
section('6. Asistente: validación, etiquetas y guardia de edición escalar con grupos y sin espejo.', () => {
  assert.ok(ASSISTANT_EDITABLE_FIELDS.specs.includes('panels'));
  const edits = validateAssistantEdits([{ section: 'specs', field: 'panels', value: [{ id: 'cat-1', count: 3, unitPriceUSD: 100 }] }], 'project');
  assert.equal(edits[0].field, 'panels');
  for (const field of ['panels', 'inverters', 'batteries']) assert.notEqual(assistantFieldLabel(field), field, `${field} tiene etiqueta`);
  const store = useSimulationStore;
  const single = { ...groupsProject([panel('a', 'JA Solar JAM72', 580, 20)], [inverter('i', 'Deye SUN', 10, 1)], []), id: 'assist-single', syncStatus: 'local_only' as const };
  const multi = { ...groupsProject([panel('a', 'JA Solar JAM72', 580, 20), panel('b', 'Trina Vertex', 500, 4)], [inverter('i', 'Deye SUN', 10, 1)], []), id: 'assist-multi', syncStatus: 'local_only' as const };
  store.setState({ appAssistantEnabled: true, workspaceScope: 'local', projects: [single, multi], activeProjectId: single.id, activeView: 'simulator', deletedEquipmentIds: [], sessionGeneration: 0,
    syncSettings: { ...store.getState().syncSettings, currentUser: null, authToken: null, autoSyncEnabled: false } });
  const propose = (id: string, field: string, value: unknown) => executeAssistantTool({ name: 'propose_project_update', args: { id, title: 't', edits: [{ section: 'specs', field, value }] } }, assistantOwner());
  assert.doesNotThrow(() => propose(single.id, 'batteryLifespanYears', 12), 'un parámetro de sistema nunca se bloquea por tener grupos');
  assert.doesNotThrow(() => propose(single.id, 'panelCount', 30), 'un solo modelo: la edición escalar llega al grupo');
  store.setState({ activeProjectId: multi.id });
  assert.throws(() => propose(multi.id, 'panelCount', 30), /grupos de equipos/, 'varios modelos: la edición escalar se rechaza');
  assert.doesNotThrow(() => propose(multi.id, 'batteryLifespanYears', 12));
  const read = executeAssistantTool({ name: 'get_project', args: { id: multi.id } }, assistantOwner());
  assert.equal((read.data as { equipment: { panels: unknown[] } }).equipment.panels.length, 2, 'el asistente lee los equipos normalizados');
});

// 7. Historial de enlaces: kWp desde los grupos si el registro no lo trae.
section('7. Historial de enlaces: kWp desde los grupos si el registro no lo trae.', () => {
  localStorage.clear();
  const store = useSimulationStore;
  store.setState({ syncSettings: { ...store.getState().syncSettings, serverUrl: 'https://qa.example.invalid', authToken: 'synthetic-share-test',
    currentUser: { id: 'u', email: 'qa@example.invalid', name: 'Synthetic', role: 'ADMIN', organizationId: 'org' } }, sessionGeneration: 0 });
  const record = (projectId: string): SharedProposalRecord => ({ id: `r-${projectId}`, projectId, projectCode: projectId, quoteNumber: 'C-1', clientName: 'Cliente', systemKWp: 0, shareUrl: 'https://x.invalid/p/1',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), validityDays: 7, workerUrl: 'https://x.invalid', serverUrl: 'https://qa.example.invalid', organizationId: 'org' });
  const scoped = (project: ProjectSimulation, id: string) => ({ ...project, id, organizationId: 'org', syncServerUrl: 'https://qa.example.invalid' });
  const newSpecs = scoped(groupsProject([panel('a', 'A', 600, 10), panel('b', 'B', 500, 4)], [inverter('i', 'I', 10, 1)], []), 'new');
  const oldSpecs = scoped(legacyProject(), 'old');
  store.setState({ projects: [newSpecs, oldSpecs] });
  const { updatedRecords } = ShareProposalService.reconcileWithLocalProjects([record('new'), record('old')]);
  assert.equal(updatedRecords.find((r) => r.projectId === 'new')!.systemKWp, 8, 'grupos sin espejo: 10×600 + 4×500 W');
  assert.equal(updatedRecords.find((r) => r.projectId === 'old')!.systemKWp, 11.6, 'espejo antiguo: 20×580 W');
});

assert.deepEqual(failures, [], `Secciones con fallos:\n${failures.join('\n')}`);
console.log('Lectores de textos, IA y asistente: specs viejas, nuevas y varios modelos.');
