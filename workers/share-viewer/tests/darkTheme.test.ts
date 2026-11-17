import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderExpiredPage, renderProposalPage } from '../src/template';
import { ENERGY_FLOW_CSS } from '../src/energyFlow';
import { createShareViewer } from '../src/index';
import { PALETTE_TOKENS, ROLE_TOKENS, THEME_CSS, THEME_INIT_SCRIPT, THEME_STORAGE_KEY, THEME_TOGGLE_SCRIPT, VARIABLE_TOKENS } from '../src/theme';
import type { StoredProposal } from '../src/types';

const month = (production: number) => ({ month: 'Ene', consumptionKWh: 750, productionKWh: production, effectiveSavedKWh: production });
const proposal = (extra: Partial<StoredProposal['project']> = {}): StoredProposal => ({
  id: 'tema', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-12-31T00:00:00.000Z', validityDays: 15,
  calculationSnapshot: { mode: 'self_consumption', capturedAt: '2026-01-01T00:00:00.000Z', organizationId: 'org', policyVersion: 1 },
  project: {
    client: { name: 'Cliente Tema' },
    specs: { hasBattery: true, panels: [{ brandModel: 'Panel 600', powerW: 600, count: 10 }], inverters: [{ brandModel: 'Inversor', powerKW: 6, count: 1 }], batteries: [{ brandModel: 'LFP', capacityKWh: 10, count: 1 }] },
    rates: {}, financials: { customDiscounts: [{ type: 'fixed', value: 100 }] }, customization: {}, ...extra,
  } as any,
  summary: {
    systemCapacityKWp: 6, annualProductionKWh: 9000, annualConsumptionKWh: 9000, grossInvestmentUSD: 10000, totalDiscountUSD: 100,
    monthlyBreakdown: [month(700), month(800)], cashFlow25Years: [{ year: 1, savingsUSD: 1000, cumulativeCashFlowUSD: -9000 }, { year: 2, savingsUSD: 1000, cumulativeCashFlowUSD: 500 }],
  } as any,
});

const html = renderProposalPage(proposal());
const head = html.slice(0, html.indexOf('</head>'));

