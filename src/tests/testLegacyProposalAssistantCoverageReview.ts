// LEGADO: se elimina en F6 junto con el modal ai-invoice (ProposalConsumptionReview).
// Lo que de testDockEffectiveAssumptions (sección 2) solo prueba la pantalla de revisión de consumo del asistente de propuestas.
// Parte de una suite mixta partida en F0 (red de seguridad del asistente único): la lógica que sobrevive sigue en la suite de origen.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateRecommendedPanelCount } from '../engine/solarEngine';
import { ProposalConsumptionReview } from '../components/common/ai-invoice/components/ProposalConsumptionReview';

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

// Cobertura en la revisión de IA (pantalla del modal): la pantalla dimensiona con la cobertura resuelta (95 %).
{
  const draft = { province: 'Santiago', monthlyConsumptionKWh: Array(12).fill(1000), observedMonthlyConsumptionKWh: Array(12).fill(1000), targetCoveragePct: 0, panels: [{ id: 'a', brandModel: 'P', powerW: 550, count: 1 }] } as never;
  const html = render(h(ProposalConsumptionReview, { draft, context: { province: 'Santiago' }, production: null, update: noop } as never));
  assert.equal(Number(/Cobertura objetivo \(%\)<input[^>]*value="([^"]*)"/.exec(html)?.[1]), 95, 'la pantalla muestra 95 % con cobertura 0');
  const target = (coverage: number) => { const s = calculateRecommendedPanelCount('Santiago', Array(12).fill(1000), 550, coverage, undefined, undefined); return (s.targetAnnualKWh / s.annualSpecificYieldKWhPerKWp).toFixed(2); };
  assert.notEqual(target(95), target(1), 'la prueba distingue 95 % de 1 %');
  assert.match(html, new RegExp(`Objetivo: <strong>${target(95)} kWp`), 'la pantalla dimensiona con la cobertura que muestra (95 %), no con 1 %');
}
console.log('PASS (legado): la pantalla de revisión del asistente de propuestas usa la cobertura resuelta.');