import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProjectSimulation } from '../types';
import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import { getRecommendedLoadProfile } from '../engine/solarEngine';
import { mapTariffCodeOnDistributorChange } from '../types/tariffs';
import { ClientParamsSection } from '../components/simulator/sidebar/ClientParamsSection';
import { RatesFields } from '../components/simulator/params/sections/rates/RatesFields';
import {
  displayPhone, displayQuoteNumber, duplicateMessage,
} from '../components/simulator/params/sections/client/clientLogic';
import {
  activeLoadPreset, daytimeSliderChange, exportFeeValue, isMatchingReference, loadProfileChange,
  planDistributorChange, planTariffChange, referenceRate,
} from '../components/simulator/params/sections/rates/ratesLogic';

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

const makeProject = (over: { client?: object; rates?: object; specs?: object; id?: string } = {}) => ({
  id: over.id ?? 'p1',
  monthlyConsumption: [900, 900, 900],
  client: { name: 'Cliente', location: 'SD', province: 'Santo Domingo / Distrito Nacional', projectId: 'SP-1', quoteNumber: 'C-1', ...over.client },
  rates: { energyCostPerKWh: 0.22, distributor: 'EDESUR', tariffCode: 'BTS2', ...over.rates },
  specs: { panelCount: 10, panelPowerW: 500, systemLosses: 20, hasBattery: false, dopExchangeRate: 60, ...over.specs },
}) as unknown as ProjectSimulation;

const clientProps = (project: ProjectSimulation, extra: Record<string, unknown> = {}) => ({
  project, projects: [project], isIdUnlocked: false, setIsIdUnlocked: noop, isFetchingSolar: false,
  solarApiStatus: null, onFetchSolarApi: noop, updateClient: noop, ...extra,
});
const renderClient = (project: ProjectSimulation, extra: Record<string, unknown> = {}) =>
  render(h(ClientParamsSection, clientProps(project, extra) as never));

// --- Cliente: lógica de presentación ---
assert.equal(displayPhone({ contactPhone: '809-555-0199' }), '', 'el teléfono de muestra se oculta');
assert.equal(displayPhone({ contactPhone: '809-111-2222' }), '809-111-2222');
assert.equal(displayPhone({}), '');
assert.equal(displayQuoteNumber({ quoteNumber: '' }), 'C-0030', 'cotización por defecto');
assert.equal(displayQuoteNumber({ quoteNumber: 'C-0143' }), 'C-0143');
assert.equal(duplicateMessage({ isProjectIdDuplicate: false, isQuoteDuplicate: false }, { projectId: 'a' }), null);
assert.match(duplicateMessage({ isProjectIdDuplicate: true, isQuoteDuplicate: false, duplicateProjectName: 'Otro' }, { projectId: 'SP-9' })!, /SP-9.*Otro/);
assert.match(duplicateMessage({ isProjectIdDuplicate: false, isQuoteDuplicate: true, duplicateProjectName: 'Otro' }, { projectId: 'a', quoteNumber: 'C-9' })!, /C-9.*Otro/);
assert.match(duplicateMessage({ isProjectIdDuplicate: true, isQuoteDuplicate: true, duplicateProjectName: 'Otro' }, { projectId: 'a' })!, /ID y cotización.*Otro/);

// --- Cliente: modo Provincia ---
{
  const html = renderClient(makeProject());
  assert.match(html, /role="radiogroup"[^>]*aria-label="Radiación solar"/);
  assert.match(html, /aria-checked="true"[^>]*>Provincia</, 'Provincia activa');
  assert.match(html, /id="pd-cli-province"/);
  assert.match(html, /<button[^>]*id="pd-cli-province"[^>]*role="combobox"|<button[^>]*role="combobox"[^>]*id="pd-cli-province"/, 'provincia: disparador del listbox');
  assert.match(html, /role="combobox"[\s\S]*Santo Domingo \/ Distrito Nacional/, 'provincia seleccionada visible en el disparador');
  assert.match(html, /\d+(\.\d+)? HSP/, 'distintivo de HSP de la provincia');
  assert.doesNotMatch(html, /pd-cli-coords/, 'sin coordenadas en modo Provincia');
  assert.match(html, /Bloqueado/);
  assert.match(html, /id="pd-cli-id"[^>]*disabled=""/, 'ID bloqueado');
  assert.match(html, /id="pd-cli-quote"[^>]*value="C-1"/);
  assert.doesNotMatch(html, /role="alert"/, 'sin aviso de duplicado');
  assert.doesNotMatch(html, /Hoy/, 'sin fecha personalizada no hay atajo «Hoy»');
  assert.doesNotMatch(html, /isDark|emerald|amber|blue-/, 'solo tokens pd-*');
}

