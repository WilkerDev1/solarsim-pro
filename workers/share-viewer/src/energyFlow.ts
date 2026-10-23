import { escapeHtml } from './escaping';
import { energyFlowScenarios, type EnergyFlowScenarioInput, type FlowColor, type FlowLine, type ModeScenario, type PillTone } from './energyFlowScenarios';

const ICONS = {
  sun: '<circle class="ef-ic" cx="15.5" cy="6" r="2.6"/><path class="ef-ic" d="M15.5 1.2v.9M20.3 6h.9M18.9 2.6l.6-.6M12.1 2.6l-.6-.6M3 13h14l3 8H6zM8.3 13l1.9 8M12.7 13l2.3 8M4.6 17h14.2"/>',
  moon: '<path class="ef-ic" d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/>',
  inverter: '<rect class="ef-ic" x="4" y="3" width="16" height="18" rx="2.5"/><path class="ef-ic" d="M7.5 10.5q1.5-3.2 3 0t3 0t3 0M8 16.5h8"/>',
  home: '<path class="ef-ic" d="M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M13 11l-2.4 3.6h2.8L11 18.2"/>',
  battery: '<rect class="ef-ic" x="6" y="4" width="12" height="17" rx="2.5"/><path class="ef-ic" d="M10 2.2h4M9 17.5h6M9 14.5h6M9 11.5h6"/>',
  grid: '<path class="ef-ic" d="M7.5 21 12 3l4.5 18M5 8h14M6.3 13h11.4M8.8 17.5l6.4-4.5M15.2 17.5l-6.4-4.5"/>',
};
type IconKey = keyof typeof ICONS;
interface Palette { fill: string; ring: string; icon: string }
const PALETTE: Record<'sun' | 'battery' | 'grid' | 'muted', Palette> = {
  sun: { fill: '#fff4e8', ring: '#ffd2a6', icon: '#e86a00' },
  battery: { fill: '#effaf2', ring: '#bfe8cb', icon: '#15803d' },
  grid: { fill: '#eef7fd', ring: '#bfe1f6', icon: '#0369a1' },
  muted: { fill: '#f1f5f9', ring: '#d5dbe5', icon: '#94a3b8' },
};
const FLOW_HEX: Record<FlowColor, string> = { o: '#ff7a00', g: '#16a34a', b: '#0284c7' };

interface NodeInfo { key: 'sun' | 'battery' | 'grid' | 'house'; icon: IconKey; pal: Palette; value: string; label: string; muted: boolean }
const kw = (v: number) => (v > 0 ? `≈${v.toFixed(1)} kW` : '0 kW');

/** Text and look of each node in one mode; the drawing and the phone legend read the same facts. */
function describeNodes(s: ModeScenario): NodeInfo[] {
  const powered = s.houseKW > 0;
  const sunMuted = s.productionKW <= 0;
  const nodes: NodeInfo[] = [{
    key: 'sun', icon: s.night ? 'moon' : 'sun', pal: sunMuted ? PALETTE.muted : PALETTE.sun, muted: sunMuted, value: kw(s.productionKW),
    label: s.night ? 'Sin producción solar' : sunMuted ? 'Producción detenida' : 'Producción solar',
  }];
  if (s.batteryState) {
    nodes.push({
      key: 'battery', icon: 'battery', pal: PALETTE.battery, muted: s.batteryState === 'idle', value: s.batteryState === 'full' ? 'Llena' : kw(s.batteryKW),
      label: `Batería · ${s.batteryState === 'charging' ? 'cargando' : s.batteryState === 'discharging' ? 'descargando' : 'en reposo'}`,
    });
  }
  const gridLabel = s.gridState === 'export' ? 'Excedente a la red'
    : s.gridState === 'import' ? (s.productionKW > 0 || s.batteryKW > 0 ? 'Complemento de red' : 'Consumo desde la red')
      : s.gridState === 'disconnected' ? 'Desconectada' : 'Sin intercambio';
  nodes.push({
    key: 'grid', icon: 'grid', pal: s.gridState === 'disconnected' ? PALETTE.muted : PALETTE.grid, muted: s.gridState === 'disconnected' || s.gridState === 'idle',
    value: s.gridState === 'disconnected' ? 'Sin red' : kw(s.gridKW), label: gridLabel,
  });
  nodes.push({
    key: 'house', icon: 'home', pal: powered ? PALETTE.sun : PALETTE.muted, muted: !powered,
    value: powered ? kw(s.houseKW) : 'Sin energía', label: powered ? 'Consumo de la casa' : 'Sin suministro',
  });
  return nodes;
}

