/**
 * Tema claro/oscuro de la propuesta web.
 *
 * Todos los colores del visor salen de variables CSS con un valor claro y uno oscuro:
 * - La paleta de Tailwind que usa la plantilla (slate, sky, orange…) se reasigna a variables
 *   (`rgb(var(--tw-sky-700) / <alpha-value>)`), así que cualquier clase existente o nueva
 *   (`text-sky-700`, `bg-orange-50/70`) sigue el tema sin `dark:` por elemento.
 * - Roles propios (`page`, `surface`, `zebra`, `head`…), gráficos (`--chart-*`) y el diagrama
 *   de flujo energético (`--ef-*`).
 *
 * Señales para que los navegadores respeten este tema en lugar de oscurecer a la fuerza:
 * `<meta name="color-scheme" content="light dark">` + `color-scheme` en `:root` (Chromium Auto Dark
 * Theme y Samsung Internet no fuerzan cuando el esquema usado es oscuro), `color-scheme: only light`
 * cuando el lector elige claro a mano (exclusión documentada de Auto Dark Theme) y
 * `<meta name="darkreader-lock">` (Dark Reader se desactiva). La impresión siempre sale en claro.
 */

type Hex = string;
type Pair = readonly [light: Hex, dark: Hex];

/** Paleta de Tailwind v3: el valor claro es el oficial; el oscuro está ajustado al uso en la plantilla. */
// 50–300: fondos tenues y bordes → superficies oscuras teñidas. 400–600: rellenos y acentos.
// 700–950: texto → tonos claros. En orange/red/rose el 600 es texto; en sky/emerald/blue, relleno.
export const PALETTE_TOKENS: Record<string, Record<string, Pair>> = {
  slate: {
    50: ['#f8fafc', '#151f30'], 100: ['#f1f5f9', '#1b2638'], 200: ['#e2e8f0', '#2a3850'], 300: ['#cbd5e1', '#3b4a63'],
    400: ['#94a3b8', '#8494ab'], 500: ['#64748b', '#98a6ba'], 600: ['#475569', '#b1bccb'], 700: ['#334155', '#c8d1dd'],
    800: ['#1e293b', '#dce3ec'], 900: ['#0f172a', '#eef2f7'], 950: ['#020617', '#f8fafc'],
  },
  sky: {
    50: ['#f0f9ff', '#0d2338'], 100: ['#e0f2fe', '#133049'], 200: ['#bae6fd', '#1d4466'], 300: ['#7dd3fc', '#2f6994'],
    400: ['#38bdf8', '#4cc2f7'], 500: ['#0ea5e9', '#1fa8e6'], 600: ['#0284c7', '#0b84c6'], 700: ['#0369a1', '#7fd0fb'],
    800: ['#075985', '#a6defc'], 900: ['#0c4a6e', '#c8eafd'], 950: ['#082f49', '#e3f4fe'],
  },
  orange: {
    50: ['#fff7ed', '#2b1709'], 100: ['#ffedd5', '#3d200b'], 200: ['#fed7aa', '#5e3414'], 300: ['#fdba74', '#85491a'],
    400: ['#fb923c', '#ffb36b'], 500: ['#f97316', '#f97316'], 600: ['#ea580c', '#ff9a4d'], 700: ['#c2410c', '#ffb877'],
    800: ['#9a3412', '#ffd0a3'], 900: ['#7c2d12', '#ffe1c4'], 950: ['#431407', '#fff0e1'],
  },
  amber: {
    50: ['#fffbeb', '#2b2108'], 100: ['#fef3c7', '#3d2e0b'], 200: ['#fde68a', '#5c4512'], 300: ['#fcd34d', '#7d5f19'],
    400: ['#fbbf24', '#fbbf24'], 500: ['#f59e0b', '#f59e0b'], 600: ['#d97706', '#e8a317'], 700: ['#b45309', '#fcd34d'],
    800: ['#92400e', '#fde68a'], 900: ['#78350f', '#fef3c7'], 950: ['#451a03', '#fffbeb'],
  },
  emerald: {
    50: ['#ecfdf5', '#0a2a20'], 100: ['#d1fae5', '#0f3a2c'], 200: ['#a7f3d0', '#165340'], 300: ['#6ee7b7', '#6ee7b7'],
    400: ['#34d399', '#34d399'], 500: ['#10b981', '#10b981'], 600: ['#059669', '#059669'], 700: ['#047857', '#6ee7b7'],
    800: ['#065f46', '#7be8bf'], 900: ['#064e3b', '#a7f3d0'], 950: ['#022c22', '#d1fae5'],
  },
  red: {
    50: ['#fef2f2', '#2e1215'], 100: ['#fee2e2', '#4a1c21'], 200: ['#fecaca', '#6b262d'], 300: ['#fca5a5', '#8f3239'],
    400: ['#f87171', '#f87171'], 500: ['#ef4444', '#ef4444'], 600: ['#dc2626', '#ff8a8a'], 700: ['#b91c1c', '#ffb0b0'],
    800: ['#991b1b', '#fecaca'], 900: ['#7f1d1d', '#fee2e2'], 950: ['#450a0a', '#fef2f2'],
  },
  rose: {
    50: ['#fff1f2', '#2e1219'], 100: ['#ffe4e6', '#48192a'], 200: ['#fecdd3', '#6a2338'], 300: ['#fda4af', '#8e2e4a'],
    400: ['#fb7185', '#fb7185'], 500: ['#f43f5e', '#f43f5e'], 600: ['#e11d48', '#ff8fa3'], 700: ['#be123c', '#ffb1c0'],
    800: ['#9f1239', '#fecdd3'], 900: ['#881337', '#ffe4e6'], 950: ['#4c0519', '#fff1f2'],
  },
  blue: {
    50: ['#eff6ff', '#0f1d3a'], 100: ['#dbeafe', '#152a52'], 200: ['#bfdbfe', '#1e3a70'], 300: ['#93c5fd', '#2b4f94'],
    400: ['#60a5fa', '#60a5fa'], 500: ['#3b82f6', '#3b82f6'], 600: ['#2563eb', '#4f8bf7'], 700: ['#1d4ed8', '#93c5fd'],
    800: ['#1e40af', '#a9cdfd'], 900: ['#1e3a8a', '#cfe2fe'], 950: ['#172554', '#e6f0ff'],
  },
};