// --- Cliente: campos de texto, teléfono oculto y cotización por defecto ---
{
  const html = renderClient(makeProject({ client: { contactPhone: '809-555-0199', quoteNumber: '', quoteDate: '2026-10-02' } }));
  assert.match(html, /id="pd-cli-phone"[^>]*value=""/);
  assert.match(html, /id="pd-cli-quote"[^>]*value="C-0030"/);
  assert.match(html, /aria-label="Restablecer a Hoy"/, 'con fecha propia aparece «Restablecer a Hoy»');
  assert.match(html, /id="pd-cli-date"[^>]*value="2026-10-02"/);
  const unlocked = renderClient(makeProject(), { isIdUnlocked: true });
  assert.match(unlocked, /Editable/);
  assert.doesNotMatch(unlocked, /id="pd-cli-id"[^>]*disabled=""/);
}

// --- Cliente: modo GPS ---
{
  const gps = makeProject({ client: { solarSourceMode: 'gps' } });
  const html = renderClient(gps);
  assert.match(html, /id="pd-cli-coords"[^>]*value="18.4861, -69.9312"/, 'coordenadas por defecto');
  assert.match(html, />Obtener radiación</);
  assert.doesNotMatch(html, /pd-cli-province/, 'sin provincia en modo GPS');
  assert.match(html, /aria-checked="true"[^>]*>GPS</);
  const loading = renderClient(gps, { isFetchingSolar: true, solarApiStatus: null });
  assert.match(loading, /aria-busy="true"[^>]*disabled=""|disabled=""[^>]*aria-busy="true"/, 'botón deshabilitado cargando');
  assert.match(loading, /Obteniendo de NASA/);
  const done = renderClient(makeProject({ client: { solarSourceMode: 'gps', coordinates: '19.0, -70.0' } }), { solarApiStatus: 'Radiación obtenida' });
  assert.match(done, /value="19.0, -70.0"/);
  assert.match(done, /role="status"[^>]*>Radiación obtenida</);
}

// --- Cliente: aviso de duplicado ---
{
  const mine = makeProject({ id: 'a', client: { projectId: 'SP-7', quoteNumber: 'C-7' } });
  const other = makeProject({ id: 'b', client: { name: 'Otro cliente', projectId: 'sp-7', quoteNumber: 'C-99' } });
  const html = renderClient(mine, { projects: [mine, other], isIdUnlocked: true });
  assert.match(html, /role="alert"/);
  assert.match(html, /Otro cliente/);
  assert.match(html, /Asignar siguiente código/);
  assert.match(html, /text-pd-negative/);
  assert.match(html, /id="pd-cli-id"[^>]*aria-invalid="true"/);
  assert.doesNotMatch(html, /id="pd-cli-quote"[^>]*aria-invalid/);
  const quoteDup = makeProject({ id: 'c', client: { name: 'Tercero', projectId: 'SP-8', quoteNumber: 'c-7' } });
  assert.match(renderClient(mine, { projects: [mine, quoteDup] }), /La cotización «C-7» ya está en «Tercero»/);
}

// --- Tarifas: markup ---
const ratesProps = (project: ProjectSimulation, extra: Record<string, unknown> = {}) => ({
  project, projectionEnabled: false, updateRates: noop, updateSpecs: noop, ...extra,
});
const renderRates = (project: ProjectSimulation, extra: Record<string, unknown> = {}) =>
  render(h(RatesFields, ratesProps(project, extra) as never));

{
  const html = renderRates(makeProject());
  assert.match(html, /id="pd-rates-distributor"/);
  assert.match(html, /<button[^>]*id="pd-rates-distributor"[^>]*>[\s\S]*?EDESUR[\s\S]*?<\/button>/, 'distribuidora seleccionada en el disparador');
  assert.doesNotMatch(html, /<option/, 'sin opciones nativas');
  assert.match(html, /id="pd-rates-tariff"/);
  assert.match(html, /title="Aplicar la tarifa oficial de referencia \(\$0\.\d{3}\/kWh\)[^"]*"[^>]*>0\.\d{3}</, 'chip con la tarifa oficial cuando el precio difiere');
  assert.match(html, /id="pd-rates-coverage"[^>]*value="95"/, 'cobertura por defecto 95');
  assert.doesNotMatch(html, /pd-rates-daytime/, 'sin proyección no hay perfil de carga');
}