interface Layout { invX: number; jx: number }
const GRID_X = 490;
const GRID_END = 452;
const BATTERY_X = 70;

function lineEl(d: string, line: FlowLine): string {
  if (!line.active) return `<path class="ef-idle" d="${d}"/>`;
  return `<path class="ef-track" d="${d}"/><path class="ef-flow ef-${line.color}${line.thin ? ' ef-thin' : ''} ef-${line.speed}" d="${d}"/>`;
}

function node(cx: number, cy: number, pal: Palette, icon: IconKey, extra = ''): string {
  return `<circle class="ef-node" cx="${cx}" cy="${cy}" r="38" fill="${pal.fill}" stroke="${pal.ring}"/>
      <svg x="${cx - 18}" y="${cy - 18}" width="36" height="36" viewBox="0 0 24 24" style="color:${pal.icon}">${ICONS[icon]}${extra}</svg>`;
}

function modeSvg(s: ModeScenario, hybrid: boolean, compact: boolean, ariaLabel: string): string {
  const { invX, jx }: Layout = hybrid ? { invX: 220, jx: 370 } : { invX: 170, jx: 340 };
  const info = Object.fromEntries(describeNodes(s).map((n) => [n.key, n])) as Record<NodeInfo['key'], NodeInfo>;
  const { lines } = s;
  const text = (n: NodeInfo, x: number, yValue: number, yLabel: number, anchor: string) => compact ? '' : `
      <text class="${n.muted ? 'ef-vm' : 'ef-v'}" x="${x}" y="${yValue}"${anchor}>${n.value}</text>
      <text class="ef-l" x="${x}" y="${yLabel}"${anchor}>${n.label}</text>`;
  const mid = (jx + GRID_END) / 2;
  const first = [lines.house, lines.inverter, lines.grid].find((l) => l.active);
  const sunNode = node(invX, 70, info.sun.pal, info.sun.icon);
  const stars = s.night
    ? `<circle class="ef-tw" cx="${invX + 44}" cy="36" r="1.8" fill="#94a3b8"/><circle class="ef-tw ef-tw2" cx="${invX - 48}" cy="40" r="1.5" fill="#94a3b8"/><circle class="ef-tw ef-tw3" cx="${invX - 40}" cy="108" r="1.6" fill="#94a3b8"/>`
    : '';
  const dim = s.inverterState !== 'on';
  const cap = s.inverterState === 'on' ? 'INVERSOR' : s.inverterState === 'standby' ? 'INVERSOR · REPOSO' : 'INVERSOR · APAGADO';
  const batteryPart = hybrid && s.batteryState && lines.battery ? `
      ${lineEl(lines.battery.reverse ? `M${BATTERY_X + 38} 200H${invX - 38}` : `M${invX - 38} 200H${BATTERY_X + 38}`, lines.battery)}
      ${node(BATTERY_X, 200, info.battery.pal, 'battery')}${text(info.battery, BATTERY_X, 268, 288, ' text-anchor="middle"')}` : '';
  const badge = s.gridState === 'disconnected'
    ? `<circle cx="${mid}" cy="200" r="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/><path d="M${mid - 5} 195l10 10M${mid + 5} 195l-10 10" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>`
    : '';
  const gridPath = lines.grid.active && lines.grid.reverse ? `M${GRID_END} 200H${jx}` : `M${jx} 200H${GRID_END}`;
  return `<svg data-energy-flow-svg="${compact ? 'compact' : 'full'}" viewBox="${compact ? (hybrid ? '24 24 512 352' : '104 24 432 352') : '0 0 560 380'}" class="${compact ? 'sm:hidden max-w-[420px]' : 'hidden sm:block max-w-[640px]'} mx-auto w-full h-auto" role="img" aria-label="${escapeHtml(ariaLabel)}">
      ${lineEl(`M${invX} 108V162`, lines.sun)}
      ${lineEl(`M${invX + 38} 200H${jx}`, lines.inverter)}
      ${lineEl(`M${jx} 200V292`, lines.house)}
      ${lineEl(gridPath, lines.grid)}
      ${first ? `<circle cx="${jx}" cy="200" r="5" fill="${FLOW_HEX[first.color]}"/>` : ''}
      ${badge}
      ${sunNode}${stars}${text(info.sun, invX + 54, 66, 86, '')}
      <rect class="ef-node" x="${invX - 36}" y="164" width="72" height="72" rx="18" fill="#f6f8fb" stroke="#d5dbe5"${dim ? ' opacity=".6"' : ''}/>
      <svg x="${invX - 18}" y="182" width="36" height="36" viewBox="0 0 24 24" style="color:${dim ? '#94a3b8' : '#334155'}">${ICONS.inverter}</svg>
      ${compact ? '' : `<text class="ef-cap" x="${invX}" y="260" text-anchor="middle">${cap}</text>`}${batteryPart}
      ${node(GRID_X, 200, info.grid.pal, 'grid')}${text(info.grid, GRID_X, 128, 148, ' text-anchor="middle"')}
      ${node(jx, 330, info.house.pal, 'home')}${text(info.house, jx + 54, 326, 346, '')}
    </svg>`;
}

