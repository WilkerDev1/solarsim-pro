import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ChipGroup, EnergyLegend, Field, FieldAction, InfoTip, ItemCard, ParamRow, ParamSection, SelectField, SquareSwitch,
  StackedField, StatStrip, Stepper, SubHeader, SubHeaderIconButton, SubHeaderTextButton, ToggleGroup, WarnChip,
} from '../components/simulator/params/ui';

import { commitStepperDraft } from '../components/simulator/params/ui/Stepper';
import { nextRadioIndex } from '../components/simulator/params/ui/ToggleGroup';

const h = React.createElement;
const noop = () => {};
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

// --- Tokens: every --pd-* variable exists for light and dark and is registered in Tailwind ---
{
  const css = readFileSync('src/index.css', 'utf8');
  const light = css.match(/:root\s*\{([^}]*--pd-[^}]*)\}/)?.[1] ?? '';
  const dark = css.match(/\.dark\s*\{([^}]*--pd-[^}]*)\}/)?.[1] ?? '';
  const names = (block: string) => [...block.matchAll(/(--pd-[a-z-]+)\s*:/g)].map(m => m[1]).sort();
  assert.ok(names(light).length >= 20, 'tokens claros definidos');
  assert.deepEqual(names(dark), names(light), 'cada token claro tiene su par oscuro');
  assert.match(light, /--pd-accent:\s*#047857/);
  assert.match(light, /--pd-on-accent:\s*#ffffff/);
  assert.match(dark, /--pd-accent:\s*#10b981/);
  assert.match(dark, /--pd-on-accent:\s*#052e1c/);
  assert.match(dark, /--pd-panel:\s*#18181b/);
  const config = readFileSync('tailwind.config.js', 'utf8');
  for (const name of names(light)) {
    assert.ok(config.includes(`var(${name})`), `${name} registrado en tailwind.config.js`);
  }
}

// --- SelectField: la animación del panel no usa opacity (si no corre, el panel debe seguir visible) ---
{
  const css = readFileSync('src/index.css', 'utf8');
  const keyframes = css.match(/@keyframes pd-select-in\s*\{([\s\S]*?\n\})/)?.[1] ?? '';
  assert.ok(keyframes.includes('transform'), 'keyframes pd-select-in definidos');
  assert.doesNotMatch(keyframes, /opacity/, 'pd-select-in no toca opacity');
}

// --- ParamSection: header button with aria-expanded / aria-controls, collapsible body, optional badge ---
{
  const open = render(h(ParamSection, { id: 'cli', title: 'Proyecto y cliente', icon: h('svg', { 'data-icon': 'user' }), open: true, onToggle: noop }, h('p', null, 'cuerpo')));
  assert.match(open, /<button[^>]*aria-expanded="true"[^>]*aria-controls="cli-body"/);
  assert.match(open, /id="cli-body"/);
  assert.match(open, /Proyecto y cliente/);
  assert.match(open, /cuerpo/);
  assert.match(open, /h-12/, 'encabezado de 48 px');
  assert.match(open, /h-7 w-7/, 'cuadro de ícono de 28 px');
  assert.match(open, /dark:border-pd-icon-tile-border/);
  assert.doesNotMatch(open.match(/<h2.*<\/h2>/)![0], /<p[ >]/, 'sin subtítulo en el encabezado');
  const closed = render(h(ParamSection, { id: 'cli', title: 'Proyecto y cliente', icon: null, open: false, onToggle: noop }, h('p', null, 'cuerpo')));
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /id="cli-body"[^>]*hidden/, 'cuerpo oculto con hidden pero presente para aria-controls');
  assert.doesNotMatch(open, /aria-label="[^"]*elementos"/, 'sin badge por defecto');
  const badged = render(h(ParamSection, { id: 'fin', title: 'Finanzas', icon: null, open: true, onToggle: noop, badge: '3 · 1', badgeLabel: '3 ítems y 1 descuento' }, null));
  assert.match(badged, /aria-label="3 ítems y 1 descuento"/);
  assert.match(badged, />3 · 1</);
}

// --- ParamRow / StackedField: label bound with htmlFor, 172px control column ---
{
  const row = render(h(ParamRow, { label: 'Precio kWh', htmlFor: 'kwh' }, h('input', { id: 'kwh' })));
  assert.match(row, /<label[^>]*for="kwh"[^>]*>Precio kWh<\/label>/);
  assert.match(row, /172px/);
  assert.match(row, /text-pd-muted/);
  const groupRow = render(h(ParamRow, { label: 'Inyección cero', labelId: 'iz' }, h('div', null)));
  assert.match(groupRow, /<span[^>]*id="iz"[^>]*>Inyección cero<\/span>/, 'sin htmlFor la etiqueta es un span referenciable');
  const stacked = render(h(StackedField, { label: 'Dirección', htmlFor: 'dir' }, h('input', { id: 'dir' })));
  assert.match(stacked, /<label[^>]*for="dir"[^>]*>Dirección<\/label>/);
  assert.match(stacked, /mb-1\.5/);
}

// --- Field: affixes, locked (dashed), disabled readable text, right slot ---
{
  const plain = render(h(Field, { id: 'a', value: '25', onChange: noop, suffix: '%' }));
  assert.match(plain, /<input[^>]*id="a"[^>]*value="25"/);
  assert.match(plain, />%</);
  assert.match(plain, /bg-pd-field/);
  assert.match(plain, /border-pd-field-border/);
  assert.match(plain, /h-8/);
  assert.doesNotMatch(plain, /border-dashed/);
  const prefixed = render(h(Field, { id: 'b', value: '0.220', onChange: noop, prefix: '$', mono: true }));
  assert.match(prefixed, />\$</);
  assert.match(prefixed, /font-mono/);
  const locked = render(h(Field, { id: 'c', value: 'SP-2026-143', onChange: noop, locked: true, mono: true }));
  assert.match(locked, /border-dashed/);
  assert.match(locked, /bg-pd-field-ro/);
  assert.match(locked, /<input[^>]*\sdisabled=""/);
  assert.match(locked, /disabled:\[-webkit-text-fill-color:var\(--pd-strong\)\]/, 'texto deshabilitado legible');
  const disabled = render(h(Field, { id: 'd', value: '0', onChange: noop, disabled: true }));
  assert.match(disabled, /<input[^>]*\sdisabled=""/);
  assert.doesNotMatch(disabled, /border-dashed/);
  const slot = render(h(Field, { id: 'e', value: '0.220', onChange: noop, right: h(WarnChip, { title: 'Aplicar tarifa oficial $0.217', onClick: noop }, '0.217') }));
  assert.match(slot, /<button[^>]*title="Aplicar tarifa oficial \$0.217"[^>]*>0.217<\/button>/);
  assert.match(slot, /bg-pd-warn-bg/);
  assert.match(slot, /text-pd-warn-text/);
  assert.match(slot, /<input[^>]*min-w-\[7ch\]/, 'con un chip a la derecha el número conserva su ancho');
  assert.doesNotMatch(prefixed, /min-w-\[7ch\]/, 'sin ranura derecha el campo no reserva ancho');
  assert.match(readFileSync('src/components/simulator/params/ui/Field.tsx', 'utf8'), /value=\{draft \?\? value\}/, 'al escribir se muestra el borrador, no el valor normalizado (vacío → 0)');
  const action = render(h(Field, { id: 'f', value: '22/10/2026', onChange: noop, right: h(FieldAction, { onClick: noop }, 'Hoy') }));
  assert.match(action, /text-pd-accent/);
  assert.match(action, />Hoy</);
}

// --- SelectField: listbox propio (combobox select-only), flecha dentro del botón, insignia ---
{
  const html = render(h(SelectField, {
    id: 'prov', value: 'sd', onChange: noop, badge: '5.28',
    options: [{ value: 'sd', label: 'Santo Domingo' }, { value: 'st', label: 'Santiago' }],
  }));
  assert.doesNotMatch(html, /<select|<option/, 'ya no es el select nativo');
  const trigger = html.match(/<button[^>]*>/)?.[0] ?? '';
  assert.match(trigger, /id="prov"/, 'el label externo apunta al disparador');
  assert.match(trigger, /type="button"/);
  assert.match(trigger, /role="combobox"/);
  assert.match(trigger, /aria-haspopup="listbox"/);
  assert.match(trigger, /aria-expanded="false"/);
  assert.match(html, /<button[^>]*>[\s\S]*Santo Domingo[\s\S]*5\.28[\s\S]*<svg[^>]*aria-hidden="true"[\s\S]*<\/button>/, 'texto, insignia y flecha dentro del botón');
  assert.doesNotMatch(html, /role="listbox"/, 'cerrado: sin panel');
  assert.match(html, /font-mono/);
  const labelled = render(h(SelectField, { value: 'a', onChange: noop, ariaLabel: 'Perfil de carga', options: [{ value: 'a', label: 'Residencial' }] }));
  assert.match(labelled, /aria-label="Perfil de carga"/);
  const off = render(h(SelectField, { value: 'a', onChange: noop, ariaLabel: 'x', disabled: true, options: [{ value: 'a', label: 'A' }] }));
  assert.match(off.match(/<button[^>]*>/)?.[0] ?? '', /\sdisabled=""/);
  const unknown = render(h(SelectField, { value: 'zz', onChange: noop, ariaLabel: 'x', options: [{ value: 'a', label: 'A' }] }));
  assert.match(unknown, /<button/, 'valor fuera de la lista no rompe el render');
  const hinted = render(h(SelectField, { value: 'a', onChange: noop, ariaLabel: 'x', defaultOpen: true, options: [{ value: 'a', label: 'A', hint: '5.1' }, { value: 'b', label: 'B', hint: '4.9' }] }));
  assert.match(hinted, /aria-expanded="true"/);
}

// --- ToggleGroup: radiogroup, exactly one radio checked, accent fill on the active one ---
{
  const html = render(h(ToggleGroup, {
    ariaLabel: 'Inyección cero', value: false, onChange: noop,
    options: [{ value: true, label: 'Sí' }, { value: false, label: 'No' }],
  }));
  assert.match(html, /role="radiogroup"[^>]*aria-label="Inyección cero"/);
  assert.equal((html.match(/role="radio"/g) ?? []).length, 2);
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1);
  assert.match(html, /aria-checked="true"[^>]*class="[^"]*bg-pd-accent[^"]*text-pd-on-accent[^"]*"[^>]*>No</);
  assert.match(html, /aria-checked="false"[^>]*class="[^"]*bg-pd-field[^"]*text-pd-muted[^"]*"[^>]*>Sí</);
  assert.match(html, /grid-cols-2/);
  const three = render(h(ToggleGroup, { ariaLabel: 'Perfil', value: 'b', onChange: noop, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] }));
  assert.match(three, /grid-cols-3/);
  const off = render(h(ToggleGroup, { ariaLabel: 'x', value: 'a', onChange: noop, disabled: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }));
  assert.equal((off.match(/disabled=""/g) ?? []).length, 2, 'todos los botones deshabilitados');
  assert.match(off, /disabled:opacity-50/);
}

// --- Teclado: borrador del Stepper y navegación por flechas del radiogroup ---
{
  assert.equal(commitStepperDraft('25', 10, 10, 50), 25);
  assert.equal(commitStepperDraft('', 12, 10, 50), 12, 'vacío vuelve al valor actual');
  assert.equal(commitStepperDraft('abc', 12, 10, 50), 12);
  assert.equal(commitStepperDraft('2', 12, 10, 50), 10, 'se limita solo al confirmar');
  assert.equal(commitStepperDraft('99', 12, 10, 50), 50);
  assert.equal(nextRadioIndex(0, 'ArrowRight', 3), 1);
  assert.equal(nextRadioIndex(2, 'ArrowDown', 3), 0, 'da la vuelta');
  assert.equal(nextRadioIndex(0, 'ArrowLeft', 3), 2);
  assert.equal(nextRadioIndex(1, 'Home', 3), 0);
  assert.equal(nextRadioIndex(1, 'End', 3), 2);
  assert.equal(nextRadioIndex(1, 'a', 3), null);
  const group = render(h(ToggleGroup, { ariaLabel: 'x', value: 'b', onChange: noop, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }));
  assert.match(group, /tabindex="-1"[^>]*>A</);
  assert.match(group, /tabindex="0"[^>]*>B</);
  const none = render(h(ToggleGroup, { ariaLabel: 'x', value: 'z', onChange: noop, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }));
  assert.match(none, /tabindex="0"[^>]*>A</, 'sin selección el primero es la parada de tabulador');
}

// --- SquareSwitch: role=switch, 34x20, 5px corners, 3px knob ---
{
  const on = render(h(SquareSwitch, { checked: true, onChange: noop, ariaLabel: 'Auto-calcular paneles' }));
  assert.match(on, /role="switch"/);
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /aria-label="Auto-calcular paneles"/);
  assert.match(on, /w-\[34px\]/);
  assert.match(on, /h-5/);
  assert.match(on, /rounded-\[5px\]/);
  assert.match(on, /rounded-\[3px\]/);
  assert.match(on, /bg-pd-accent/);
  assert.match(on, /justify-end/);
  assert.match(on, /bg-pd-on-accent/);
  assert.match(on, /dark:shadow-/);
  const off = render(h(SquareSwitch, { checked: false, onChange: noop, ariaLabel: 'x', disabled: true }));
  assert.match(off, /aria-checked="false"/);
  assert.match(off, /bg-pd-switch-off/);
  assert.match(off, /bg-pd-knob/);
  assert.doesNotMatch(off, /justify-end/);
  assert.match(off, /<button[^>]*\sdisabled=""/);
}

