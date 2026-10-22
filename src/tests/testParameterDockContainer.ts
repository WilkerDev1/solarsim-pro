import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DOCK_SECTION_KEYS, allSections, allSectionsOpen, toggleAll, dockStorageKey, financialsBadge, loadOpenSections, saveOpenSections, toggleSection,
} from '../components/simulator/params/logic/dockSections';
import { ParameterDockPanel } from '../components/simulator/sidebar/ParameterDockPanel';

const h = React.createElement;
const noop = () => {};
const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const broken = {
  getItem: (): string | null => { throw new Error('bloqueado'); },
  setItem: (): void => { throw new Error('cuota'); },
};

// Abrir y cerrar
{
  let s = allSections(false);
  assert.equal(allSectionsOpen(s), false);
  s = toggleSection(s, 'rates');
  assert.equal(s.rates, true);
  assert.equal(s.client, false);
  assert.equal(allSectionsOpen(s), false, 'parcial no cuenta como todo abierto');
  assert.deepEqual(toggleAll(s), allSections(true), 'parcial: «todo» expande');
  assert.deepEqual(toggleAll(allSections(true)), allSections(false), 'todo abierto: colapsa');
  assert.deepEqual(toggleAll(allSections(false)), allSections(true));
  s = toggleSection(s, 'rates');
  assert.equal(s.rates, false);
  assert.deepEqual([...DOCK_SECTION_KEYS], ['client', 'rates', 'equipment', 'costs', 'financials']);
}

// Persistencia por usuario
{
  const storage = memory();
  assert.deepEqual(loadOpenSections('u1', storage), allSections(false), 'sin dato guardado: todo cerrado');
  assert.equal(saveOpenSections({ ...allSections(false), costs: true }, 'u1', storage), true);
  assert.equal(loadOpenSections('u1', storage).costs, true);
  assert.equal(loadOpenSections('u2', storage).costs, false, 'cada usuario tiene su estado');
  assert.notEqual(dockStorageKey('u1'), dockStorageKey('u2'));
  assert.equal(dockStorageKey(undefined), dockStorageKey(null));
  storage.data.set(dockStorageKey('u3'), '{no es json');
  assert.deepEqual(loadOpenSections('u3', storage), allSections(false), 'JSON corrupto ignorado');
  storage.data.set(dockStorageKey('u4'), '[1,2]');
  assert.deepEqual(loadOpenSections('u4', storage), allSections(false), 'forma inválida ignorada');
  storage.data.set(dockStorageKey('u5'), JSON.stringify({ client: true, rates: 'sí', extra: true }));
  assert.deepEqual(loadOpenSections('u5', storage), { ...allSections(false), client: true }, 'solo true de claves conocidas');
}

// localStorage falla: no lanza
{
  assert.deepEqual(loadOpenSections('u1', broken), allSections(false));
  assert.equal(saveOpenSections(allSections(true), 'u1', broken), false);
  assert.deepEqual(loadOpenSections('u1', null), allSections(false));
  assert.equal(saveOpenSections(allSections(true), 'u1', null), false);
  assert.doesNotThrow(() => loadOpenSections('u1'), 'sin localStorage global tampoco lanza');
}

// Contadores de Finanzas
{
  assert.deepEqual(financialsBadge({}), { items: 0, discounts: 0, label: '' });
  assert.equal(financialsBadge({ customItems: [1], customDiscounts: [] }).label, '1 ítem personalizado');
  assert.equal(financialsBadge({ customItems: [1, 2], customDiscounts: [1] }).label, '2 ítems personalizados, 1 descuento');
}

// Panel
{
  const panel = (open: ReturnType<typeof allSections>, badge = financialsBadge({ customItems: [1, 2], customDiscounts: [1] })) =>
    renderToStaticMarkup(h(ParameterDockPanel, {
      open,
      onToggle: noop,
      onToggleAll: noop,
      financialsBadge: badge,
      renderBody: (key: string) => h('p', { 'data-body': key }, key),
    }));
  const closed = panel(allSections(false));
  assert.match(closed, /PARÁMETROS/);
  assert.equal((closed.match(/aria-expanded="false"/g) ?? []).length, 5);
  assert.doesNotMatch(closed, /aria-expanded="true"/);
  for (const t of ['Proyecto y cliente', 'Tarifas', 'Equipamiento', 'Costos y margen', 'Finanzas']) assert.ok(closed.includes(t), t);
  assert.ok(closed.indexOf('Proyecto y cliente') < closed.indexOf('Tarifas') && closed.indexOf('Costos y margen') < closed.indexOf('Finanzas'), 'orden actual');
  assert.match(closed, /2 ítems personalizados, 1 descuento/, 'badge de Finanzas');
  assert.match(closed, /Expandir todo/);
  const opened = panel({ ...allSections(false), rates: true });
  assert.equal((opened.match(/aria-expanded="true"/g) ?? []).length, 1);
  assert.match(opened, /Expandir todo/, 'parcialmente abierto sigue ofreciendo expandir');
  assert.doesNotMatch(opened, /Colapsar todo/);
  assert.match(panel(allSections(true)), /Colapsar todo/);
  assert.doesNotMatch(panel(allSections(true), financialsBadge({})), /personalizado/);
}

// Contratos del contenedor
{
  const sidebar = readFileSync('src/components/simulator/sidebar/ParameterSidebar.tsx', 'utf8');
  assert.match(sidebar, /Math\.max\(sidebarWidth \|\| 380, 380\)/);
  assert.match(sidebar, /onMouseDown/);
  for (const f of ['Client', 'Rates', 'Equipment', 'Pricing', 'Financials']) {
    const src = readFileSync(`src/components/simulator/sidebar/${f}ParamsSection.tsx`, 'utf8');
    assert.doesNotMatch(src, /isOpen|onToggle/, `${f}: sin prop isOpen/onToggle`);
  }
}

console.log('testParameterDockContainer: OK');