const PILL_TONE: Record<PillTone, string> = { green: 'ef-tone-green', indigo: 'ef-tone-indigo', amber: 'ef-tone-amber' };

function pill(s: ModeScenario): string {
  const icon = s.pill.tone === 'indigo'
    ? `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${ICONS.moon}</svg>`
    : `<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle class="ef-dot" cx="4" cy="4" r="4" fill="currentColor"/></svg>`;
  return `<span class="ef-pill ${PILL_TONE[s.pill.tone]}">${icon}${s.pill.text}</span>`;
}

function legend(s: ModeScenario): string {
  return `<ul data-energy-flow-legend class="sm:hidden divide-y divide-slate-100">${describeNodes(s).map((n) => `
        <li class="flex items-center gap-3 py-2">
          <span class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border" style="background:${n.pal.fill};border-color:${n.pal.ring};color:${n.pal.icon}">
            <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n.icon]}</svg>
          </span>
          <span class="min-w-0 flex-1 text-xs font-semibold text-slate-700">${n.label}</span>
          <span class="text-base font-extrabold tabular-nums ${n.muted ? 'text-slate-500' : 'text-slate-900'}">${n.value}</span>
        </li>`).join('')}
      </ul>`;
}

// Without JavaScript the day panel simply stays visible; the script only swaps which panel is hidden.
const TOGGLE_SCRIPT = `(function () {
      var root = document.querySelector('[data-energy-flow]');
      if (!root) return;
      var buttons = root.querySelectorAll('[data-energy-mode-button]');
      var panels = root.querySelectorAll('[data-energy-mode-panel]');
      function select(mode) {
        for (var i = 0; i < panels.length; i++) panels[i].hidden = panels[i].getAttribute('data-energy-mode-panel') !== mode;
        for (var j = 0; j < buttons.length; j++) buttons[j].setAttribute('aria-pressed', buttons[j].getAttribute('data-energy-mode-button') === mode ? 'true' : 'false');
      }
      for (var k = 0; k < buttons.length; k++) buttons[k].addEventListener('click', function (e) { select(e.currentTarget.getAttribute('data-energy-mode-button')); });
    })();`;