// --- Stepper: group + label, bounds disable the buttons, disabled disables everything ---
{
  const mid = render(h(Stepper, { value: 5, onChange: noop, ariaLabel: 'Cantidad de paneles', min: 1, max: 10 }));
  assert.match(mid, /role="group"[^>]*aria-label="Cantidad de paneles"/);
  assert.match(mid, /aria-label="Menos"/);
  assert.match(mid, /aria-label="Más"/);
  assert.match(mid, /<input[^>]*aria-label="Cantidad"[^>]*value="5"/);
  assert.match(mid, /font-mono/);
  assert.doesNotMatch(mid, /disabled=""/);
  const atMin = render(h(Stepper, { value: 1, onChange: noop, ariaLabel: 'c', min: 1, max: 10 }));
  assert.match(atMin, /aria-label="Menos"[^>]*\sdisabled=""/);
  assert.doesNotMatch(atMin, /aria-label="Más"[^>]*\sdisabled=""/);
  const atMax = render(h(Stepper, { value: 10, onChange: noop, ariaLabel: 'c', min: 1, max: 10 }));
  assert.match(atMax, /aria-label="Más"[^>]*\sdisabled=""/);
  const off = render(h(Stepper, { value: 14, onChange: noop, ariaLabel: 'c', disabled: true }));
  assert.equal((off.match(/disabled=""/g) ?? []).length, 3, 'menos, entrada y más deshabilitados');
  assert.match(off, /disabled:\[-webkit-text-fill-color:var\(--pd-text\)\]/);
}

