import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { projectDateStamps, projectDateSummary } from '../components/dashboard/projectPresentation';
import { ProposalDates } from '../components/dashboard/ProposalDates';
import { useSimulationStore } from '../store/useSimulationStore';

/**
 * Las propuestas muestran por separado cuándo se crearon y cuándo se actualizaron por última vez.
 * Editar una propuesta solo mueve `updatedAt`: `createdAt` es de quien la creó (o del servidor, tras sincronizar).
 */

// Mediodía UTC: el día local es el mismo en cualquier zona razonable.
const CREATED = '2026-10-12T16:00:00.000Z';
const UPDATED = '2026-11-02T16:00:00.000Z';
const dates = (createdAt: unknown, updatedAt: unknown) => ({ createdAt, updatedAt }) as never;

// --- Helper puro ---
{
  const stamps = projectDateStamps(dates(CREATED, UPDATED));
  assert.deepEqual(stamps.map((s) => s.kind), ['created', 'updated']);
  assert.deepEqual(stamps.map((s) => s.iso), [CREATED, UPDATED]);
  assert.equal(stamps[0].text, '12/10/2026');
  assert.equal(stamps[1].text, '2/11/2026');
  assert.equal(projectDateSummary(dates(CREATED, UPDATED)), 'Creada 12/10/2026 · Actualizada 2/11/2026');
  assert.equal(projectDateSummary(dates(CREATED, UPDATED), 'short'), 'Creada 12/10/2026 · Act. 2/11/2026');
}

// --- Respaldo: solo se muestra la fecha que existe y es válida; nunca "Invalid Date" ---
{
  for (const missing of [undefined, null, '', '   ', 'no-es-fecha']) {
    const onlyUpdated = projectDateStamps(dates(missing, UPDATED));
    assert.deepEqual(onlyUpdated.map((s) => s.kind), ['updated'], `sin createdAt (${String(missing)})`);
    assert.equal(projectDateSummary(dates(missing, UPDATED)), 'Actualizada 2/11/2026');
    const onlyCreated = projectDateStamps(dates(CREATED, missing));
    assert.deepEqual(onlyCreated.map((s) => s.kind), ['created'], `sin updatedAt (${String(missing)})`);
    assert.equal(projectDateSummary(dates(CREATED, missing), 'short'), 'Creada 12/10/2026');
  }
  assert.deepEqual(projectDateStamps(dates(undefined, 'basura')), []);
  assert.deepEqual(projectDateStamps(dates('2026-1-5', CREATED)).map((s) => s.kind), ['updated'], 'solo fechas AAAA-MM-DD, como exige la API');
  assert.deepEqual(projectDateStamps(dates(' 2026-02-30', CREATED)).map((s) => s.kind), ['updated'], 'el espacio inicial no salta la validación del calendario');
  assert.equal(projectDateStamps(dates('2026-10-12', undefined))[0].text, new Date(2026, 9, 12).toLocaleDateString('es-DO'), 'una fecha sin hora es ese día local, no medianoche UTC');
  assert.deepEqual(projectDateStamps(dates('2026-02-30T00:00:00Z', CREATED)).map((s) => s.kind), ['updated'], 'una fecha imposible en el calendario no se muestra');
  assert.equal(projectDateSummary(dates(undefined, 'basura')), 'Sin fecha');
  for (const text of [projectDateSummary(dates('x', 'y')), projectDateSummary(dates(CREATED, 'Invalid Date'))]) assert.ok(!/Invalid/i.test(text), text);
}

// --- Componente: etiquetas separadas y <time dateTime> con el valor original ---
{
  const html = renderToStaticMarkup(React.createElement(ProposalDates, { project: dates(CREATED, UPDATED), layout: 'inline' }));
  assert.match(html, /Creada <time[^>]*dateTime="2026-10-12T16:00:00.000Z"[^>]*>12\/10\/2026<\/time>/);
  assert.match(html, /Actualizada <time[^>]*dateTime="2026-11-02T16:00:00.000Z"[^>]*>2\/11\/2026<\/time>/);
  const short = renderToStaticMarkup(React.createElement(ProposalDates, { project: dates(CREATED, UPDATED), layout: 'stacked', labels: 'short' }));
  assert.match(short, /Act\. <time/);
  const partial = renderToStaticMarkup(React.createElement(ProposalDates, { project: dates(undefined, UPDATED), layout: 'inline' }));
  assert.ok(!/Creada/.test(partial) && /Actualizada/.test(partial), partial);
  assert.ok(!/Invalid/.test(partial));
  const none = renderToStaticMarkup(React.createElement(ProposalDates, { project: dates('x', 'y'), layout: 'inline' }));
  assert.match(none, /Sin fecha/);
}

// --- Store: editar no cambia createdAt, solo updatedAt ---
{
  const get = () => useSimulationStore.getState();
  get().createNewProject({ name: 'Cliente Fechas', company: 'Fechas SRL', province: 'Santiago', distributor: 'EDENORTE' });
  const id = get().projects.find((p) => p.client.name === 'Cliente Fechas')!.id;
  const OLD = '2026-01-05T15:00:00.000Z';
  useSimulationStore.setState((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, createdAt: OLD, updatedAt: OLD } : p)) }));
  get().setActiveProject(id);
  const read = () => get().projects.find((p) => p.id === id)!;
  const expectEdited = (label: string, previousUpdatedAt: string) => {
    assert.equal(read().createdAt, OLD, `${label}: createdAt intacto`);
    assert.ok(Date.parse(read().updatedAt) >= Date.parse(previousUpdatedAt) && Date.parse(read().updatedAt) > Date.parse(OLD), `${label}: updatedAt avanza`);
    return read().updatedAt;
  };
  let last = OLD;
  get().updateClient({ company: 'Fechas SRL editada' });
  last = expectEdited('updateClient', last);
  get().updateRates({ isZeroExport: !read().rates.isZeroExport });
  last = expectEdited('updateRates', last);
  get().updateAllMonthlyConsumption(900);
  last = expectEdited('updateAllMonthlyConsumption', last);
  get().setProjectStatus(id, 'Final');
  assert.equal(read().createdAt, OLD, 'setProjectStatus: createdAt intacto');
  get().moveToTrash(id);
  assert.equal(read().createdAt, OLD, 'moveToTrash: createdAt intacto');
  get().restoreProject(id);
  assert.equal(read().createdAt, OLD, 'restoreProject: createdAt intacto');
  const snapshot = get().createSnapshot(id, 'antes');
  get().updateClient({ company: 'Otra edición' });
  assert.equal(get().restoreSnapshot(id, snapshot.id), true);
  assert.equal(read().createdAt, OLD, 'restoreSnapshot: createdAt intacto');
  assert.ok(Date.parse(read().updatedAt) >= Date.parse(last));
}

console.log('Proposal dates: separate created/updated formatting, fallbacks and createdAt stability passed.');
