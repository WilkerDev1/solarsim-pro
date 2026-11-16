import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeIssues, groupIssues, pendingByTab, reviewAnchor, issueTier } from '../components/common/ai-invoice/reviewIssues';
import { ReviewIssueDigest } from '../components/common/ai-invoice/components/ReviewIssueDigest';
import { ProposalDraftReview } from '../components/common/ai-invoice/components/ProposalDraftReview';

// Presentation-only triage of the validation issues the draft already exposes (code, severity, message).
const draft = {
  clientName: '', panels: [{ id: 'p', brandModel: 'Jinko 635', powerW: 635, count: 24, unitPriceUSD: 102 }],
  inverters: [{ id: 'i', brandModel: 'WeCo XTS-10K', powerKW: 10, count: 1 }],
  batteries: [
    { id: 'b0', brandModel: 'Otra batería', capacityKWh: 5, count: 1, unitPriceUSD: 900 },
    { id: 'b1', brandModel: 'Batería WeCo 16K0-LV (16.06kWh)', capacityKWh: 16.06, count: 2, unitPriceUSD: 2300, requestedModel: 'Bateria Weco 16.0 kwh' },
  ],
  monthlyConsumptionKWh: [], unresolvedRequests: [],
} as never;
const issues = [
  { code: 'requested_battery_model_mismatch', severity: 'error', message: 'Batería WeCo 16K0-LV (16.06kWh) no coincide con el modelo solicitado (Bateria Weco 16.0 kwh).' },
  { code: 'unknown_tariff', severity: 'error', message: 'La tarifa BTS-1 de EDENORTE no se pudo confirmar.' },
  { code: 'pv_overload', severity: 'warning', message: 'El arreglo excede la potencia FV máxima.' },
  { code: 'battery_compatibility_unknown', severity: 'warning', message: 'Confirma compatibilidad.' },
  { code: 'missing_inverter_price', severity: 'warning', message: 'WeCo XTS-10K no tiene oferta disponible.' },
  { code: 'document_totalCostUSD_difference', severity: 'warning', message: 'Revisa costo total: referencia informativa.' },
  { code: 'context_consumption', severity: 'warning', message: 'Se conservaron los consumos del proyecto.' },
  { code: 'missing_client', severity: 'error', message: 'Indica el nombre del cliente.' },
  { code: 'unresolved_request', severity: 'error', message: 'Usar otra marca de inversor.' },
  { code: 'something_new', severity: 'warning', message: 'Código sin vínculo conocido.' },
] as const;

// 1. Tiers: errors always block; informative warnings are separated from the ones to confirm.
assert.equal(issueTier(issues[0]), 'blocking');
assert.equal(issueTier(issues[2]), 'confirm');
assert.equal(issueTier(issues[5]), 'info', 'document reconciliation is informative');
assert.equal(issueTier(issues[6]), 'info');
assert.equal(issueTier({ code: 'context_consumption', severity: 'error' }), 'blocking', 'severity error is never downgraded');

// 2. Targets link each issue to the review field it affects when the data allows it.
const views = describeIssues([...issues], draft);
const byCode = (code: string) => views.find(v => v.code === code)!;
assert.deepEqual(byCode('requested_battery_model_mismatch').target, { tab: 'equipment', anchor: reviewAnchor.row('batteries', 1), label: 'Baterías' }, 'row matched by model name');
assert.equal(byCode('unknown_tariff').target?.anchor, reviewAnchor.field('tariffCode'));
assert.equal(byCode('unknown_tariff').target?.tab, 'client');
assert.equal(byCode('missing_client').target?.anchor, reviewAnchor.field('clientName'));
assert.equal(byCode('pv_overload').target?.anchor, reviewAnchor.group('inverters'));
assert.equal(byCode('battery_compatibility_unknown').target?.anchor, reviewAnchor.group('batteries'));
assert.equal(byCode('missing_inverter_price').target?.anchor, reviewAnchor.row('inverters', 0));
assert.equal(byCode('document_totalCostUSD_difference').target?.tab, 'commercial');
assert.equal(byCode('context_consumption').target?.anchor, reviewAnchor.field('months'));
assert.equal(byCode('unresolved_request').target?.anchor, reviewAnchor.unresolved);
assert.equal(byCode('unresolved_request').target?.tab, undefined, 'unresolved requests sit above the tabs');
assert.equal(byCode('something_new').target, undefined, 'unknown codes stay listed without a fake link');

// 3. Grouping and per-tab counters (only blocking + to confirm count as pending).
const groups = groupIssues(views);
assert.deepEqual([groups.blocking.length, groups.confirm.length, groups.info.length], [4, 4, 2]);
assert.deepEqual(pendingByTab(views), { consumption: 0, equipment: 4, commercial: 0, client: 2 });

// 4. Digest in the chat: grouped by severity, counted, collapsible and linked.
const digest = renderToStaticMarkup(React.createElement(ReviewIssueDigest, { issues: views, onNavigate: () => {} }));
assert.match(digest, /Revisemos estos detalles/);
assert.equal((digest.match(/<details/g) || []).length, 3, 'one collapsible group per severity');
assert.match(digest, /<details[^>]*open=""[^>]*data-tier="blocking"|<details[^>]*data-tier="blocking"[^>]*open=""/, 'blockers start expanded');
assert.doesNotMatch(digest, /<details[^>]*data-tier="info"[^>]*open=""/, 'informative notes start collapsed');
assert.match(digest, /Bloquean la creación[\s\S]*?4/);
assert.equal((digest.match(/aria-label="Ir a /g) || []).length, views.filter(v => v.target).length, 'every linked issue is a button');

// 5. Review: summary with pending count, tab counters and inline flags with text (not only color).
const review = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
  draft: { ...(draft as object), distributor: 'EDENORTE', tariffCode: 'BTS-1', province: 'Santiago' } as never,
  catalog: [], matrix: { schedules: {} } as never, context: { province: 'Santiago' } as never, preview: null, production: null,
  update: () => {}, issues: [...issues] as never,
}));
assert.match(review, /8 puntos? por revisar|8 por revisar/, 'summary counts blocking + to confirm');
assert.match(review, /id="proposal-label-equipment"[^>]*>[\s\S]*?4[\s\S]*?pendientes/, 'equipment tab shows its pending count');
assert.match(review, /id="proposal-field-clientName"[^>]*data-flag="blocking"/, 'client field flagged inline');
assert.match(review, /Bloquea:[^<]*<\/strong>|Bloquea:/, 'flag is explained with text');
assert.match(review, /aria-invalid="true"/);
console.log('PASS: review issues are tiered, linked to fields, counted per tab and flagged inline.');
