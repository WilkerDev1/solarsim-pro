import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeIssues, groupIssues, pendingByTab, reviewAnchor, issueTier, firstPendingTarget, buildIssueModel, blocksPreview, applyBarCounts, requestedRowAlert, confirmRequestedRow } from '../components/common/ai-invoice/reviewIssues';
import { ProposalApplyBar } from '../components/common/ai-invoice/components/ProposalApplyBar';
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
// Deliberate (round 2): each group shows its first three rows and «Ver N más»; every visible linked row is a button.
const shownLinked = (['blocking', 'confirm', 'info'] as const).reduce((sum, tier) => sum + groups[tier].slice(0, 3).filter(v => v.target).length, 0);
assert.equal((digest.match(/aria-label="Ir a /g) || []).length, shownLinked, 'every visible linked issue is a button');

// 5. Review: summary with pending count, tab counters and inline flags with text (not only color).
const review = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
  draft: { ...(draft as object), distributor: 'EDENORTE', tariffCode: 'BTS-1', province: 'Santiago' } as never,
  catalog: [], matrix: { schedules: {} } as never, context: { province: 'Santiago' } as never, preview: null, production: null,
  update: () => {}, issues: [...issues] as never,
}));
assert.match(review, /8(<[^>]+>)? por revisar/, 'summary counts blocking + to confirm');
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
  // El bloqueo es del modelo solicitado: sólo el selector de modelo lleva aria-invalid.
  const invalid = controls.filter((tag) => /aria-invalid="true"/.test(tag));
  assert.equal(invalid.length, 1, 'exactly one control is marked invalid');
  assert(invalid[0].startsWith('<select'), 'the model select carries the blocker');
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
  assert.match(html, /8(<[^>]+>)? por revisar/);
}