// --- ChipGroup: buttons with aria-pressed, accent fill on the selected value ---
{
  const html = render(h(ChipGroup, {
    ariaLabel: 'Márgenes sugeridos', value: 25, onChange: noop,
    options: [10, 15, 20, 25, 30, 35].map(v => ({ value: v, label: String(v) })),
  }));
  assert.match(html, /role="group"[^>]*aria-label="Márgenes sugeridos"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 5);
  assert.match(html, /aria-pressed="true"[^>]*class="[^"]*bg-pd-accent[^"]*"[^>]*>25</);
  assert.match(html, /repeat\(6,/);
  const none = render(h(ChipGroup, { ariaLabel: 'x', value: 99, onChange: noop, options: [{ value: 1, label: '1' }] }));
  assert.doesNotMatch(none, /aria-pressed="true"/);
}

// --- SubHeader: uppercase 11px heading, accessible icon/text actions ---
{
  const html = render(h(SubHeader, { title: 'Paneles', action: h(SubHeaderIconButton, { label: 'Agregar modelo de panel', onClick: noop, icon: h('svg', null) }) }));
  assert.match(html, /<h3[^>]*>Paneles<\/h3>/);
  assert.match(html, /uppercase/);
  assert.match(html, /tracking-\[0\.08em\]/);
  assert.match(html, /text-\[11px\]/);
  assert.match(html, /<button[^>]*aria-label="Agregar modelo de panel"/);
  const text = render(h(SubHeader, { title: 'Identificadores', action: h(SubHeaderTextButton, { onClick: noop, pressed: true }, 'Bloqueado') }));
  assert.match(text, /aria-pressed="true"/);
  assert.match(text, />Bloqueado</);
  assert.match(text, /border-pd-outline/);
  const bare = render(h(SubHeader, { title: 'Batería (BESS)' }));
  assert.doesNotMatch(bare, /<button/);
}

// --- ItemCard: editable title, trash with aria-label, optional trailing, no header when bare ---
{
  const html = render(h(ItemCard, {
    title: 'Cierre especial', onTitleChange: noop, titleLabel: 'Motivo', onRemove: noop, removeLabel: 'Eliminar descuento',
    trailing: h('span', null, '−$250.00'),
  }, h('div', null, 'detalle')));
  assert.match(html, /<input[^>]*aria-label="Motivo"[^>]*value="Cierre especial"/);
  assert.match(html, /<button[^>]*aria-label="Eliminar descuento"/);
  assert.match(html, /text-pd-negative|hover:text-pd-negative/);
  assert.match(html, /−\$250\.00/);
  assert.match(html, /detalle/);
  assert.match(html, /bg-pd-item/);
  assert.match(html, /border-pd-border/);
  const readOnlyTitle = render(h(ItemCard, { title: 'Modelo 2', onRemove: noop, removeLabel: 'Eliminar modelo' }, null));
  assert.doesNotMatch(readOnlyTitle, /<input/);
  assert.match(readOnlyTitle, /Modelo 2/);
  const bare = render(h(ItemCard, null, h('div', null, 'solo cuerpo')));
  assert.doesNotMatch(bare, /<button|<input/);
  assert.match(bare, /solo cuerpo/);
}

// --- StatStrip: 2 or 3 mono values, accent tone only when asked ---
{
  const three = render(h(StatStrip, { items: [{ label: 'DC', value: '8.82 kWp' }, { label: 'AC', value: '8.0 kW' }, { label: 'DC/AC', value: '1.10' }] }));
  assert.match(three, /grid-cols-3/);
  assert.match(three, /<dt[^>]*>DC<\/dt>/);
  assert.match(three, /<dd[^>]*font-mono[^>]*>8\.82 kWp<\/dd>/);
  assert.doesNotMatch(three, /text-pd-accent/);
  const two = render(h(StatStrip, { items: [{ label: 'Venta /Wp', value: '$1.08', tone: 'accent' }, { label: 'Costo /Wp', value: '$0.86' }] }));
  assert.match(two, /grid-cols-2/);
  assert.match(two, /text-pd-accent[^"]*"[^>]*>\$1\.08/);
  assert.match(two, /bg-pd-item/);
}

// --- EnergyLegend: solar / battery / grid with their own tokens, kWh/day on the right ---
{
  const html = render(h(EnergyLegend, {
    segments: [{ kind: 'solar', label: 'Solar', percent: 35 }, { kind: 'bess', label: 'Batería', percent: 10 }, { kind: 'grid', label: 'Red', percent: 55 }],
    total: '29.6 kWh/d',
  }));
  assert.match(html, /bg-pd-solar/);
  assert.match(html, /bg-pd-bess/);
  assert.match(html, /bg-pd-grid/);
  assert.match(html, /Solar <b[^>]*font-mono[^>]*>35%<\/b>/);
  assert.match(html, /Red <b[^>]*>55%<\/b>/);
  assert.match(html, /29\.6 kWh\/d/);
  assert.match(html, /aria-hidden="true"/, 'las muestras de color son decorativas');
  const noBess = render(h(EnergyLegend, { segments: [{ kind: 'solar', label: 'Solar', percent: 35 }, { kind: 'grid', label: 'Red', percent: 65 }] }));
  assert.doesNotMatch(noBess, /bg-pd-bess/);
}

// --- InfoTip: icon button whose aria-label is the full text, plus a tooltip described by it ---
{
  const html = render(h(InfoTip, { text: 'Ley 57-07: crédito del 40% sobre equipos en 3 cuotas.' }));
  assert.match(html, /<button[^>]*aria-label="Ley 57-07: crédito del 40% sobre equipos en 3 cuotas\."/);
  assert.match(html, /aria-describedby="([^"]+)"/);
  const id = html.match(/aria-describedby="([^"]+)"/)![1];
  assert.match(html, new RegExp(`role="tooltip"[^>]*id="${id.replace(/[:]/g, '\\$&')}"|id="${id.replace(/[:]/g, '\\$&')}"[^>]*role="tooltip"`));
  assert.match(html, /group-hover:visible/);
  assert.match(html, /group-focus-within:visible/);
  assert.match(html, /invisible/);
  assert.match(html, /Ley 57-07: crédito del 40% sobre equipos en 3 cuotas\.<\/span>/);
}

// --- Dark mode lives in the tokens: no component hardcodes a palette color or reads isDark ---
{
  for (const file of ['ParamSection', 'ParamRow', 'StackedField', 'Field', 'SelectField', 'ToggleGroup', 'SquareSwitch', 'Stepper', 'ChipGroup', 'SubHeader', 'ItemCard', 'StatStrip', 'EnergyLegend', 'InfoTip']) {
    const source = readFileSync(`src/components/simulator/params/ui/${file}.tsx`, 'utf8');
    assert.doesNotMatch(source, /isDark/, `${file} no recibe isDark`);
    assert.doesNotMatch(source, /(?:bg|text|border)-(?:zinc|slate|gray|emerald|neutral|stone)-\d/, `${file} usa solo tokens pd-*`);
  }
}

console.log('Parameter dock UI tests passed.');
