import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeIssues, groupIssues, pendingByTab, reviewAnchor, issueTier, firstPendingTarget } from '../components/common/ai-invoice/reviewIssues';
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
// 6. Overlapping model names: the longest match wins; requested_* also uses the requested model.
{
  const overlap = { inverters: [
    { id: 'a', brandModel: 'WeCo 5K', powerKW: 5, count: 1 },
    { id: 'b', brandModel: 'WeCo 5K Pro', powerKW: 5, count: 1 },
  ] } as never;
  const [price] = describeIssues([{ code: 'missing_inverter_price', severity: 'warning', message: 'WeCo 5K Pro no tiene oferta disponible.' }], overlap);
  assert.equal(price.target?.anchor, reviewAnchor.row('inverters', 1), 'prefix model does not steal the issue');
  const requested = { inverters: [
    { id: 'a', brandModel: 'WeCo 5K', powerKW: 5, count: 1, requestedModel: 'Growatt 5000' },
    { id: 'b', brandModel: 'WeCo 5K Pro', powerKW: 5, count: 1, requestedModel: 'Deye 5K' },
  ] } as never;
  const [mismatch] = describeIssues([{ code: 'requested_inverter_model_mismatch', severity: 'error', message: 'WeCo 5K no coincide con el modelo solicitado (Deye 5K).' }], requested);
  assert.equal(mismatch.target?.anchor, reviewAnchor.row('inverters', 1), 'requested model disambiguates');
}

// 7. The summary button goes to the first blocker even when a "to confirm" issue comes first.
{
  const ordered = describeIssues([
    { code: 'pv_overload', severity: 'warning', message: 'x' },
    { code: 'missing_client', severity: 'error', message: 'y' },
  ], draft);
  assert.equal(firstPendingTarget(ordered)?.anchor, reviewAnchor.field('clientName'));
  assert.equal(firstPendingTarget(describeIssues([{ code: 'pv_overload', severity: 'warning', message: 'x' }], draft))?.anchor, reviewAnchor.group('inverters'));
  assert.equal(firstPendingTarget(describeIssues([{ code: 'context_consumption', severity: 'warning', message: 'x' }], draft)), undefined, 'informative notes are not pending');
}

// 8. Document texts: issues link to the block; partial reading needs confirmation and counts in the summary.
{
  const texts = describeIssues([
    { code: 'document_text_seen_partially', severity: 'warning', message: 'La IA solo vio el inicio de: Nota legal.' },
    { code: 'unknown_document_text', severity: 'warning', message: 'El documento no tiene el texto «x».' },
  ], draft);
  assert.equal(texts[0].target?.anchor, reviewAnchor.documentTexts);
  assert.equal(texts[0].tier, 'confirm');
  assert.equal(texts[1].tier, 'info', 'ignored keys are informative');
}

// 9. Row controls point at their row warning; aria-invalid only when the blocker is theirs.
{
  const html = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
    draft: { ...(draft as object), distributor: 'EDENORTE', tariffCode: 'BTS-1', province: 'Santiago' } as never,
    catalog: [], matrix: { schedules: {} } as never, context: { province: 'Santiago' } as never, preview: null, production: null,
    update: () => {}, issues: [...issues] as never,
  }));
  const row = reviewAnchor.row('batteries', 1);
  const controls = html.match(new RegExp(`<[^>]*aria-describedby="${row}-issues"[^>]*>`, 'g')) || [];
  assert(controls.length >= 3, 'model, units and cost describe the row warning');
  assert(controls.every((tag) => /aria-invalid="true"/.test(tag)) || controls.filter((tag) => /aria-invalid="true"/.test(tag)).length >= 1);
  assert.match(html, new RegExp(`id="${row}-issues"`));
  const otherRow = html.match(new RegExp(`<[^>]*aria-describedby="${reviewAnchor.row('panels', 0)}-issues"`));
  assert.equal(otherRow, null, 'rows without warnings stay clean');
}

// 10. Views can be passed already derived (no second describeIssues pass needed by the container).
{
  const html = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
    draft: { ...(draft as object), distributor: 'EDENORTE', tariffCode: 'BTS-1' } as never, catalog: [], matrix: { schedules: {} } as never, context: { province: 'Santiago' } as never, preview: null, production: null,
    update: () => {}, issueViews: views,
  }));
  assert.match(html, /8 por revisar/);
}
console.log('PASS: review issues are tiered, linked to fields, counted per tab and flagged inline.');
