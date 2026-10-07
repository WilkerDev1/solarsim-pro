import assert from 'node:assert/strict';
import { resolveDynamicProjectSummaryParagraph1 } from '../utils/textFormatter';

const project = { specs: { panelCount: 38 } };
const summary = { systemCapacityKWp: 23.56, annualProductionKWh: 45000, annualConsumptionKWh: 12000, energyCoveragePct: 95 };
const panels = '20 Módulos Modelo A (620W) y 18 Módulos Modelo B (610W)';
const resolve = (text: string, model = panels) => resolveDynamicProjectSummaryParagraph1(text, 'default', project, summary, 'CLIENTE 2026', model);
const paragraph = 'El consumo promedio anual de **CLIENTE 2026** es de **12,000.0 kWh**. Se propone la instalación de **30 Módulos Modelo antiguo (600W)**, alcanzando una potencia DC instalada de **18.00 kWp**. Producción energética estimada para este sistema es de **30,000.0 kWh anuales**, representando el **80.0%** de cobertura del consumo total.';
const resolved = resolve(paragraph);
assert.ok(resolved.includes('**CLIENTE 2026**'), 'Preserve the bold client preceding equipment');
assert.ok(resolved.includes('**12,000.0 kWh**'), 'Preserve the energy value preceding equipment');
assert.ok(resolved.includes(`**${panels}**`), 'Update the entire mixed-panel equipment block');
assert.ok(resolved.includes('**23.56 kWp**'));
assert.ok(resolved.includes('**45,000.0 kWh anuales**'));
assert.ok(!resolved.includes('Modelo antiguo'));

for (const text of [
  'Oferta exclusiva para **CLIENTE 2026** con consumo de **12000 kWh**.',
  'Información personalizada: **12 equipos auxiliares**, **12000 kWh** y **Texto libre**.',
  'Solicitamos **12 inversiones**. Se discute instalar un sistema más adelante.',
]) assert.equal(resolve(text), text, 'Do not rewrite unrelated custom bold content');
assert.equal(resolve('Se instala **1 Módulo Anterior**.', 'Modelo C (620W)'), 'Se instala **38 Módulos Modelo C (620W)**.');
assert.equal(resolve('Se instala **30 Modulos Anterior**.', 'Modelo C $& (620W)'), 'Se instala **38 Módulos Modelo C $& (620W)**.', 'Model text must be literal in replacements');
assert.ok(resolve('Cliente **{clientName}**: **{panelModel}**.').includes(`**${panels}**`));
console.log('PASS: paragraph panel updates preserve client, consumption and unrelated custom content.');
