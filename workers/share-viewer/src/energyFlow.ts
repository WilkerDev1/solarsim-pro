import { escapeHtml } from './escaping';

export type FlowBranchKey = 'home' | 'battery' | 'grid';
export interface FlowBranch { key: FlowBranchKey; pct: number; kWh: number }
interface FlowInput { hybrid: boolean; isZeroExport: boolean; annualProductionKWh: number; monthly: any[] }

// The diagram is a visual guide, not a measurement: shares are rounded to 5 %
// and fall back to a typical split when the publication lacks usable data.
const TYPICAL: Record<string, Partial<Record<FlowBranchKey, number>>> = {
  onGrid: { home: 50, grid: 50 },
  zeroExport: { home: 100 },
  hybrid: { home: 50, battery: 35, grid: 15 },
  hybridZeroExport: { home: 60, battery: 40 },
};
const ORDER: FlowBranchKey[] = ['home', 'battery', 'grid'];

function roundToFive(raw: Partial<Record<FlowBranchKey, number>>): Partial<Record<FlowBranchKey, number>> {
  const keys = ORDER.filter((k) => (raw[k] ?? 0) > 0);
  const total = keys.reduce((sum, k) => sum + raw[k]!, 0);
  const exact = keys.map((k) => ({ k, units: (raw[k]! / total) * 20 }));
  const units = Object.fromEntries(exact.map(({ k, units: u }) => [k, Math.floor(u)])) as Record<FlowBranchKey, number>;
  let left = 20 - keys.reduce((sum, k) => sum + units[k], 0);
  for (const { k } of [...exact].sort((a, b) => (b.units % 1) - (a.units % 1))) {
    if (left-- <= 0) break;
    units[k] += 1;
  }
  // Every present flow stays visible, even when it is small.
  for (const k of keys) {
    if (units[k] > 0) continue;
    const largest = keys.reduce((a, b) => (units[a] >= units[b] ? a : b));
    units[largest] -= 1;
    units[k] = 1;
  }
  return Object.fromEntries(keys.map((k) => [k, units[k] * 5]));
}

export function energyFlowBranches({ hybrid, isZeroExport, annualProductionKWh, monthly }: FlowInput): FlowBranch[] {
  const rows = Array.isArray(monthly) ? monthly : [];
  const sum = (pick: (m: any) => number) => rows.reduce((total, m) => total + (Number(pick(m)) || 0), 0);
  const production = sum((m) => m.productionKWh);
  const selfConsumed = sum((m) => m.solarSelfConsumedKWh);
  const battery = hybrid ? sum((m) => m.batteryContributionKWh) : 0;
  // Summaries published before gridExportedKWh existed: what is not self-consumed was exported.
  const exported = isZeroExport ? 0 : sum((m) => typeof m.gridExportedKWh === 'number'
    ? m.gridExportedKWh
    : Math.max(0, (Number(m.productionKWh) || 0) - (Number(m.solarSelfConsumedKWh) || 0)));

  const usable = production > 0 && selfConsumed > 0 && (!hybrid || battery > 0);
  const pct = usable
    ? roundToFive({ home: Math.max(0, selfConsumed - battery), battery, grid: exported })
    : TYPICAL[hybrid ? (isZeroExport ? 'hybridZeroExport' : 'hybrid') : (isZeroExport ? 'zeroExport' : 'onGrid')];
  const total = annualProductionKWh > 0 ? annualProductionKWh : production;
  return ORDER.filter((k) => (pct[k] ?? 0) > 0)
    .map((key) => ({ key, pct: pct[key]!, kWh: Math.round((total * pct[key]!) / 100 / 100) * 100 }));
}

const ICONS = {
  sun: '<circle class="ef-ic" cx="15.5" cy="6" r="2.6"/><path class="ef-ic" d="M15.5 1.2v.9M20.3 6h.9M18.9 2.6l.6-.6M12.1 2.6l-.6-.6M3 13h14l3 8H6zM8.3 13l1.9 8M12.7 13l2.3 8M4.6 17h14.2"/>',
  inverter: '<rect class="ef-ic" x="4" y="3" width="16" height="18" rx="2.5"/><path class="ef-ic" d="M7.5 10.5q1.5-3.2 3 0t3 0t3 0M8 16.5h8"/>',
  home: '<path class="ef-ic" d="M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M13 11l-2.4 3.6h2.8L11 18.2"/>',
  battery: '<rect class="ef-ic" x="6" y="4" width="12" height="17" rx="2.5"/><path class="ef-ic" d="M10 2.2h4M9 17.5h6M9 14.5h6M9 11.5h6"/>',
  grid: '<path class="ef-ic" d="M7.5 21 12 3l4.5 18M5 8h14M6.3 13h11.4M8.8 17.5l6.4-4.5M15.2 17.5l-6.4-4.5"/>',
};
const STYLE: Record<FlowBranchKey, { line: string; band: string; fill: string; ring: string; icon: string; bar: string }> = {
  home: { line: '#ff7a00', band: '#ffe0c2', fill: '#fff4e8', ring: '#ffd2a6', icon: '#e86a00', bar: '#ff7a00' },
  battery: { line: '#16a34a', band: '#cdeed8', fill: '#effaf2', ring: '#bfe8cb', icon: '#15803d', bar: '#16a34a' },
  grid: { line: '#0284c7', band: '#cfe6f6', fill: '#eef7fd', ring: '#bfe1f6', icon: '#0369a1', bar: '#0284c7' },
};
const NODE_Y: Record<number, number[]> = { 1: [170], 2: [100, 240], 3: [60, 170, 280] };

