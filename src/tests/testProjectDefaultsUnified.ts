/**
 * Defaults de proyecto con una sola fuente (`shared/projectDefaults.ts`): precio directo por Wp, capacidad y DOD de batería
 * y pérdidas del sistema coinciden en tienda, importación, borrador de IA, motor y dock.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import * as shared from '../../shared/projectDefaults';
import { EquipmentParamsSection } from '../components/simulator/sidebar/EquipmentParamsSection';
import type { SystemSpecs } from '../types';

const store = () => useSimulationStore.getState();

// ── Precio directo por Wp: 1.13 en proyecto nuevo, importación y ajustes por defecto ──────
assert.equal(DEFAULT_SIMULATION_SETTINGS.defaultDirectPriceUSDPerWp, shared.DEFAULT_PRICE_PER_WATT_USD);
assert.equal(shared.DEFAULT_PRICE_PER_WATT_USD, 1.13);
store().createNewProject({ name: 'Nuevo', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
const fresh = store().getActiveProject();
assert.equal(fresh.financials.pricePerWattUSD, 1.13, 'proyecto nuevo: 1.13 (antes 1.05)');
assert.equal(fresh.specs.pricePerWattUSD, 1.13, 'proyecto nuevo en modo matriz: tampoco hereda el 1.134971 del caso de referencia');
const withoutPrice = { ...fresh, id: '', client: { ...fresh.client, name: 'Importado', projectId: 'IMP-1', quoteNumber: 'IMP-1' }, financials: { ...fresh.financials, pricePerWattUSD: undefined } };
const importResult = store().importProjectsFromJSON([withoutPrice as never]);
assert.ok(importResult.success);
const imported = store().projects.find((p) => p.client.name === 'Importado')!;
assert.equal(imported.financials.pricePerWattUSD, 1.13, 'proyecto importado sin $/W: 1.13 (antes 1.05)');
assert.equal(fresh.specs.batteryCapacityKWh, shared.DEFAULT_BATTERY_CAPACITY_KWH);
assert.equal(fresh.specs.batteryDOD, shared.DEFAULT_BATTERY_DOD_PCT);

// Modo directo por defecto: el $/W del proyecto sale del ajuste, no del caso de referencia (1.134971).
store().updateDefaultSimulationSettings({ defaultPricingMode: 'direct' } as never);
store().createNewProject({ name: 'Directo', province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS2' });
{
  const direct = store().getActiveProject();
  assert.equal(direct.specs.pricingMode, 'direct_watt');
  assert.equal(direct.specs.pricePerWattUSD, 1.13, 'proyecto nuevo en modo directo: $/W del ajuste');
  assert.equal(direct.specs.pricePerKWpUSD, 1130);
}
assert(!readFileSync('src/components/settings/sections/SimulationPreferencesSection.tsx', 'utf8').includes('|| 1.05'), 'el editor de ajustes no repite 1.05');

// ── Batería: el 80 % del caso de referencia no se filtra a importaciones ni a proyectos nuevos ──
{
  const bankGroups = [
    { id: 'g1', brandModel: 'G1', capacityKWh: 10, count: 1 },
    { id: 'g2', brandModel: 'G2', capacityKWh: 10, count: 1 },
  ];
  const { batteryDOD: _omit, ...specsNoDod } = fresh.specs as unknown as Record<string, unknown>;
  void _omit;
  const importable = { ...fresh, id: '', client: { ...fresh.client, name: 'Importado banco', projectId: 'IMP-2', quoteNumber: 'IMP-2' }, specs: { ...specsNoDod, hasBattery: true, batteries: bankGroups } };
  assert.ok(store().importProjectsFromJSON([importable as never]).success);
  const bank = store().projects.find((p) => p.client.name === 'Importado banco')!;
  assert.equal(bank.specs.batteryDOD, 90, 'espejo importado sin DOD: 90, no 80');
  assert.equal(shared.resolveBatteryBankDodPct(bank.specs), 90, 'grupos importados sin DOD: 90');
  assert.equal(shared.resolveBatteryBankEfficiencyPct(bank.specs), 90);
  const { createAIProposalBase } = await import('../utils/proposalDraftProject');
  const aiBase = createAIProposalBase(BENCHMARK_PROJECT, DEFAULT_SIMULATION_SETTINGS, 'Santiago');
  assert.equal(aiBase.specs.batteries![0].dodPct, 90, 'base de propuesta IA: 90, no 80');
  assert.equal(fresh.specs.batteryDOD, 90, 'proyecto nuevo: 90');
  const withGroupValues = { ...importable, client: { ...importable.client, name: 'Importado espejo', projectId: 'IMP-3', quoteNumber: 'IMP-3' }, specs: { ...importable.specs, batteries: [{ ...bankGroups[0], dodPct: 70, efficiencyPct: 85 }, bankGroups[1]] } };
  assert.ok(store().importProjectsFromJSON([withGroupValues as never]).success);
  const mirrored = store().projects.find((p) => p.client.name === 'Importado espejo')!;
  assert.equal(mirrored.specs.batteryDOD, 70, 'el espejo importado sale del grupo principal');
  assert.equal(mirrored.specs.batteryEfficiencyPct, 85);
  // Con grupos, un escalar obsoleto no se conserva si el grupo principal no tiene dato.
  const stale = { ...importable, client: { ...importable.client, name: 'Importado obsoleto', projectId: 'IMP-4', quoteNumber: 'IMP-4' }, specs: { ...importable.specs, batteryDOD: 80, batteryEfficiencyPct: 80 } };
  assert.ok(store().importProjectsFromJSON([stale as never]).success);
  const staleImported = store().projects.find((p) => p.client.name === 'Importado obsoleto')!;
  assert.equal(staleImported.specs.batteryDOD, 90, 'espejo con grupo sin dato: 90, no el escalar obsoleto');
  assert.equal(staleImported.specs.batteryEfficiencyPct, undefined);
  assert.equal(shared.resolveBatteryBankDodPct(staleImported.specs), 90);
  // Importado en modo directo sin $/W: ni el 1.134971 del caso de referencia ni su $/kWp.
  const { pricePerWattUSD: _w, pricePerKWpUSD: _k, ...noPrice } = importable.specs as Record<string, unknown>;
  void _w; void _k;
  const directImport = { ...importable, client: { ...importable.client, name: 'Importado directo', projectId: 'IMP-5', quoteNumber: 'IMP-5' }, specs: { ...noPrice, pricingMode: 'direct_watt' } };
  assert.ok(store().importProjectsFromJSON([directImport as never]).success);
  const directImported = store().projects.find((p) => p.client.name === 'Importado directo')!;
  assert.equal(directImported.specs.pricePerWattUSD, directImported.financials.pricePerWattUSD, '$/W del importado: el de financials, no el del caso de referencia');
  assert.equal(directImported.specs.pricePerKWpUSD, undefined);
  assert.equal(BENCHMARK_PROJECT.specs.batteryDOD, 80, 'el caso de referencia conserva su 80');
}

// ── Pérdidas del sistema: un solo concepto (25 %), y 14 % solo en modo detallado sin dato ──
assert.equal(shared.DEFAULT_SYSTEM_LOSSES_PCT, 25);
assert.equal(shared.DEFAULT_DETAILED_SYSTEM_LOSSES_PCT, 14);
assert.equal(shared.resolveSystemLossesPct({}), 25);
assert.equal(shared.resolveSystemLossesPct({ isDetailed: true }), 14);
assert.equal(shared.resolveSystemLossesPct({ isDetailed: true, systemLosses: 0 }), 0, 'un 0 explícito se conserva');
assert.equal(shared.resolveSystemLossesPct({ isDetailed: false, systemLosses: 18 }), 18);
{
  const html = (specs: object) => renderToStaticMarkup(React.createElement(EquipmentParamsSection, {
    project: { specs: { panelCount: 10, panelPowerW: 500, autoCalculatePanels: true, ...specs }, rates: {} } as never,
    summary: { batteryUsableKWh: 0, batteryBackupAutonomyHours: 0, systemCapacityKWp: 0 } as never, updateSpecs: () => {},
  }));
  assert.match(html({ isDetailed: true }), /con 14% de pérdidas/, 'el dock muestra las pérdidas que usa el motor en modo detallado');
  assert.match(html({ isDetailed: false }), /con 25% de pérdidas/);
}

// ── Sin literales repetidos ────────────────────────────────────────────────────────────────
const source = (file: string) => readFileSync(file, 'utf8');
for (const literal of ['1.05', '|| 90', '16.08', '25.0']) assert(!source('src/store/slices/projectSlice.ts').includes(literal), `projectSlice repite «${literal}»`);
assert(!source('src/store/slices/importExportSlice.ts').includes('1.05'), 'importExportSlice repite 1.05');
assert(!source('src/utils/proposalDraftProject.ts').includes('?? 25'), 'proposalDraftProject repite 25');
for (const literal of ['14.0', '25.0']) assert(!source('src/engine/solarEngine.ts').includes(literal), `solarEngine repite «${literal}»`);
void BENCHMARK_PROJECT;
void ({} as SystemSpecs);

console.log('testProjectDefaultsUnified: ok');