/** Animated energy-flow diagram with one panel per situation (day, night, outage), above section 1. */
export function renderEnergyFlowSection(input: EnergyFlowScenarioInput): string {
  const { hybrid, isZeroExport } = input;
  const scenarios = energyFlowScenarios(input);
  const system = hybrid ? 'Sistema híbrido' : (isZeroExport ? 'Sistema de autoconsumo' : 'Sistema de inyección');
  const subtitle = hybrid ? 'con batería' : (isZeroExport ? 'inyección cero' : 'on-grid');

  const buttons = scenarios.map((s, i) => `<button type="button" data-energy-mode-button="${s.mode}" aria-pressed="${i === 0}" class="ef-btn px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap text-slate-600 hover:text-slate-900 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1">${s.label}</button>`).join('\n          ');
  const panels = scenarios.map((s, i) => {
    // The text legend is phone-only, so the accessible name also lists every node and its value.
    const aria = `${system}, ${s.title.toLowerCase()}: ${s.description} ${describeNodes(s).map((n) => `${n.label} ${n.value}`).join('; ')}.`;
    return `<div data-energy-mode-panel="${s.mode}" class="ef-panel space-y-3"${i === 0 ? '' : ' hidden'}>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0 flex-1 basis-60 space-y-1">
          <h3 class="text-sm sm:text-base font-extrabold text-slate-900">${s.title}</h3>
          <p class="text-xs sm:text-sm text-slate-600 leading-relaxed">${s.description}</p>
        </div>
        ${pill(s)}
      </div>
      ${modeSvg(s, hybrid, false, aria)}
      ${modeSvg(s, hybrid, true, aria)}
      ${legend(s)}
      ${s.note ? `<p class="text-[11px] sm:text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">${s.note}</p>` : ''}
    </div>`;
  }).join('\n    ');

  return `<section data-energy-flow="${hybrid ? 'hybrid' : 'on-grid'}" class="ef-section bg-white border border-sky-100 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-xs sm:shadow-sm space-y-3 sm:space-y-4">
      <div class="space-y-1">
        <div class="text-[10.5px] sm:text-[11px] font-black uppercase text-sky-700 tracking-wider flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Flujo energético estimado
        </div>
        <h2 class="text-base sm:text-xl font-extrabold text-slate-900 tracking-tight">¿Cómo se comporta su sistema en cada situación?</h2>
        <p class="text-[11px] sm:text-xs text-slate-500">Guía visual aproximada: elija una situación para ver hacia dónde fluye la energía. Los valores en kW son referenciales, no mediciones.</p>
      </div>
      <div class="text-xs sm:text-sm font-bold text-slate-900">${system} <span class="font-medium text-slate-500">· ${subtitle}</span></div>
      <div class="no-print flex flex-wrap gap-1 p-1 rounded-3xl sm:rounded-full bg-slate-100 w-fit max-w-full" role="group" aria-label="Situación a mostrar">
          ${buttons}
      </div>
      ${panels}
      <script>${TOGGLE_SCRIPT}</script>
    </section>`;
}

/** Shared stylesheet for the diagram; animation is CSS-only and stops under reduced motion. */
export const ENERGY_FLOW_CSS = `
    .ef-ic { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    .ef-track { fill: none; stroke: #e5e9f0; stroke-width: 4; stroke-linecap: round; }
    .ef-idle { fill: none; stroke: #d5dbe5; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1 9; }
    .ef-flow { fill: none; stroke-linecap: round; stroke-width: 6; stroke-dasharray: 0 14; animation: ef-flow 1s linear infinite; }
    .ef-o { stroke: #ff7a00; } .ef-g { stroke: #16a34a; } .ef-b { stroke: #0284c7; }
    .ef-thin { stroke-width: 4; }
    .ef-s1 { animation-duration: .55s; } .ef-s2 { animation-duration: .8s; } .ef-s3 { animation-duration: 1.7s; }
    @keyframes ef-flow { to { stroke-dashoffset: -14; } }
    .ef-node { stroke-width: 1.5; }
    .ef-v { font-size: 20px; font-weight: 700; fill: #0f172a; font-variant-numeric: tabular-nums; }
    .ef-vm { font-size: 20px; font-weight: 700; fill: #64748b; font-variant-numeric: tabular-nums; }
    .ef-l { font-size: 12.5px; font-weight: 500; fill: #5b6576; }
    .ef-cap { font-size: 11px; font-weight: 600; fill: #5b6576; letter-spacing: .06em; }
    .ef-tw { animation: ef-twinkle 2.8s ease-in-out infinite; }
    .ef-tw2 { animation-delay: -1s; } .ef-tw3 { animation-delay: -1.9s; }
    @keyframes ef-twinkle { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
    .ef-dot { animation: ef-pulse 2s ease-in-out infinite; }
    @keyframes ef-pulse { 50% { opacity: .35; } }
    .ef-pill { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 6px 12px; }
    .ef-tone-green { color: #15803d; background: #f0fdf4; }
    .ef-tone-indigo { color: #4338ca; background: #eef2ff; }
    .ef-tone-amber { color: #b45309; background: #fffbeb; }
    .ef-btn[aria-pressed="true"] { background: #fff; color: #c2410c; box-shadow: 0 1px 2px rgba(15, 23, 42, .12); }
    .ef-panel { animation: ef-fade .25s ease-out; }
    @keyframes ef-fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .ef-flow, .ef-dot, .ef-tw, .ef-panel { animation: none; } }
    @media print {
      .ef-section [data-energy-mode-panel] { display: none !important; }
      .ef-section [data-energy-mode-panel="day"] { display: block !important; }
    }`;