function labelFor(key: FlowBranchKey, hybrid: boolean): string {
  if (key === 'battery') return 'Carga de batería';
  if (key === 'grid') return hybrid ? 'Excedente a la red' : 'Inyectado a la red';
  return hybrid ? 'Consumo directo' : 'Consumo de la casa';
}
const kWhText = (kWh: number) => `≈ ${kWh.toLocaleString('en-US')} kWh / año`;

function flowSvg(branches: FlowBranch[], hybrid: boolean, productionKWh: number, compact: boolean, ariaLabel: string): string {
  const ys = NODE_Y[branches.length] ?? NODE_Y[3];
  let offset = 156;
  const paths = branches.map((b, i) => {
    const band = Math.max(3, (28 * b.pct) / 100);
    const startY = offset + band / 2;
    offset += band;
    const d = `M222 ${startY.toFixed(2)}C290 ${startY.toFixed(2)} 290 ${ys[i]} 348 ${ys[i]}`;
    const dot = Math.max(3.5, band * 0.46);
    const speed = b.pct >= 20 ? 'ef-s2' : 'ef-s3';
    return {
      band: `<path class="ef-band" d="${d}" stroke="${STYLE[b.key].band}" stroke-width="${band.toFixed(2)}"/>`,
      flow: `<path class="ef-flow ef-d14 ${speed}" d="${d}" stroke="${STYLE[b.key].line}" stroke-width="${dot.toFixed(2)}"/>`,
    };
  });
  const nodes = branches.map((b, i) => {
    const y = ys[i];
    const s = STYLE[b.key];
    const labels = compact ? '' : `
      <text class="ef-v" x="420" y="${y - 4}"><tspan class="ef-approx">≈</tspan>${b.pct} %</text>
      <text class="ef-l" x="420" y="${y + 14}">${labelFor(b.key, hybrid)}</text>
      ${b.kWh > 0 ? `<text class="ef-m" x="420" y="${y + 30}">${kWhText(b.kWh)}</text>` : ''}`;
    return `<circle cx="376" cy="${y}" r="28" fill="${s.fill}" stroke="${s.ring}" stroke-width="1.5"/>
      <svg x="362" y="${y - 14}" width="28" height="28" viewBox="0 0 24 24" style="color:${s.icon}">${ICONS[b.key]}</svg>${labels}`;
  }).join('');
  const production = productionKWh > 0
    ? `<text class="ef-vs" x="56" y="234" text-anchor="middle">≈ ${(Math.round(productionKWh / 100) * 100).toLocaleString('en-US')}</text>
      <text class="ef-m" x="56" y="251" text-anchor="middle">kWh / año</text>`
    : `<text class="ef-m" x="56" y="234" text-anchor="middle">Producción solar</text>`;
  return `<svg data-energy-flow-svg="${compact ? 'compact' : 'full'}" viewBox="${compact ? '0 0 412 340' : '0 0 560 340'}" class="${compact ? 'sm:hidden' : 'hidden sm:block max-w-[600px] mx-auto'} w-full h-auto" role="img" aria-label="${escapeHtml(ariaLabel)}">
      <path class="ef-band" d="M90 170H150" stroke="#ffe0c2" stroke-width="28"/>
      ${paths.map((p) => p.band).join('')}
      <path class="ef-flow ef-d22 ef-s1" d="M90 170H150" stroke="#ff7a00" stroke-width="10"/>
      ${paths.map((p) => p.flow).join('')}
      <circle cx="56" cy="170" r="34" fill="#fff4e8" stroke="#ffd2a6" stroke-width="1.5"/>
      <svg x="40" y="154" width="32" height="32" viewBox="0 0 24 24" style="color:#e86a00">${ICONS.sun}</svg>
      ${production}
      <rect x="150" y="134" width="72" height="72" rx="18" fill="#f6f8fb" stroke="#d5dbe5" stroke-width="1.5"/>
      <svg x="168" y="152" width="36" height="36" viewBox="0 0 24 24" style="color:#334155">${ICONS.inverter}</svg>
      <text class="ef-cap" x="186" y="228" text-anchor="middle">INVERSOR</text>
      ${nodes}
    </svg>`;
}