/** Roles propios del visor; también clases de Tailwind (`bg-page`, `bg-surface`, `bg-head`, `text-on-head`…). */
export const ROLE_TOKENS: Record<string, Pair> = {
  page: ['#f0f7fc', '#0b1220'],
  surface: ['#ffffff', '#111a2a'],
  // Celda fija de las filas alternas: el mismo tono que `bg-sky-50/30` sobre `surface`, pero opaco.
  zebra: ['#f5faff', '#101d2e'],
  head: ['#0f172a', '#26324a'],
  'on-head': ['#ffffff', '#f1f5f9'],
  tile: ['#1e293b', '#2a3850'],
};

/** Variables sueltas (no son clases de Tailwind): barras de desplazamiento, logotipo, gráficos y diagrama. */
export const VARIABLE_TOKENS: Record<string, Pair> = {
  'scroll-track': ['#f1f5f9', '#162033'],
  'scroll-thumb': ['#cbd5e1', '#33435b'],
  'scroll-thumb-hover': ['#94a3b8', '#4b5d78'],
  // Los logotipos web se preparan sobre blanco: en oscuro van sobre una placa clara, nunca invertidos.
  'logo-plate': ['#ffffff', '#ffffff'],
  'chart-consumption': ['#0284c7', '#2ea3e3'],
  'chart-production': ['#ff7a00', '#ff8a1f'],
  'chart-self': ['#2563eb', '#8fb0ff'],
  'chart-positive': ['#0284c7', '#2ea3e3'],
  'chart-negative': ['#ef4444', '#f87171'],
  'chart-tick': ['#64748b', '#a3b0c2'],
  'chart-grid': ['#e0f2fe', '#1f3149'],
  'chart-tooltip': ['#0f172a', '#26324a'],
  'chart-bg': ['#f8fbfe', '#0f1c2e'],
  // Diagrama de flujo energético (energyFlow.ts): nodos, líneas, textos y píldoras.
  'ef-sun-fill': ['#fff4e8', '#3a2410'], 'ef-sun-ring': ['#ffd2a6', '#8a4b12'], 'ef-sun-icon': ['#e86a00', '#ffa552'],
  'ef-battery-fill': ['#effaf2', '#0f2e1d'], 'ef-battery-ring': ['#bfe8cb', '#23633f'], 'ef-battery-icon': ['#15803d', '#4ade80'],
  'ef-grid-fill': ['#eef7fd', '#0c2638'], 'ef-grid-ring': ['#bfe1f6', '#1f5679'], 'ef-grid-icon': ['#0369a1', '#5ec4f5'],
  'ef-muted-fill': ['#f1f5f9', '#1c2636'], 'ef-muted-ring': ['#d5dbe5', '#3a4a61'], 'ef-muted-icon': ['#94a3b8', '#8594aa'],
  'ef-flow-o': ['#ff7a00', '#ff8a1f'], 'ef-flow-g': ['#16a34a', '#22c55e'], 'ef-flow-b': ['#0284c7', '#38b6f2'],
  'ef-track': ['#e5e9f0', '#243146'], 'ef-idle': ['#d5dbe5', '#3a4a61'],
  'ef-inverter-fill': ['#f6f8fb', '#18233a'], 'ef-inverter-ring': ['#d5dbe5', '#3a4a61'],
  'ef-inverter-icon': ['#334155', '#d3dbe6'], 'ef-inverter-icon-off': ['#94a3b8', '#8594aa'],
  'ef-star': ['#94a3b8', '#a3b0c2'],
  'ef-badge-fill': ['#ffffff', '#111a2a'], 'ef-badge-ring': ['#cbd5e1', '#4b5d78'], 'ef-badge-mark': ['#94a3b8', '#a3b0c2'],
  'ef-value': ['#0f172a', '#f1f5f9'], 'ef-value-muted': ['#64748b', '#a3b0c2'], 'ef-label': ['#5b6576', '#b1bccb'],
  'ef-pill-green': ['#15803d', '#86efac'], 'ef-pill-green-bg': ['#f0fdf4', '#0f2e1d'],
  'ef-pill-indigo': ['#4338ca', '#c7d2fe'], 'ef-pill-indigo-bg': ['#eef2ff', '#22244a'],
  'ef-pill-amber': ['#b45309', '#fcd34d'], 'ef-pill-amber-bg': ['#fffbeb', '#33260a'],
  'ef-btn-on': ['#ffffff', '#2a3850'], 'ef-btn-on-text': ['#c2410c', '#ffb877'],
  'ef-pos': ['#cbd5e1', '#3b4a63'], 'ef-pos-on': ['#f97316', '#ff9a4d'],
};