// 1. The page declares both schemes, so browsers that force dark leave its own dark theme alone.
assert.ok(head.includes('<meta name="color-scheme" content="light dark">'), 'meta color-scheme');
assert.ok(head.includes('<meta name="darkreader-lock">'), 'Dark Reader lock');
// While light is shown the root opts out of forced darkening; dark preference or choice switches to the page's own dark.
assert.ok(/:root \{ color-scheme: only light;/.test(head), ':root color-scheme while light');
assert.ok(/:root:not\(\[data-theme="light"\]\) \{ color-scheme: dark;/.test(head) && /:root\[data-theme="dark"\] \{ color-scheme: dark;/.test(head), 'dark scheme in use when dark');
assert.ok(head.includes('@media screen and (prefers-color-scheme: dark)') && head.includes(':root[data-theme="dark"]'), 'automatic and manual dark');
assert.ok(/:root\[data-theme="light"\] \{ color-scheme: only light; \}/.test(head), 'manual light opts out of Auto Dark Theme');
assert.ok(/@media print \{ :root, :root\[data-theme\] \{ color-scheme: only light;/.test(head), 'printing always uses the light theme');
// Printing must come out light by CSS alone (beforeprint may never fire): every rule that switches to the
// dark values (or the dark logo plate) has to live inside an `@media screen …` block, never print.
const enclosingAtRules = (css: string, index: number): string[] => {
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < index; i++) {
    if (css[i] === '{') { stack.push(css.slice(start, i).trim()); start = i + 1; }
    else if (css[i] === '}') { stack.pop(); start = i + 1; }
    else if (css[i] === ';') start = i + 1;
  }
  return stack.filter((s) => s.startsWith('@'));
};
const darkMarker = `--c-page: ${[11, 18, 32].join(' ')};`;
const darkUses = [...THEME_CSS.matchAll(new RegExp(darkMarker.replace(/[-]/g, '\\-'), 'g'))].map((m) => m.index ?? 0);
const plateUses = [...THEME_CSS.matchAll(/background: var\(--logo-plate\)/g)].map((m) => m.index ?? 0);
assert.ok(darkUses.length >= 2 && plateUses.length >= 2, 'automatic and manual dark rules found');
for (const at of [...darkUses, ...plateUses]) {
  const media = enclosingAtRules(THEME_CSS, at);
  assert.ok(media.some((m) => /^@media screen\b/.test(m)), `dark rule limited to screen, found in: ${JSON.stringify(media)}`);
}
// The stored choice is applied in <head>, before Tailwind and before the body paints.
assert.ok(head.indexOf(THEME_INIT_SCRIPT) > 0 && head.indexOf(THEME_INIT_SCRIPT) < head.indexOf('cdn.tailwindcss.com'), 'no flash of the wrong theme');
assert.ok(head.includes('tailwind.config') && head.includes('rgb(var(--tw-sky-700) / <alpha-value>)'), 'Tailwind palette reads the theme variables');
assert.ok(/html, body \{ background-color: rgb\(var\(--c-page\)\); \}/.test(THEME_CSS), 'page background is themed before Tailwind runs');

// 2. Every token has a light and a dark value; the light values keep the approved look.
const all = [...Object.values(PALETTE_TOKENS).flatMap((s) => Object.values(s)), ...Object.values(ROLE_TOKENS), ...Object.values(VARIABLE_TOKENS)];
for (const pair of all) for (const hex of pair) assert.match(hex, /^#[0-9a-f]{6}$/);
assert.equal(PALETTE_TOKENS.sky[700][0], '#0369a1');
assert.equal(ROLE_TOKENS.page[0], '#f0f7fc');
assert.equal(ROLE_TOKENS.surface[0], '#ffffff');

// 3. WCAG AA in the dark theme: text 4.5:1 on its surfaces, meaningful graphics 3:1.
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const D = 1;
const darkSurfaces = [ROLE_TOKENS.page[D], ROLE_TOKENS.surface[D], ROLE_TOKENS.zebra[D], PALETTE_TOKENS.slate[50][D], PALETTE_TOKENS.slate[100][D]];
const textShades: Record<string, number[]> = { slate: [400, 500, 600, 700, 800, 900, 950], sky: [700, 800, 900, 950], orange: [600, 700, 800, 900, 950], amber: [700, 800], emerald: [800, 900, 950], red: [600, 700], rose: [600, 700], blue: [800] };
for (const [hue, shades] of Object.entries(textShades)) {
  const own = [PALETTE_TOKENS[hue][50][D], PALETTE_TOKENS[hue][100][D]];
  for (const shade of shades) {
    for (const bg of [...darkSurfaces, ...own]) {
      const ratio = contrast(PALETTE_TOKENS[hue][shade][D], bg);
      assert.ok(ratio >= 4.5, `text-${hue}-${shade} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
}
for (const fg of [ROLE_TOKENS['on-head'][D], PALETTE_TOKENS.emerald[300][D], PALETTE_TOKENS.orange[400][D]]) {
  assert.ok(contrast(fg, ROLE_TOKENS.head[D]) >= 4.5, `table header text ${fg}`);
}
const v = (name: string) => VARIABLE_TOKENS[name][D];
for (const name of ['ef-value', 'ef-value-muted', 'ef-label']) assert.ok(contrast(v(name), ROLE_TOKENS.surface[D]) >= 4.5, name);
for (const tone of ['green', 'indigo', 'amber']) assert.ok(contrast(v(`ef-pill-${tone}`), v(`ef-pill-${tone}-bg`)) >= 4.5, `pill ${tone}`);
assert.ok(contrast(v('ef-btn-on-text'), v('ef-btn-on')) >= 4.5, 'selected situation button');
for (const name of ['chart-consumption', 'chart-production', 'chart-self', 'chart-positive', 'chart-negative']) assert.ok(contrast(v(name), v('chart-bg')) >= 3, name);
assert.ok(contrast(v('chart-tick'), v('chart-bg')) >= 4.5, 'chart ticks');
for (const name of ['ef-flow-o', 'ef-flow-g', 'ef-flow-b']) assert.ok(contrast(v(name), ROLE_TOKENS.surface[D]) >= 3, name);
for (const node of ['sun', 'battery', 'grid']) assert.ok(contrast(v(`ef-${node}-icon`), v(`ef-${node}-fill`)) >= 3, `${node} icon`);
assert.ok(contrast(v('ef-inverter-icon'), v('ef-inverter-fill')) >= 3, 'inverter icon');

// 4. No fixed colours outside the token definitions in the main rules and markup.
const hexIn = (s: string) => s.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
assert.deepEqual(hexIn(ENERGY_FLOW_CSS), [], 'energy-flow CSS uses variables only');
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(THEME_CSS, '');
assert.deepEqual(hexIn(styles), [], 'page CSS uses variables only');
const body = html.slice(html.indexOf('<body'));
assert.deepEqual(hexIn(body.replace(/src="data:[^"]*"/g, '')), [], 'markup, diagram and chart script use variables only');
assert.ok(!/\b(?:fill|stroke)="#/.test(body), 'SVG presentation attributes are not fixed colours');
assert.ok(!/\[#[0-9a-fA-F]+\]/.test(html), 'no arbitrary Tailwind colours');
assert.ok(!/\bbg-white\b/.test(body), 'surfaces use bg-surface');
// Sistema aislado (diagrama propio y sección «Energía Entregada y Autonomía»): también sin colores fijos.
for (const supplyAlternative of ['no_comparison', 'generator']) {
  const island = renderProposalPage(proposal({ rates: { gridConnection: 'off_grid', isZeroExport: true, supplyAlternative } } as any));
  const islandBody = island.slice(island.indexOf('<body'));
  assert.ok(islandBody.includes('data-energy-flow="off-grid-hybrid"'), `${supplyAlternative}: diagrama aislado`);
  if (supplyAlternative === 'no_comparison') assert.ok(islandBody.includes('data-savings-basis="no_comparison"'), 'sección de energía y autonomía');
  assert.deepEqual(hexIn(islandBody.replace(/src="data:[^"]*"/g, '')), [], `${supplyAlternative}: markup aislado usa variables`);
  assert.ok(!/\b(?:fill|stroke)="#/.test(islandBody) && !/\bbg-white\b/.test(islandBody), `${supplyAlternative}: sin colores fijos`);
}
assert.ok(body.includes("getPropertyValue('--chart-consumption')") || body.includes('--chart-consumption'), 'charts read the theme');

// 5. Logos are never inverted: a light plate holds them in dark mode.
assert.ok(/<span class="pv-logo-plate">\s*<img/.test(body), 'logo sits on a plate');
assert.ok(!/invert\(/.test(html), 'no colour inversion');
assert.ok(/<span class="pv-logo-plate">\s*<img/.test(renderExpiredPage()), 'expired page logo sits on a plate');
assert.ok(renderExpiredPage().includes('<meta name="color-scheme" content="light dark">'), 'expired page is themed too');

// 6. Old links without metadata still render with the theme.
const legacy = proposal();
legacy.summary = undefined;
delete (legacy as Partial<StoredProposal>).calculationSnapshot;
const legacyHtml = renderProposalPage(legacy);
assert.ok(legacyHtml.includes('<meta name="color-scheme" content="light dark">') && legacyHtml.includes('data-energy-flow='));

// 6b. The inline <head> scripts (theme start-up, tailwind.config) must not be blocked by a Content-Security-Policy.
void (async () => {
const kv = new Map<string, string>([['proposal:tema1234', JSON.stringify({ ...proposal(), expiresAt: '2099-01-01T00:00:00.000Z' })]]);
const viewerResponse = await createShareViewer(async () => { throw new Error('sin red'); }).request('https://test.local/p/tema1234', {}, { PROPOSALS_KV: { get: async (k: string) => kv.get(k) ?? null } } as never);
assert.equal(viewerResponse.status, 200);
const csp = viewerResponse.headers.get('Content-Security-Policy');
if (csp) {
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('default-src')) ?? '';
  assert.ok(scriptSrc.includes("'unsafe-inline'") || /'(sha256|sha384|sha512)-/.test(scriptSrc), `CSP must allow the inline theme scripts: ${csp}`);
}
})().catch((error) => { console.error(error); process.exit(1); });

// 7. The manual switch: hidden without JavaScript, cycles auto → light → dark → auto and survives a blocked localStorage.
assert.ok(/<button[^>]*data-theme-toggle[^>]*hidden/.test(body) && /data-theme-toggle[^>]*class="[^"]*no-print/.test(body), 'switch hidden without JS and when printing');
const runToggle = (storage: any) => {
  const attrs: Record<string, string> = {};
  const listeners: Record<string, () => void> = {};
  const root = { getAttribute: (n: string) => attrs[n] ?? null, setAttribute: (n: string, x: string) => { attrs[n] = x; }, removeAttribute: (n: string) => { delete attrs[n]; } };
  const btnAttrs: Record<string, string> = {};
  const btn = { hidden: true, setAttribute: (n: string, x: string) => { btnAttrs[n] = x; }, addEventListener: (_: string, fn: () => void) => { listeners.click = fn; } };
  const events: string[] = [];
  const document = { documentElement: root, querySelector: () => btn, dispatchEvent: (e: { type: string }) => events.push(e.type) };
  class Event { type: string; constructor(t: string) { this.type = t; } }
  vm.runInNewContext(THEME_INIT_SCRIPT, { document, window: { localStorage: storage } });
  vm.runInNewContext(THEME_TOGGLE_SCRIPT, { document, window: { localStorage: storage }, Event });
  return { attrs, btn, btnAttrs, click: () => listeners.click(), events };
};
const store: Record<string, string> = {};
const memory = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, x: string) => { store[k] = x; }, removeItem: (k: string) => { delete store[k]; } };
const t = runToggle(memory);
assert.equal(t.btn.hidden, false);
assert.equal(t.attrs['data-theme'], undefined);
assert.match(t.btnAttrs['aria-label'], /automático.*claro/);
t.click(); assert.equal(t.attrs['data-theme'], 'light'); assert.equal(store[THEME_STORAGE_KEY], 'light');
t.click(); assert.equal(t.attrs['data-theme'], 'dark'); assert.equal(store[THEME_STORAGE_KEY], 'dark');
assert.deepEqual(t.events, ['pv-themechange', 'pv-themechange'], 'charts are told to repaint');
assert.equal(runToggle(memory).attrs['data-theme'], 'dark', 'the choice persists across visits');
t.click(); assert.equal(t.attrs['data-theme'], undefined); assert.equal(store[THEME_STORAGE_KEY], undefined);
const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
const b = runToggle(blocked);
b.click(); assert.equal(b.attrs['data-theme'], 'light', 'works without storage');

console.log('Tema oscuro: esquemas declarados, variables en ambos temas, contraste AA y conmutador manual.');