/** Variant C of the energy flow diagram: one diagram, hybrid or grid-tied, above section 1. */
export function renderEnergyFlowSection(input: FlowInput): string {
  const { hybrid, isZeroExport } = input;
  const branches = energyFlowBranches(input);
  const productionKWh = input.annualProductionKWh > 0
    ? input.annualProductionKWh
    : (Array.isArray(input.monthly) ? input.monthly.reduce((t, m) => t + (Number(m?.productionKWh) || 0), 0) : 0);
  const title = hybrid ? 'Sistema híbrido' : (isZeroExport ? 'Sistema de autoconsumo' : 'Sistema de inyección');
  const subtitle = hybrid ? 'con batería' : (isZeroExport ? 'inyección cero' : 'on-grid');
  const ariaLabel = `Flujo anual aproximado de un ${title.toLowerCase()}: ${branches.map((b) => `${b.pct} % ${labelFor(b.key, hybrid).toLowerCase()}`).join(', ')}`;
  const legend = branches.map((b) => `
        <li class="flex items-center gap-3 py-2">
          <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border" style="background:${STYLE[b.key].fill};border-color:${STYLE[b.key].ring};color:${STYLE[b.key].icon}">
            <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">${ICONS[b.key]}</svg>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-semibold text-slate-700">${labelFor(b.key, hybrid)}</span>
            ${b.kWh > 0 ? `<span class="block text-[11px] text-slate-500 tabular-nums">${kWhText(b.kWh)}</span>` : ''}
          </span>
          <span class="text-lg font-extrabold text-slate-900 tabular-nums">≈${b.pct} %</span>
        </li>`).join('');

  return `<section data-energy-flow="${hybrid ? 'hybrid' : 'on-grid'}" class="bg-white border border-sky-100 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs sm:shadow-sm space-y-3 sm:space-y-4">
      <div class="space-y-1">
        <div class="text-[10.5px] sm:text-[11px] font-black uppercase text-sky-700 tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Flujo energético estimado
        </div>
        <h2 class="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight">¿A dónde va cada kWh que produce su sistema?</h2>
        <p class="text-[11px] sm:text-xs text-slate-500">Guía visual aproximada del reparto anual de la producción solar. El grosor de cada línea representa su porcentaje.</p>
      </div>
      <div class="text-xs sm:text-sm font-bold text-slate-900">${title} <span class="font-medium text-slate-500">· ${subtitle}</span></div>
      ${flowSvg(branches, hybrid, productionKWh, false, ariaLabel)}
      ${flowSvg(branches, hybrid, productionKWh, true, ariaLabel)}
      <ul data-energy-flow-legend class="sm:hidden divide-y divide-slate-100">${legend}
      </ul>
      <div class="flex h-2.5 rounded-full overflow-hidden gap-[3px]" aria-hidden="true">
        ${branches.map((b) => `<div style="width:${b.pct}%;background:${STYLE[b.key].bar}"></div>`).join('')}
      </div>
    </section>`;
}

/** Shared stylesheet for the diagram; animation is CSS-only and stops under reduced motion. */
export const ENERGY_FLOW_CSS = `
    .ef-ic { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .ef-band { fill: none; stroke-linecap: butt; }
    .ef-flow { fill: none; stroke-linecap: round; animation: ef-flow14 1s linear infinite; }
    .ef-d14 { stroke-dasharray: 0 14; }
    .ef-d22 { stroke-dasharray: 0 22; animation-name: ef-flow22; }
    .ef-s1 { animation-duration: .6s; }
    .ef-s2 { animation-duration: .85s; }
    .ef-s3 { animation-duration: 1.8s; }
    @keyframes ef-flow14 { to { stroke-dashoffset: -14; } }
    @keyframes ef-flow22 { to { stroke-dashoffset: -22; } }
    .ef-v { font-size: 22px; font-weight: 800; fill: #0f172a; font-variant-numeric: tabular-nums; }
    .ef-approx { font-size: 16px; font-weight: 700; fill: #64748b; }
    .ef-vs { font-size: 17px; font-weight: 700; fill: #0f172a; font-variant-numeric: tabular-nums; }
    .ef-l { font-size: 12.5px; font-weight: 600; fill: #334155; }
    .ef-m { font-size: 11.5px; font-weight: 500; fill: #5b6576; font-variant-numeric: tabular-nums; }
    .ef-cap { font-size: 10px; font-weight: 700; fill: #5b6576; letter-spacing: .1em; }
    @media (prefers-reduced-motion: reduce) { .ef-flow { animation: none; } }`;