// --- Tarifas: Inyección cero Sí/No ---
{
  const off = renderRates(makeProject({ rates: { isZeroExport: false, gridExportFeePct: 18 } }));
  assert.match(off, /aria-label="Inyección cero"/);
  assert.match(off, /aria-checked="false"[^>]*>Sí</);
  assert.match(off, /aria-checked="true"[^>]*>No</);
  assert.match(off, /id="pd-rates-export"[^>]*value="18"/);
  assert.doesNotMatch(off, /id="pd-rates-export"[^>]*disabled=""/);
  assert.match(off, /retención del 18%/, 'la nota de medición neta va en el InfoTip');

  const on = renderRates(makeProject({ rates: { isZeroExport: true, gridExportFeePct: 18 } }));
  assert.match(on, /aria-checked="true"[^>]*>Sí</);
  assert.match(on, /id="pd-rates-export"[^>]*value="0"/, 'cargo en 0 con inyección cero');
  assert.match(on, /id="pd-rates-export"[^>]*disabled=""/, 'cargo deshabilitado con inyección cero');
  assert.match(on, /Inyección cero activa/);
  assert.equal(exportFeeValue({ isZeroExport: true, gridExportFeePct: 18 }), 0);
  assert.equal(exportFeeValue({ gridExportFeePct: undefined }), 25);
}

