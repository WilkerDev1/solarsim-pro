import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProposalCommercialReview } from '../components/common/ai-invoice/components/ProposalCommercialReview';

// Checkboxes show what the engine applies: margin and ITBIS exemption default to on when the flag is absent.
const render = (item: Record<string, unknown>) => renderToStaticMarkup(React.createElement(ProposalCommercialReview, {
  draft: { commercial: { customItems: [{ id: 'i', description: 'Canaletas', quantity: 1, unit: 'UD', unitPriceUSD: 10, ...item }] } } as any,
  update: () => {},
}));
const checks = (html: string) => [...html.matchAll(/<label class="proposal-check"><input type="checkbox"( checked="")?/g)].map(m => Boolean(m[1]));

assert.deepEqual(checks(render({})), [true, true], 'Unset flags render as margin on and ITBIS exempt');
assert.deepEqual(checks(render({ applyMargin: false, exonerateITBIS: false })), [false, false]);
assert.deepEqual(checks(render({ applyMargin: true, exonerateITBIS: true })), [true, true]);
assert.deepEqual(checks(render({ applyITBIS: false })), [true, false], 'Legacy applyITBIS=false means ITBIS is charged');
console.log('Proposal commercial review mirrors engine defaults for margin and ITBIS.');
