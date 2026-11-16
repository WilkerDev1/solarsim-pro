import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registerHooks } from 'node:module';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { salesPerformance } from '../features/proposals/commercial';
import type { ProposalDecision } from '../../shared/proposalCommercial';

// Las tarjetas importan hojas de estilo; node solo necesita que no existan.
registerHooks({ load: (url, context, next) => url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context) });
const { useSimulationStore: store } = await import('../store/useSimulationStore');
const { DashboardView } = await import('../components/dashboard/DashboardView');
const { SellerResultsTable } = await import('../features/proposals/ProposalSalesSummary') as any;

// El filtro por decisión comercial vive en la barra superior de Inicio y los
// resultados quedan como una línea discreta con el desglose bajo demanda.
const make = (id: string, status: ProposalDecision, owner: string, extra: object = {}) => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id,
  client: { ...BENCHMARK_PROJECT.client, name: `Cliente ${id}`, projectId: `SP-${id}` },
  authorId: owner,
  authorName: owner,
  commercial: { status, note: '', ownerId: owner, ownerName: owner },
  ...extra,
});
const projects = [
  make('p1', 'pending', 'Ana'),
  make('p2', 'approved', 'Ana'),
  make('p3', 'rejected', 'Bruno'),
  make('p4', 'test', 'Bruno'),
  make('p5', 'approved', 'Bruno'),
  make('p6', 'approved', 'Ana', { isDeleted: true }),
];
const initial = store.getState();
// En SSR zustand lee el estado inicial del store: se le aplica el estado sintético durante la prueba.
const synthetic = { projects: projects as any, searchQuery: '', activeFolderId: null, activeTeamMemberFilter: null };
const serverState = store.getInitialState() as unknown as Record<string, unknown>;
const serverBackup = Object.fromEntries(Object.keys(synthetic).map((k) => [k, serverState[k]]));
try {
  store.setState(synthetic);
  Object.assign(serverState, synthetic);
  const html = renderToStaticMarkup(React.createElement(DashboardView));

  // 1. Selector compacto dentro de la barra superior, con contador por opción.
  const select = html.match(/<select[^>]*aria-label="Filtrar por decisión comercial"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(select, 'el filtro de decisión es un <select> con nombre accesible');
  const options = [...select![1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(options, [
    'Todas las decisiones · 5',
    'En espera de aprobación · 1',
    'Aprobada · 2',
    'Rechazada · 1',
    'De prueba · 1',
  ], 'conteos sobre el conjunto filtrado, sin papelera');
  const header = html.indexOf('aria-label="Buscar propuestas"');
  assert.ok(header >= 0 && html.indexOf('aria-label="Filtrar por decisión comercial"') > header, 'junto al buscador');
  assert.ok(html.indexOf('aria-label="Filtrar por decisión comercial"') < html.indexOf('Nueva simulación'), 'en la misma barra de acciones');

  // 2. La tarjeta ancha y su grupo de pestañas desaparecen.
  assert.ok(!html.includes('Seguimiento de propuestas'), 'sin la tarjeta independiente');
  assert.ok(!html.includes('aria-label="Filtrar por estado comercial"'), 'sin el grupo de botones antiguo');

  // 3. Resultados discretos: línea secundaria y desglose bajo demanda.
  const line = html.match(/<p[^>]*data-commercial-results[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(line, 'línea de resultados');
  const text = line![1].replace(/<[^>]+>/g, '');
  for (const fragment of ['En espera 1', 'Aprobadas 2', 'Rechazadas 1', 'De prueba 1']) {
    assert.ok(text.includes(fragment), `la línea incluye «${fragment}»: ${text}`);
  }
  const toggle = html.match(/<button[^>]*aria-controls="commercial-results-by-owner"[^>]*>/);
  assert.ok(toggle, 'botón del desglose por responsable');
  assert.match(toggle![0], /aria-expanded="false"/);
  assert.ok(html.includes('Por responsable'), 'texto visible del desglose');

  // 4. El popover de Filtros ya no repite el filtro de estado.
  const source = readFileSync(path.join(process.cwd(), 'src/components/dashboard/DashboardView.tsx'), 'utf8');
  assert.ok(!source.includes('Estado de la Propuesta'), 'sin el bloque duplicado en Filtros');

  // 5. Al filtrar por decisión, los conteos siguen sobre el conjunto completo.
  // (El estado es local del componente; se comprueba que el desglose no se pierde.)
  const { sellers } = salesPerformance(projects as any, () => 1000);
  const table = renderToStaticMarkup(React.createElement(SellerResultsTable, { sellers }));
  assert.ok(table.includes('Excluye pruebas y papelera'), 'conserva el ámbito explicado');
  assert.ok(table.includes('Aprobadas / (aprobadas + rechazadas)'), 'conserva la nota del denominador');
  assert.ok(table.includes('Bruno') && table.includes('Ana'));
  assert.ok(table.includes('50%') && table.includes('100%'), 'tasa de aprobación por responsable');
  const empty = renderToStaticMarkup(React.createElement(SellerResultsTable, { sellers: [] }));
  assert.ok(empty.includes('Sin propuestas comerciales'), 'estado vacío explícito');
} finally {
  Object.assign(serverState, serverBackup);
  store.setState(initial, true);
}
console.log('✓ Filtro de decisión en la barra superior, resultados discretos y desglose por responsable.');
