import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { calculateFinancialSummary, resolveAnnualDegradationPct } from '../engine/financeEngine';
import { DEFAULT_SIMULATION_SETTINGS } from '../store/defaultSimulationSettings';
import { createAIProposalBase, prepareProposalDraftProject } from '../utils/proposalDraftProject';
import { DEFAULT_RD_TARIFF_MATRIX } from '../data/rdTariffs';
import type { ProjectSimulation } from '../types';

/**
 * Release 2.7.1: el caso de referencia ahora trae grupos, y su grupo de paneles lleva `annualDegradation: 0.5`. Un
 * proyecto nuevo (modo simple) no debe heredar valores por grupo que le ganen a lo configurado por el usuario:
 * `resolveAnnualDegradationPct` prioriza el valor del grupo sobre el del sistema.
 */
const original = store.getState();
const summaryOf = (project: ProjectSimulation) => calculateFinancialSummary(project.client.province, project.specs, project.rates, project.financials, project.monthlyConsumption);
const withDegradation = (project: ProjectSimulation, pct: number): ProjectSimulation => ({
  ...project,
  specs: { ...project.specs, annualDegradation: pct, panels: project.specs.panels!.map((group) => ({ ...group, annualDegradation: pct })) },
});

try {
  store.setState({ projects: [], activeProjectId: '' });
  const create = (name: string, defaultAnnualDegradation?: number) => {
    store.setState({ defaultSimulationSettings: { ...DEFAULT_SIMULATION_SETTINGS, defaultAnnualDegradation: defaultAnnualDegradation as number } });
    store.getState().createNewProject({ name });
    return store.getState().projects.find((project) => project.client.name === name)!;
  };

  // 1. Lo configurado manda: 0.4 % (el ajuste por defecto) y otros valores.
  for (const configured of [0.4, 0.7, 0.25]) {
    const created = create(`Degradación ${configured}`, configured);
    assert.equal(created.specs.isDetailed, false, 'un proyecto nuevo usa el modo simple');
    assert.equal(created.specs.annualDegradation, configured);
    assert.equal(resolveAnnualDegradationPct(created.specs), configured, `la degradación efectiva es la configurada (${configured} %)`);
    assert.ok(created.specs.panels!.every((group) => group.annualDegradation === undefined || group.annualDegradation === configured), 'ningún grupo heredado la contradice');
    assert.deepEqual(summaryOf(created), summaryOf(withDegradation(created, configured)), `el flujo de 25 años usa ${configured} %`);
  }

  // 2. La diferencia es real: con 0.4 % el flujo no es el de 0.5 %.
  const created = create('Degradación comparada', 0.4);
  assert.notDeepEqual(summaryOf(created), summaryOf(withDegradation(created, 0.5)), 'el motor distingue 0.4 % de 0.5 %');

  // 2b. Las propuestas de IA también parten de la referencia: la degradación configurada manda en la base y en el borrador.
  {
    const base = createAIProposalBase(BENCHMARK_PROJECT, { defaultAnnualDegradation: 0.4 } as never, 'Santiago');
    assert.equal(base.specs.isDetailed, false);
    assert.equal(resolveAnnualDegradationPct(base.specs), 0.4, 'la base de IA usa la degradación configurada');
    const data = { monthlyConsumptionKWh: Array(12).fill(1000), averageMonthlyKWh: 1000, province: 'Santiago', distributor: 'EDENORTE', tariffCode: 'BTS1',
      recommendedPanelCount: 12, selectedPanelWatts: 550, selectedPanelModel: 'Longi 550' };
    const draft = prepareProposalDraftProject(base, data as never, DEFAULT_RD_TARIFF_MATRIX as never, { isNew: true });
    assert.equal(resolveAnnualDegradationPct(draft.specs), 0.4, 'el borrador de selección única la conserva');
  }

  // 3. El caso de referencia (modo detallado, grupo con 0.5) conserva su resultado.
  assert.equal(BENCHMARK_PROJECT.specs.isDetailed, true);
  assert.equal(resolveAnnualDegradationPct(BENCHMARK_PROJECT.specs), 0.5);
  assert.equal(summaryOf(BENCHMARK_PROJECT).systemCapacityKWp, 23.56);
  console.log('New projects honor the configured annual degradation.');
} finally {
  store.setState(original, true);
}
