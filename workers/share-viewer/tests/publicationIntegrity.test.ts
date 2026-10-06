import assert from 'node:assert/strict';
import { createShareViewer } from '../src/index';
import { renderExpiredPage, renderProposalPage } from '../src/template';
import { BENCHMARK_PROJECT } from '../../../src/engine/referenceCase';
import { calculateProjectFinancialSummary } from '../../../src/engine/financeEngine';
import { escapeHtml, scriptJson } from '../src/escaping';
import { readBoundedJson, MAX_SHARE_BYTES } from '../src/validation';
import type { StoredProposal } from '../src/types';

const rows = new Map<string, string>();
let writes = 0;
const env = {
  AUTH_API_URL: 'https://solarsim.electsun.net',
  PROPOSALS_KV: {
    get: async (key: string) => rows.get(key) ?? null,
    put: async (key: string, value: string) => { writes++; rows.set(key, value); },
  },
};
let authStatus = 200;
let authUnavailable = false;
let authCalls = 0;
let enabled = false;
const requestFetch: typeof fetch = async (input, init) => {
  authCalls++;
  assert.equal(String(input), 'https://solarsim.electsun.net/api/auth/share-authorization');
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer session.test.token');
  assert.equal(init?.redirect, 'manual');
  if (authUnavailable) throw new Error('offline');
  return Response.json({ success: authStatus === 200, userId: 'user-test', organizationId: 'org-test', featurePolicy: { version: 2, settings: { selfConsumptionProjection: enabled } } }, { status: authStatus });
};
const app = createShareViewer(requestFetch);
function payload(mode: 'legacy' | 'self_consumption' = 'legacy') {
  const project = structuredClone(BENCHMARK_PROJECT);
  project.customization = { companyName: 'Empresa & Hijos', companySlogan: 'Calidad', showSelfConsumptionInProposal: true } as typeof project.customization;
  return { project, summary: calculateProjectFinancialSummary(project, mode), validityDays: 7, calculationSnapshot: { mode, capturedAt: new Date().toISOString(), organizationId: 'org-test', policyVersion: 2 } };
}
async function publish(body: unknown, token: string | null = 'session.test.token') {
  return app.request('https://propuesta.electsun.net/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }, env as never);
}
async function main() {
  assert.equal((await publish(payload(), null)).status, 401);
  assert.equal(authCalls, 0);
  assert.equal(writes, 0);
  authStatus = 403;
  assert.equal((await publish(payload())).status, 403);
  assert.equal(writes, 0);
  authStatus = 302;
  assert.equal((await publish(payload())).status, 503, 'Authorization redirects are rejected without forwarding credentials');
  assert.equal(writes, 0);
  authStatus = 200; authUnavailable = true;
  assert.equal((await publish(payload())).status, 503);
  authUnavailable = false;
  const stale = payload(); stale.calculationSnapshot.policyVersion = 1;
  assert.equal((await publish(stale)).status, 409);
  const foreign = payload(); foreign.calculationSnapshot.organizationId = 'foreign';
  assert.equal((await publish(foreign)).status, 409);
  const missingSummary = { ...payload(), summary: undefined };
  assert.equal((await publish(missingSummary)).status, 400);
  const invalid = payload(); invalid.summary.monthlyBreakdown[0].consumptionKWh = -1;
  assert.equal((await publish(invalid)).status, 400);
  const badType = payload(); badType.project.client.name = { invalid: true } as never;
  assert.equal((await publish(badType)).status, 400);
  assert.equal((await publish({ ...payload(), validityDays: 0 })).status, 400);
  assert.equal((await publish({ ...payload(), validityDays: 91 })).status, 400);
  assert.equal((await publish({ ...payload(), padding: 'x'.repeat(MAX_SHARE_BYTES) })).status, 413);
  const oversizedStream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(40)); controller.enqueue(new Uint8Array(40)); controller.close(); } });
  await assert.rejects(() => readBoundedJson(new Request('https://test.local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: oversizedStream, duplex: 'half' } as RequestInit), 64), /tamaño/);
  assert.equal(writes, 0);

  const attack = '<span data-test="inert">Cliente</span>';
  const escaped = payload();
  escaped.project.client.name = attack;
  escaped.project.client.coordinates = '\" data-test=\"attribute';
  escaped.project.client.solarSourceMode = 'gps';
  escaped.project.specs.panelBrandModel = attack;
  escaped.project.customization!.companyName = '\" data-test=\"company';
  escaped.project.customization!.headerLogoBase64 = 'javascript:inert';
  escaped.project.customization!.customProjectSummaryParagraph1 = `**Título** ${attack}`;
  escaped.summary.monthlyBreakdown[0].month = '</script><span data-test="script">inert</span>';
  const response = await publish(escaped);
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json() as { id: string; shareUrl: string };
  assert.match(result.id, /^[a-f0-9]{32}$/);
  assert.equal(writes, 1);
  const stored = JSON.parse(rows.get(`proposal:${result.id}`)!) as StoredProposal;
  assert.equal(stored.calculationSnapshot?.mode, 'legacy');
  assert.equal(stored.publishedBy?.organizationId, 'org-test');
  const rendered = await app.request(result.shareUrl, {}, env as never);
  const html = await rendered.text();
  assert.equal(rendered.status, 200);
  assert.equal(rendered.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(html.includes(escapeHtml(attack)));
  assert.ok(!html.includes(attack));
  assert.ok(!html.includes('src="javascript:'));
  assert.ok(!html.includes('</script><span'));
  assert.ok(html.includes('<strong class="font-bold text-slate-950">Título</strong>'));
  assert.ok(!html.includes('data-energy-mode="self_consumption"'));
  assert.ok(!html.includes("label: 'Autoconsumo en sitio (kWh)'"));
  assert.equal(JSON.parse(scriptJson(['</script>', '\u2028']))[0], '</script>');
  assert.ok(renderExpiredPage(attack, attack).includes(escapeHtml(attack)));
  assert.ok(!renderExpiredPage(attack, attack).includes(attack));

  enabled = true;
  const physical = await publish(payload('self_consumption'));
  assert.equal(physical.status, 200, await physical.clone().text());
  const physicalResult = await physical.json() as { id: string };
  const physicalHtml = await (await app.request(`https://test.local/p/${physicalResult.id}`, {}, env as never)).text();
  assert.ok(physicalHtml.includes('data-energy-mode="self_consumption"'));
  assert.ok(physicalHtml.includes('Inyección neta (kWh)'));
  assert.ok(physicalHtml.includes("label: 'Autoconsumo en sitio (kWh)'"));
  const visualLegacy = payload('self_consumption'); visualLegacy.project.customization!.showSelfConsumptionInProposal = false;
  const visualResponse = await publish(visualLegacy);
  assert.equal(visualResponse.status, 200);
  const visualResult = await visualResponse.json() as { id: string };
  assert.ok(!(await (await app.request(`https://test.local/p/${visualResult.id}`, {}, env as never)).text()).includes('data-energy-mode="self_consumption"'));
  delete stored.calculationSnapshot;
  assert.ok(!renderProposalPage(stored).includes('data-energy-mode="self_consumption"'));

  rows.set('proposal:old7abc', JSON.stringify({ ...stored, id: 'old7abc', expiresAt: new Date(Date.now() + 86400000).toISOString() }));
  assert.equal((await app.request('https://test.local/p/old7abc', {}, env as never)).status, 200);
  rows.set('proposal:expired1', JSON.stringify({ ...stored, expiresAt: '2000-01-01T00:00:00Z' }));
  assert.equal((await app.request('https://test.local/p/expired1', {}, env as never)).status, 404);
  assert.equal((await app.request('https://test.local/api/share/hydrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [123] }) }, env as never)).status, 400);
  const metadata = await app.request(`https://test.local/api/share/${physicalResult.id}`, {}, env as never);
  assert.equal((await metadata.json() as { calculationSnapshot: { mode: string } }).calculationSnapshot.mode, 'self_consumption');

  // Exercise stored-and-served output rather than testing only the escaping helper.
  const footerAttack = '<script>globalThis.__unsafeProposalFooter = 1</script>';
  async function publishedHtml(body: ReturnType<typeof payload>): Promise<string> {
    const published = await publish(body);
    assert.equal(published.status, 200, await published.clone().text());
    const result = await published.json() as { id: string; shareUrl: string };
    const saved = JSON.parse(rows.get(`proposal:${result.id}`)!) as StoredProposal;
    assert.equal(saved.calculationSnapshot?.mode, body.calculationSnapshot.mode);
    return (await app.request(result.shareUrl, {}, env as never)).text();
  }
  function amountAfterLabel(html: string, label: string): string {
    const start = html.indexOf(label);
    assert.ok(start >= 0, `Missing financial label: ${label}`);
    const amount = html.slice(start, start + 500).match(/US\$ ([\d,]+\.\d{2})/);
    assert.ok(amount, `Missing financial amount: ${label}`);
    return amount[1];
  }
  for (const mode of ['legacy', 'self_consumption'] as const) {
    enabled = mode === 'self_consumption';
    for (const footerSource of ['custom', 'province'] as const) {
      const body = payload(mode);
      body.project.customization!.companyFooterText = footerSource === 'custom' ? footerAttack : '';
      body.project.client.province = footerSource === 'province' ? footerAttack : 'Santo Domingo';
      const safeHtml = await publishedHtml(body);
      assert.ok(safeHtml.includes(escapeHtml(footerAttack)));
      assert.ok(!safeHtml.includes(footerAttack));
    }

    // All remaining text contexts share the same untrusted marker, including
    // nested equipment, custom quote items and the restricted Markdown format.
    const untrusted = payload(mode);
    for (const key of ['name', 'projectId', 'quoteNumber', 'province', 'address', 'contactPhone', 'coordinates', 'distributor', 'tariffCode']) {
      Object.assign(untrusted.project.client, { [key]: attack });
    }
    for (const key of ['companyName', 'companySlogan', 'companyFooterText', 'companyPhone', 'companyRnc', 'companyWebsite', 'contactName', 'clientPhone', 'regulatoryNote', 'validityNote', 'panelWarrantyText', 'inverterWarrantyText', 'batteryWarrantyText', 'workmanshipWarrantyText', 'servicesIncludedText', 'projectSummarySubtitle', 'projectEngineeringScopeText', 'customProjectSummaryParagraph1', 'customProjectSummaryParagraph2']) {
      Object.assign(untrusted.project.customization!, { [key]: attack });
    }
    Object.assign(untrusted.project.specs, { panelBrandModel: attack, inverterBrandModel: attack, batteryBrandModel: attack, installationServicesDesc: attack, hasBattery: true, panels: [{ count: 1, powerW: 620, brandModel: attack }], inverters: [{ count: 1, powerKW: 8, brandModel: attack }], batteries: [{ count: 1, capacityKWh: 16, brandModel: attack }] });
    Object.assign(untrusted.project.rates, { distributor: attack, tariffCode: attack });
    Object.assign(untrusted.project.financials, { customItems: [{ description: attack, unit: attack, quantity: 1, unitPriceUSD: 1 }] });
    untrusted.summary.monthlyBreakdown[0].month = `</script>${attack}`;
    const safeHtml = await publishedHtml(untrusted);
    assert.ok(safeHtml.includes(escapeHtml(attack)));
    assert.ok(!safeHtml.includes(attack));
    assert.ok(!safeHtml.includes(`</script>${attack}`));

    for (const scenario of ['disabled', 'explicit-zero', 'equipment-discount'] as const) {
      const body = payload(mode);
      if (scenario === 'disabled') body.project.financials.applyLey5707 = false;
      else if (scenario === 'explicit-zero') {
        body.project.financials.applyLey5707 = true;
        body.project.financials.customLey5707CreditUSD = 0;
      } else {
        body.project.financials.applyLey5707 = true;
        body.project.financials.customDiscounts = [{ id: 'zero-equipment-base', description: 'Descuento sobre toda la base elegible', type: 'fixed', value: body.summary.equipmentPortionUSD, target: 'equipment' }];
      }
      body.summary = calculateProjectFinancialSummary(body.project, mode);
      assert.equal(body.summary.ley5707CreditUSD, 0);
      if (scenario === 'equipment-discount') assert.equal(body.summary.equipmentPortionUSD, 0);
      if (scenario === 'explicit-zero') body.summary.cashFlow25Years[0].netCashFlowUSD = 0;
      const zeroHtml = await publishedHtml(body);
      assert.equal(amountAfterLabel(zeroHtml, 'TOTAL CRÉDITO FISCAL LEY 57-07 (40%)'), '0.00');
      if (scenario === 'equipment-discount') assert.equal(amountAfterLabel(zeroHtml, 'Inversión Elegible en Equipos Renovables'), '0.00');
      if (scenario === 'explicit-zero') {
        const annualRows = zeroHtml.slice(zeroHtml.indexOf('<!-- Years 1 to 25 -->'));
        const firstRow = annualRows.match(/<tr[^>]*>([\s\S]*?)<\/tr>/)![1];
        const cells = [...firstRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1].replace(/<[^>]*>/g, '').trim());
        assert.equal(cells[5], 'US$ 0.00');
      }
      // Existing KV records without a summary credit must also respect disabled incentives.
      if (scenario === 'disabled') {
        const oldStored: StoredProposal = { id: 'legacy0credit', project: body.project, summary: { ...body.summary }, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), validityDays: 1 };
        delete (oldStored.summary as Partial<typeof body.summary>).ley5707CreditUSD;
        rows.set(`proposal:${oldStored.id}`, JSON.stringify(oldStored));
        const oldHtml = await (await app.request(`https://test.local/p/${oldStored.id}`, {}, env as never)).text();
        assert.equal(amountAfterLabel(oldHtml, 'TOTAL CRÉDITO FISCAL LEY 57-07 (40%)'), '0.00');
      }
    }
  }

  // Verificación de múltiples modelos de inversores, baterías y paneles con retroactividad
  const multiEquipProposal: StoredProposal = {
    id: 'multi-equip-test',
    project: {
      id: 'proj-vicente-noble',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      client: {
        name: 'ESTACION DE SERVICIO, VICENTE NOBLE SRL',
        projectId: 'P-001',
        quoteNumber: 'COT-001',
        province: 'Barahona',
        address: 'Vicente Noble',
        contactPhone: '8090000000',
        coordinates: '',
        solarSourceMode: 'manual',
        distributor: 'EDESUR',
        tariffCode: 'BTD',
      },
      specs: {
        panelCount: 156,
        panelPowerW: 630,
        panelBrandModel: 'JA Solar JAM66D45-630/LB (630W)',
        panels: [
          { count: 156, powerW: 630, brandModel: 'JA Solar JAM66D45-630/LB (630W)' },
        ],
        inverterCount: 7,
        inverterPowerKW: 16,
        inverterBrandModel: 'Luxpower GEN-LB-US 16K (16.0Kw)',
        inverters: [
          { count: 1, powerKW: 16, brandModel: 'Luxpower GEN-LB-US 16K (16.0Kw)' },
          { count: 6, powerKW: 10, brandModel: 'Huawei SUN2000-10KTL-M1 (10.0Kw)' },
        ],
        hasBattery: true,
        batteryCount: 6,
        batteryCapacityKWh: 15,
        batteryBrandModel: 'HinaESS HI-15e (15kWh)',
        batteries: [
          { count: 6, capacityKWh: 15, brandModel: 'HinaESS HI-15e (15kWh)' },
        ],
        installationServicesDesc: 'junto con todos los componentes de ingeniería complementarios (estructuras de montaje en aluminio anodizado de alta resistencia, cableado fotovoltaico resistente a rayos UV, protecciones en CC/CA, interruptores de desconexión y supresores de sobretensión) para garantizar un funcionamiento seguro, eficiente y duradero del sistema.',
      },
      rates: {
        distributor: 'EDESUR',
        tariffCode: 'BTD',
        energyRateUSD: 0.22,
        gridExportFeePct: 25,
      },
      financials: {
        customItems: [],
        applyITBISExemption: true,
        applyLey5707: true,
      },
      monthlyConsumption: [12584, 12584, 12584, 12584, 12584, 12584, 12584, 12584, 12584, 12584, 12584, 12584],
      customization: {
        companyName: 'Electsun',
        customProjectSummaryParagraph1: 'El consumo promedio anual de **ESTACION DE SERVICIO, VICENTE NOBLE SRL** es de **151,008.0 kWh** (aprox. 12,584 kWh/mes), por lo que se le propone la instalación de **156 Módulos JA Solar JAM66D45-630/LB (630W) JA Solar JAM66D45-630/LB (630W)**, alcanzando una potencia DC instalada de **98.28 kWp**. La producción energética estimada para este sistema es de **155,152.4 kWh anuales**, representando el **102.7%** de cobertura del consumo total.',
        customProjectSummaryParagraph2: 'Adicionalmente, se contempla la instalación de **7 Inversores Luxpower GEN-LB-US 16K (16.0Kw) y 6 Baterías HinaESS HI-15e (15kWh)**, junto con todos los componentes de ingeniería complementarios (estructuras de montaje en aluminio anodizado de alta resistencia, cableado fotovoltaico resistente a rayos UV, protecciones en CC/CA, interruptores de desconexión y supresores de sobretensión) para garantizar un funcionamiento seguro, eficiente y duradero del sistema..',
      },
    },
    summary: {
      systemCapacityKWp: 98.28,
      annualProductionKWh: 155152.4,
      annualConsumptionKWh: 151008.0,
      energyCoveragePct: 102.7,
      grossInvestmentUSD: 100000,
      totalEffectiveAnnualSavingsUSD: 25000,
      paybackYears: 4,
      irrPct: 25,
      npvUSD: 50000,
      roi25YrPct: 300,
      monthlyBreakdown: [],
      cashFlow25Years: [],
    } as any,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    validityDays: 7,
  };

  rows.set(`proposal:${multiEquipProposal.id}`, JSON.stringify(multiEquipProposal));
  const multiHtml = await (await app.request(`https://test.local/p/${multiEquipProposal.id}`, {}, env as never)).text();
  assert.ok(multiHtml.includes('1 Inversor Luxpower GEN-LB-US 16K (16.0Kw) y 6 Inversores Huawei SUN2000-10KTL-M1 (10.0Kw)'));
  assert.ok(!multiHtml.includes('7 Inversores Luxpower'));
  assert.ok(!multiHtml.includes('JA Solar JAM66D45-630/LB (630W) JA Solar JAM66D45-630/LB (630W)'));
  assert.ok(multiHtml.includes('156 Módulos JA Solar JAM66D45-630/LB (630W)'));

  console.log('PASS: publicación autenticada, límites, esquema, escape HTML/atributos/JSON/Markdown, snapshots, retroactividad multi-equipos y expiración.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