/** Clave de localStorage del conmutador manual ('light' | 'dark'; ausente = automático). */
export const THEME_STORAGE_KEY = 'solarsim-proposal-theme';

const rgbTriple = (hex: Hex): string => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

function declarations(mode: 0 | 1): string {
  const out: string[] = [];
  for (const [hue, shades] of Object.entries(PALETTE_TOKENS)) {
    for (const [shade, pair] of Object.entries(shades)) out.push(`--tw-${hue}-${shade}: ${rgbTriple(pair[mode])};`);
  }
  for (const [name, pair] of Object.entries(ROLE_TOKENS)) out.push(`--c-${name}: ${rgbTriple(pair[mode])};`);
  for (const [name, pair] of Object.entries(VARIABLE_TOKENS)) out.push(`--${name}: ${pair[mode]};`);
  return out.join(' ');
}

/**
 * Variables de ambos temas, selección automática/manual y salida impresa en claro.
 * Mientras se muestra el tema claro, `only light` impide que el oscurecido forzado de Chromium
 * (que puede informar `prefers-color-scheme: light`) destroce la página; con preferencia oscura
 * o elección manual, el esquema usado es `dark` y se ve el tema oscuro propio.
 */
export const THEME_CSS = `
    :root { color-scheme: only light; ${declarations(0)} }
    :root[data-theme="light"] { color-scheme: only light; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme: dark; ${declarations(1)} } }
    :root[data-theme="dark"] { color-scheme: dark; ${declarations(1)} }
    :root[data-print], :root[data-print][data-theme] { color-scheme: only light; ${declarations(0)} }
    @media print { :root, :root[data-theme] { color-scheme: only light; ${declarations(0)} } }
    html, body { background-color: rgb(var(--c-page)); }
    .pv-logo-plate { display: inline-flex; align-items: center; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .pv-logo-plate { background: var(--logo-plate); padding: 6px 12px; border-radius: 14px; } }
    :root[data-theme="dark"] .pv-logo-plate { background: var(--logo-plate); padding: 6px 12px; border-radius: 14px; }
    @media print { .pv-logo-plate { background: none !important; padding: 0 !important; } }
    .pv-theme-btn [data-theme-icon] { display: none; }
    :root:not([data-theme]) .pv-theme-btn [data-theme-icon="auto"],
    :root[data-theme="light"] .pv-theme-btn [data-theme-icon="light"],
    :root[data-theme="dark"] .pv-theme-btn [data-theme-icon="dark"] { display: block; }`;