// --- Tarifas: precio oficial ---
{
  const ctx = { matrix: undefined, avgMonthlyConsumption: 900, dopExchangeRate: 60 };
  const ref = referenceRate(ctx, 'EDESUR', 'BTS2');
  assert.equal(ref, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTS2', 900, 60));
  assert.ok(isMatchingReference(ref + 0.0004, ref));
  assert.ok(!isMatchingReference(ref + 0.01, ref));
  const matching = renderRates(makeProject({ rates: { energyCostPerKWh: ref } }));
  assert.doesNotMatch(matching, /Aplicar la tarifa oficial de referencia/, 'sin chip de advertencia cuando coincide');
  assert.match(matching, />Oficial</);
}

// --- Tarifas: recálculo al cambiar distribuidora o tarifa ---
{
  const project = makeProject({ rates: { distributor: 'EDESUR', tariffCode: 'BTS2' } });
  const ctx = {
    matrix: undefined, avgMonthlyConsumption: 900, dopExchangeRate: 60,
    rates: project.rates, loadProfilePreset: undefined, canWriteSpecs: true,
  };
  const plan = planDistributorChange(ctx, 'CEPM');
  const mapped = mapTariffCodeOnDistributorChange('EDESUR', 'CEPM', 'BTS2');
  assert.equal(plan.rates.distributor, 'CEPM');
  assert.equal(plan.rates.tariffCode, mapped, 'el código se mapea a la nueva distribuidora');
  assert.equal(plan.rates.energyCostPerKWh, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', mapped, 900, 60), 'precio = referencia nueva');
  const rec = getRecommendedLoadProfile(mapped, 900);
  assert.deepEqual(plan.specs, { daytimeLoadRatio: rec.daytimeRatio, daytimeSelfConsumptionRatio: rec.daytimeRatio, loadProfilePreset: rec.preset });

  const tariffPlan = planTariffChange(ctx, 'BTD');
  assert.equal(tariffPlan.rates.tariffCode, 'BTD');
  assert.equal(tariffPlan.rates.distributor, undefined, 'cambiar la tarifa no toca la distribuidora');
  assert.equal(tariffPlan.rates.energyCostPerKWh, getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDESUR', 'BTD', 900, 60));
  assert.equal(tariffPlan.specs?.loadProfilePreset, getRecommendedLoadProfile('BTD', 900).preset);

  // Perfil manual y falta de updateSpecs: el perfil no se recalcula.
  assert.equal(planDistributorChange({ ...ctx, loadProfilePreset: 'custom' }, 'EDENORTE').specs, null);
  assert.equal(planTariffChange({ ...ctx, loadProfilePreset: 'custom' }, 'BTD').specs, null);
  assert.equal(planTariffChange({ ...ctx, canWriteSpecs: false }, 'BTD').specs, null);
  assert.ok(planTariffChange({ ...ctx, loadProfilePreset: 'residential' }, 'BTD').specs, 'un perfil no manual sí se recalcula');
}

// --- Tarifas: perfil de carga y proyección de autoconsumo ---
assert.equal(activeLoadPreset('residential', 90), 'residential', 'el preset explícito manda');
assert.equal(activeLoadPreset(undefined, 75), 'commercial', 'sin preset se infiere del porcentaje');
assert.equal(activeLoadPreset(undefined, 50), 'custom');
assert.equal(activeLoadPreset('commercial', 35), 'commercial');
for (const ratio of [35, 75, 90]) assert.equal(activeLoadPreset('custom', ratio), 'custom', `Manual explícito al ${ratio}% se respeta`);
assert.deepEqual(loadProfileChange('commercial'), { daytimeLoadRatio: 75, daytimeSelfConsumptionRatio: 75, loadProfilePreset: 'commercial' });
assert.deepEqual(loadProfileChange('custom'), { loadProfilePreset: 'custom' }, 'Manual conserva el slider');
assert.deepEqual(daytimeSliderChange(60), { daytimeLoadRatio: 60, daytimeSelfConsumptionRatio: 60, loadProfilePreset: 'custom' });

{
  const html = renderRates(makeProject({ specs: { daytimeLoadRatio: 35, loadProfilePreset: 'residential' } }), { projectionEnabled: true });
  assert.match(html, /id="pd-rates-daytime"[^>]*type="range"|type="range"[^>]*id="pd-rates-daytime"/);
  assert.match(html, /min="15"/);
  assert.match(html, /max="95"/);
  assert.match(html, /<button[^>]*role="combobox"[^>]*>[\s\S]*?Residencial 35%[\s\S]*?<\/button>/, 'perfil seleccionado en el disparador');
  assert.match(html, /Solar/);
  assert.match(html, /Red/);
  assert.doesNotMatch(html, /Batería <b/, 'sin batería no hay segmento BESS');
  assert.match(html, /Autoconsumo total/);
  assert.match(html, /Generación diaria/);
  assert.match(html, /aria-label="Autoconsumo en gráficos"/);
  assert.match(html, /aria-checked="true"[^>]*>Mostrar</, 'por defecto el autoconsumo se muestra');
  const hidden = renderRates(makeProject({ specs: { showSelfConsumptionBreakdown: false } }), { projectionEnabled: true });
  assert.match(hidden, /aria-checked="true"[^>]*>Ocultar</);

  const battery = renderRates(
    makeProject({ specs: { hasBattery: true, batteryBrandModel: 'Bat', batteryCapacityKWh: 10, batteryCount: 1, batteryDOD: 90, batteryEfficiencyPct: 90, daytimeLoadRatio: 35 } }),
    { projectionEnabled: true },
  );
  assert.match(battery, /Batería <b/, 'con batería la leyenda suma el segmento BESS');
  assert.match(battery, /bg-pd-bess/);
}

// Manual explícito con 35/75/90: el selector muestra «Manual» y los cambios de tarifa no recalculan el perfil.
for (const ratio of [35, 75, 90]) {
  const manual = renderRates(makeProject({ specs: { daytimeLoadRatio: ratio, loadProfilePreset: 'custom' } }), { projectionEnabled: true });
  assert.match(manual, /<button[^>]*role="combobox"[^>]*>[\s\S]*?Manual[\s\S]*?<\/button>/, `selector en Manual al ${ratio}%`);
  assert.doesNotMatch(manual, /role="combobox"[^>]*>[\s\S]{0,200}?Residencial 35%/, 'no muestra un perfil predefinido');
}
{
  const ctx = { matrix: undefined, avgMonthlyConsumption: 900, dopExchangeRate: 60, rates: { distributor: 'EDESUR', tariffCode: 'BTS2' } as never, canWriteSpecs: true };
  assert.equal(planTariffChange({ ...ctx, loadProfilePreset: 'custom' }, 'BTD').specs, null);
  assert.ok(planTariffChange({ ...ctx, loadProfilePreset: loadProfileChange('residential').loadProfilePreset }, 'BTD').specs, 'al elegir un preset vuelven las recomendaciones');
}

console.log('testParameterDockClientRates: ok');
