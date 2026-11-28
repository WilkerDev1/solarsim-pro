// LEGADO: se elimina en F6 junto con la revisión comercial del modal ai-invoice (ProposalCommercialReview, commercialRows).
// Antes testProposalCommercialReview: solo ejerce la pantalla de revisión comercial del asistente de propuestas.
// Renombrada en F0 (red de seguridad del asistente único) sin cambiar una sola aserción.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProposalCommercialReview } from '../components/common/ai-invoice/components/ProposalCommercialReview';
import { equipmentCostRows } from '../components/common/ai-invoice/commercialRows';

// Checkboxes show what the engine applies: margin and ITBIS exemption default to on when the flag is absent.
const render = (item: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ProposalCommercialReview, {
  draft: { commercial: { customItems: [{ id: 'i', description: 'Canaletas', quantity: 1, unit: 'UD', unitPriceUSD: 10, ...item }] } } as any,
  update: () => {},
}));
const checks = (html: string) => [...html.matchAll(/<label class="proposal-check"><input type="checkbox"( checked="")?/g)].map(m => Boolean(m[1]));

assert.deepEqual(checks(render({})), [true, true, false], 'Unset flags render as margin on, ITBIS exempt and listed in the invoice');
assert.deepEqual(checks(render({ applyMargin: false, exonerateITBIS: false })), [false, false, false]);
assert.deepEqual(checks(render({ applyMargin: true, exonerateITBIS: true })), [true, true, false]);
assert.deepEqual(checks(render({ applyITBIS: false })), [true, false, false], 'Legacy applyITBIS=false means ITBIS is charged');

// ITBIS per row is paired by equipment block and id, not by a flat index that a fallback group could shift.
{
  const item = (itbisUSD: number) => ({ itbisUSD }) as never;
  const draft = { panels: [], inverters: [{ id: 'inv', brandModel: 'Inv', count: 1, unitPriceUSD: 1000 }], batteries: [{ id: 'bat', brandModel: 'Bat', count: 2, unitPriceUSD: 2300 }] } as never;
  // The engine reads a fallback panel group when the draft has none: three matrix rows, not two.
  const specs = { panels: [{ id: 'legacy-panel', count: 10 }], inverters: [{ id: 'inv', count: 1 }], batteries: [{ id: 'bat', count: 2 }], hasBattery: true } as never;
  const financial = { costMatrix: { items: [item(0), item(0), item(828), item(99), item(7)] } } as never;
  const rows = equipmentCostRows(draft, financial, specs);
  assert.deepEqual(rows.map((r) => [r.row.brandModel, r.itbisUSD]), [['Inv', 0], ['Bat', 828]], 'battery ITBIS is the battery row, not the inverter one');
  // Saved specs with no panel groups: the engine (readEquipment) adds a legacy panel row first.
  const noPanels = { panels: [], inverters: [{ id: 'inv', count: 1 }], batteries: [{ id: 'bat', count: 2 }], hasBattery: true } as never;
  assert.deepEqual(equipmentCostRows(draft, financial, noPanels).map((r) => r.itbisUSD), [0, 828], 'fallback group offset respected');
  // Without the project groups (or when ids disagree) the ITBIS stays pending instead of guessing.
  assert.deepEqual(equipmentCostRows(draft, financial).map((r) => r.itbisUSD), [undefined, undefined]);
  const mismatched = { ...(specs as object), batteries: [{ id: 'other', count: 2 }] } as never;
  assert.equal(equipmentCostRows(draft, financial, mismatched)[1].itbisUSD, undefined);
  // Non-finite counts never produce NaN totals.
  const bad = { panels: [{ id: 'p', brandModel: 'P', count: Number.NaN, unitPriceUSD: 100 }] } as never;
  assert.equal(equipmentCostRows(bad, undefined)[0].totalUSD, undefined);
  const html = renderToStaticMarkup(React.createElement(ProposalCommercialReview, { draft: bad, update: () => {} }));
  assert(!html.includes('NaN'), 'no NaN in the table');
}
{
  // Una fila sin id nunca empareja con un grupo sin id (undefined === undefined).
  const noId = { panels: [{ powerW: 600, count: 1, unitPriceUSD: 10 }] } as never;
  const rows = equipmentCostRows(noId, { costMatrix: { items: [{ itbisUSD: 99 }] } } as never, { panels: [{}] } as never);
  assert.equal(rows[0].itbisUSD, undefined);
}
console.log('Proposal commercial review mirrors engine defaults for margin and ITBIS and pairs matrix rows by id.');