// 11. One issue model, computed once: severity, destination and group, consumed by review, chat digest and footer.
{
  const model = buildIssueModel([...issues], draft);
  assert.deepEqual(model.counts, { blocking: 4, confirm: 4, info: 2, pending: 8 });
  assert.equal(model.blocksCreation, true, 'any error blocks creation (same rule as canApply)');
  assert.deepEqual(model.byTab, pendingByTab(views));
  assert.equal(model.firstPending?.anchor, reviewAnchor.row('batteries', 1), 'first blocker with a destination');
  assert.equal(model.tabTier.equipment, 'blocking');
  assert.equal(model.tabTier.consumption, undefined, 'informative notes do not color a tab');
  const group = (code: string) => model.views.find(v => v.code === code)!.group;
  assert.equal(group('requested_battery_model_mismatch'), 'equipment');
  assert.equal(group('unknown_tariff'), 'client');
  assert.equal(group('unresolved_request'), 'requests');
  assert.equal(group('something_new'), 'general');
  assert.equal(buildIssueModel([{ code: 'document_text_seen_partially', severity: 'warning', message: 'x' }]).views[0].group, 'document');
  assert.deepEqual(model.byTier.blocking.map(v => v.code), groupIssues(views).blocking.map(v => v.code));
  const empty = buildIssueModel([], draft);
  assert.equal(empty.blocksCreation, false);
  assert.equal(empty.firstPending, undefined);
  // Warnings never block (document reconciliation is always a warning).
  assert.equal(buildIssueModel([{ code: 'document_totalCostUSD_difference', severity: 'warning', message: 'x' }]).blocksCreation, false);
  // The preview is skipped only for errors in figures it would compute with (same codes as before).
  assert.equal(blocksPreview([{ code: 'missing_client', severity: 'error', message: '' }]), false);
  assert.equal(blocksPreview([{ code: 'invalid_panel_count', severity: 'error', message: '' }]), true);
  assert.equal(blocksPreview([{ code: 'missing_panel_price', severity: 'warning', message: '' }]), false);
  assert.equal(blocksPreview([{ code: 'invalid_exchange', severity: 'error', message: '' }]), true);
  // Digest and review accept the model as is and show the same counts.
  const digestHtml = renderToStaticMarkup(React.createElement(ReviewIssueDigest, { model, onNavigate: () => {} }));
  assert.match(digestHtml, /4 bloquean/);
  assert.match(digestHtml, /4 por confirmar/);
  const reviewHtml = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
    draft: { ...(draft as object), distributor: 'EDENORTE', tariffCode: 'BTS-1' } as never, catalog: [], matrix: { schedules: {} } as never, context: { province: 'Santiago' } as never, preview: null, production: null,
    update: () => {}, issueModel: model,
  }));
  assert.match(reviewHtml, /8(<[^>]+>)? por revisar/);
  // The footer reads the same counts.
  const footer = renderToStaticMarkup(React.createElement(ProposalApplyBar, { ...applyBarCounts(model), reviewConfirmed: false, canApply: false, busy: false, onConfirmChange() {}, onResolve() {}, onCreate() {}, onFocusCheck() {} }));
  assert.match(footer, /4 bloqueos impiden/);
  assert.match(footer, /Resolver 4 bloqueos/);
}
// 12. Model and power/capacity requests are different issues; confirming a row resolves exactly what it shows.
{
  const row = { id: 'b1', brandModel: 'Batería WeCo 16K0-LV (16.06kWh)', capacityKWh: 16.06, count: 2, requestedModel: 'Batería WeCo 16K0-LV', requestedCapacityKWh: 10 };
  const capacityOnly = describeIssues([{ code: 'requested_battery_mismatch', severity: 'error', message: 'Batería WeCo 16K0-LV (16.06kWh) no coincide con la potencia/capacidad solicitada (10).' }], { batteries: [row] } as never);
  const alert = requestedRowAlert(capacityOnly);
  assert.equal(alert.model, undefined, 'a capacity mismatch is not a model issue');
  assert.equal(alert.magnitude?.code, 'requested_battery_mismatch');
  const confirmed = confirmRequestedRow(row, alert);
  assert.equal(confirmed.requestedCapacityKWh, undefined, 'confirming clears the capacity request it shows');
  assert.equal(confirmed.requestedModel, 'Batería WeCo 16K0-LV', 'and leaves the model request, which had no issue');
  const both = requestedRowAlert(describeIssues([
    { code: 'requested_battery_model_mismatch', severity: 'error', message: 'Batería WeCo 16K0-LV (16.06kWh) no coincide con el modelo solicitado (Batería WeCo 16K0-LV).' },
    { code: 'requested_battery_mismatch', severity: 'error', message: 'Batería WeCo 16K0-LV (16.06kWh) no coincide con la potencia/capacidad solicitada (10).' },
  ], { batteries: [row] } as never));
  const cleared = confirmRequestedRow(row, both);
  assert.equal(cleared.requestedModel, undefined);
  assert.equal(cleared.requestedCapacityKWh, undefined);
  for (const code of ['requested_inverter_model_ambiguous', 'requested_inverter_model_partial', 'requested_inverter_model_mismatch'])
    assert.equal(requestedRowAlert(describeIssues([{ code, severity: 'warning', message: 'x' }])).model?.code, code);
  // Render: a capacity mismatch says so, with what was asked, and is not described as an unconfirmed model.
  const html = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
    draft: { ...(draft as object), batteries: [row], distributor: 'EDENORTE', tariffCode: 'BTS-1' } as never, catalog: [], matrix: { schedules: {} } as never, context: {} as never, preview: null, production: null,
    update: () => {}, issueViews: capacityOnly,
  }));
  assert.match(html, /capacidad no coincide con la solicitada/);
  assert.doesNotMatch(html, /no pudo confirmar el modelo/);
  assert.match(html, /10 kWh/);
  // A row with a requested model and no issue shows no alert.
  const quiet = renderToStaticMarkup(React.createElement(ProposalDraftReview, {
    draft: { ...(draft as object), batteries: [row], distributor: 'EDENORTE', tariffCode: 'BTS-1' } as never, catalog: [], matrix: { schedules: {} } as never, context: {} as never, preview: null, production: null,
    update: () => {}, issueViews: [],
  }));
  assert.doesNotMatch(quiet, /proposal-row-alert/);
}
console.log('PASS: review issues are tiered, linked to fields, counted per tab and flagged inline.');