const colorRef = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

/** `tailwind.config` para el CDN: la paleta usada y los roles propios apuntan a las variables. */
export function tailwindThemeConfig(): string {
  const colors: Record<string, string | Record<string, string>> = {};
  for (const [hue, shades] of Object.entries(PALETTE_TOKENS)) {
    colors[hue] = Object.fromEntries(Object.keys(shades).map((shade) => [shade, colorRef(`--tw-${hue}-${shade}`)]));
  }
  for (const name of Object.keys(ROLE_TOKENS)) colors[name] = colorRef(`--c-${name}`);
  return `tailwind.config = { theme: { extend: { colors: ${JSON.stringify(colors)} } } };`;
}

/** Se ejecuta en <head> antes de pintar: aplica la elección guardada sin destello de tema equivocado. */
export const THEME_INIT_SCRIPT = `(function () {
      try {
        var t = window.localStorage.getItem('${THEME_STORAGE_KEY}');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();`;

/** Metadatos y elección guardada para cualquier página del visor (antes del CDN de Tailwind). */
export function themeHead(): string {
  return `<meta name="color-scheme" content="light dark">
  <meta name="darkreader-lock">
  <meta name="theme-color" media="(prefers-color-scheme: light)" content="${ROLE_TOKENS.page[0]}">
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${ROLE_TOKENS.page[1]}">
  <script>${THEME_INIT_SCRIPT}</script>`;
}

/** Hoja de variables; va en <head>, así que se aplica antes de pintar el cuerpo. */
export function themeStyle(): string {
  return `<style data-theme-tokens>${THEME_CSS}
  </style>`;
}

const ICON = 'class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"';

/** Botón discreto: automático → claro → oscuro → automático. Sin JavaScript queda oculto. */
export const THEME_TOGGLE_BUTTON = `<button type="button" data-theme-toggle hidden class="pv-theme-btn no-print p-2 rounded-xl border border-sky-200 bg-sky-50/60 hover:bg-sky-100 text-sky-700 transition-all shadow-xs shrink-0 cursor-pointer" title="Tema: automático" aria-label="Tema: automático">
            <svg data-theme-icon="auto" ${ICON}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/></svg>
            <svg data-theme-icon="light" ${ICON}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            <svg data-theme-icon="dark" ${ICON}><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/></svg>
          </button>`;

/** Cicla el tema, lo guarda (si se puede) y avisa a los gráficos con el evento `pv-themechange`. */
export const THEME_TOGGLE_SCRIPT = `(function () {
      var btn = document.querySelector('[data-theme-toggle]');
      if (!btn) return;
      var root = document.documentElement;
      var names = { auto: 'automático (según el dispositivo)', light: 'claro', dark: 'oscuro' };
      var order = ['auto', 'light', 'dark'];
      function current() { return root.getAttribute('data-theme') || 'auto'; }
      function label() {
        var now = current();
        var next = order[(order.indexOf(now) + 1) % order.length];
        var text = 'Tema: ' + names[now] + '. Cambiar a ' + names[next].split(' (')[0];
        btn.setAttribute('aria-label', text);
        btn.setAttribute('title', text);
      }
      btn.addEventListener('click', function () {
        var next = order[(order.indexOf(current()) + 1) % order.length];
        if (next === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', next);
        try {
          if (next === 'auto') window.localStorage.removeItem('${THEME_STORAGE_KEY}');
          else window.localStorage.setItem('${THEME_STORAGE_KEY}', next);
        } catch (e) {}
        label();
        document.dispatchEvent(new Event('pv-themechange'));
      });
      label();
      btn.hidden = false;
    })();`;
