// Regla 2 del ADR 0006 §4: el precio escrito a mano en la fila de costo unitario se registra al confirmarlo (Enter o salir
// del campo con la ventana enfocada), solo si cambió y cumple las condiciones; un registro vivo por (propuesta, equipo) y una
// pregunta compacta solo si el equipo no tiene precio genérico. Sin red: el envío automático está apagado.
import assert from 'node:assert/strict';
import React from 'react';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { BENCHMARK_PROJECT } from '../engine/referenceCase';
import { acceptProposalGenericQuestion, commitProposalPrice, type ProposalPriceCommitInput } from '../store/slices/equipmentPriceSlice';
import { createPriceCommitTracker, nextRowQuestion, rowQuestionFor, type RowQuestion } from '../components/simulator/params/sections/pricing/priceCommit';
import { UnitCosts } from '../components/simulator/params/sections/pricing/UnitCosts';
import { serializeSimulationStore } from '../store/persistence/serializeSimulationStore';
import { captureWorkspace, emptyWorkspace } from '../store/sync/organizationWorkspace';
import type { ProjectSimulation, LegacyProjectSpecs } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';

// ── Confirmación: nada por tecla; Enter o blur con la ventana enfocada, y solo si cambió ──
{
  const t = createPriceCommitTracker();
  t.focus(100);
  assert.equal(t.commit(101, 'blur', true) === null, false);
  t.focus(100);
  assert.equal(t.commit(100, 'blur', true), null, 'sin cambio no se confirma');
  t.focus(100);
  assert.deepEqual(t.commit(120, 'enter', true), { previousUSD: 100, priceUSD: 120 });
  assert.equal(t.commit(120, 'blur', true), null, 'tras Enter, salir sin otro cambio no repite');
  t.focus(120);
  assert.equal(t.commit(130, 'blur', false), null, 'salir porque la ventana perdió el foco no confirma');
  t.focus(130); // la ventana vuelve y el campo recupera el foco: la base sigue siendo la de antes
  assert.deepEqual(t.commit(130, 'blur', true), { previousUSD: 120, priceUSD: 130 });
  assert.equal(t.commit(140, 'enter', true), null, 'sin foco no hay nada que confirmar');
  const unset = createPriceCommitTracker();
  unset.focus(undefined);
  assert.deepEqual(unset.commit(50, 'enter', true), { previousUSD: undefined, priceUSD: 50 });
}

// ── Escenario de store ──
const serverUrl = 'https://prices.invalid';
const user = (role: 'EDITOR' | 'LECTOR' = 'EDITOR') => ({ id: 'ana', name: 'Ana', email: 'ana@example.invalid', role, organizationId: 'org-a' });
const panel = (id: string): SolarEquipmentItem => ({ id, type: 'panel', brand: 'QA', modelSeries: id, displayName: `Panel ${id}`, powerW: 600,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', organizationId: 'org-a', syncServerUrl: serverUrl, version: 1, baseVersion: 1 } as SolarEquipmentItem);
const project = (id: string, extra: Partial<ProjectSimulation> = {}): ProjectSimulation =>
  ({ ...structuredClone(BENCHMARK_PROJECT), id, organizationId: 'org-a', syncServerUrl: serverUrl, ...extra });
function reset(session: 'writer' | 'reader' | 'none' = 'writer') {
  store.getState().setSyncSettings(session === 'none'
    ? { serverUrl, authToken: null, currentUser: null, autoSyncEnabled: false }
    : { serverUrl, authToken: 'token', currentUser: user(session === 'reader' ? 'LECTOR' : 'EDITOR'), autoSyncEnabled: false });
  store.setState({
    equipmentCatalog: [panel('eq-1'), panel('eq-2')], projects: [project('pr-1'), project('pr-local', { organizationId: undefined, syncServerUrl: undefined }), project('pr-other', { organizationId: 'org-b' }), project('pr-trash', { isDeleted: true, deletedAt: '2026-11-01T00:00:00Z' })],
    genericPrices: {}, pricePending: { observations: [], voids: [] }, proposalPriceLive: {}, genericQuestionDismissed: {},
  });
}
const input = (over: Partial<ProposalPriceCommitInput> = {}): ProposalPriceCommitInput => ({ projectId: 'pr-1', equipmentId: 'eq-1', previousUSD: 100, priceUSD: 120, ...over });
const commit = (over: Partial<ProposalPriceCommitInput> = {}) => commitProposalPrice(store.getState(), input(over));
const queued = () => store.getState().pricePending;
const generic = (priceUSD: number) => ({ priceUSD, observedAt: '2026-11-10T00:00:00.000Z', observationId: 'po-00000000-0000-4000-8000-0000000000aa' });

{ // registra una observación `proposal` con la propuesta y pregunta solo sin genérico
  reset();
  const result = commit();
  assert.ok(result.observationId);
  const [entry] = queued().observations;
  assert.deepEqual([entry.kind, entry.source, entry.projectId, entry.equipmentId, entry.priceUSD], ['observation', 'proposal', 'pr-1', 'eq-1', 120]);
  assert.ok(result.question, 'sin genérico: pregunta');
  assert.deepEqual([result.question!.projectId, result.question!.equipmentId, result.question!.priceUSD, result.question!.observationId], ['pr-1', 'eq-1', 120, result.observationId]);
}
{ // sin cambio, precio 0 o igual al proveedor/genérico: nada
  reset();
  assert.equal(commit({ priceUSD: 100 }).observationId, null, 'sin cambio');
  assert.equal(commit({ priceUSD: 0 }).observationId, null, 'precio 0');
  assert.equal(commit({ supplierPriceUSD: 120 }).observationId, null, 'igual al proveedor asignado');
  store.setState({ genericPrices: { 'eq-1': generic(120) } });
  assert.equal(commit().observationId, null, 'igual al genérico vigente');
  assert.equal(queued().observations.length, 0);
}
{ // propuesta local, de otra organización, en papelera, equipo sin resolver, sin sesión o LECTOR: nada
  reset();
  for (const projectId of ['pr-local', 'pr-other', 'pr-trash', 'pr-missing']) assert.equal(commit({ projectId }).observationId, null, projectId);
  assert.equal(commit({ equipmentId: 'eq-unknown' }).observationId, null, 'equipo no resuelto');
  assert.equal(commit({ equipmentId: undefined as unknown as string }).observationId, null);
  reset('none');
  assert.equal(commit().observationId, null, 'modo local apagado');
  reset('reader');
  assert.equal(commit().observationId, null, 'LECTOR no registra');
  assert.equal(queued().observations.length, 0);
}
{ // un registro vivo por (propuesta, equipo): el anterior se anula
  reset();
  const first = commit().observationId!;
  const second = commit({ previousUSD: 120, priceUSD: 130 }).observationId!;
  assert.notEqual(first, second);
  assert.deepEqual(queued().voids.map((v) => v.id), [first], 'se anula el registro anterior del par');
  assert.equal(store.getState().proposalPriceLive['pr-1|eq-1'], second);
  const other = commit({ equipmentId: 'eq-2' }).observationId!;
  assert.deepEqual(queued().voids.map((v) => v.id), [first], 'otro equipo es otro par');
  assert.equal(store.getState().proposalPriceLive['pr-1|eq-2'], other);
  // persistido y por espacio de trabajo
  assert.equal(serializeSimulationStore(store.getState()).proposalPriceLive?.['pr-1|eq-1'], second);
  assert.equal(captureWorkspace(store.getState()).proposalPriceLive?.['pr-1|eq-1'], second);
  assert.deepEqual(emptyWorkspace().proposalPriceLive, {});
}
{ // con genérico no se pregunta; «No» suprime la pregunta para ese equipo en la sesión; «Usar» fija el genérico derivado
  reset();
  store.setState({ genericPrices: { 'eq-2': generic(90) } });
  const withGeneric = commit({ equipmentId: 'eq-2' });
  assert.ok(withGeneric.observationId, 'se registra igual');
  assert.equal(withGeneric.question, null, 'con genérico no se pregunta');

  const asked = commit();
  store.getState().dismissGenericQuestion('eq-1');
  assert.equal(commit({ previousUSD: 120, priceUSD: 125 }).question, null, 'tras «No» ya no se pregunta por ese equipo');
  assert.equal(JSON.stringify(serializeSimulationStore(store.getState())).includes('genericQuestionDismissed'), false, 'la supresión vive solo en memoria');

  const id = acceptProposalGenericQuestion(store.getState(), asked.question!);
  assert.ok(id);
  const created = queued().observations.find((entry) => entry.id === id)!;
  assert.deepEqual([created.kind, created.source, created.priceUSD, created.derivedFromId, created.equipmentId], ['generic', 'proposal', 120, asked.observationId, 'eq-1'],
    'usa los datos capturados al confirmar, no el precio actual');
  assert.deepEqual([created.originalCurrency, created.originalPrice], ['USD', 120], 'el genérico desde propuesta guarda moneda y precio original, como los de ofertas');
  const observed = queued().observations.find((entry) => entry.id === asked.observationId)!;
  assert.deepEqual([observed.originalCurrency, observed.originalPrice], ['USD', 120], 'la observación de la propuesta también');
  store.getState().setSyncSettings({ serverUrl, authToken: 'token', currentUser: { ...user(), id: 'otro' }, autoSyncEnabled: false });
  assert.equal(acceptProposalGenericQuestion(store.getState(), asked.question!), null, 'otra sesión no acepta la pregunta');
}

// ── Cableado de UnitCosts: resuelve el equipo estricto y pasa la confirmación; dibuja la pregunta bajo su fila ──
{
  const findProps = (node: unknown, pred: (props: Record<string, any>) => boolean, out: Record<string, any>[] = []): Record<string, any>[] => {
    if (Array.isArray(node)) node.forEach((n) => findProps(n, pred, out));
    else if (node && typeof node === 'object' && 'props' in node) {
      const props = (node as { props: Record<string, any> }).props;
      if (pred(props)) out.push(props);
      findProps(props.children, pred, out);
    }
    return out;
  };
  const item = panel('eq-1');
  const specs = { ...structuredClone(BENCHMARK_PROJECT).specs, hasBattery: false, panels: [{ id: 'g-1', catalogItemId: 'eq-1', brandModel: 'Nombre cambiado', powerW: 600, count: 4, unitPriceUSD: 100, selectedSupplierInfo: { supplierName: 'Alfa', priceUSD: 95 } }] } as LegacyProjectSpecs;
  const commits: unknown[] = [];
  const asked: unknown[] = [];
  const tree = UnitCosts({ specs, equipmentCatalog: [item], selected: {}, openSupplierPriceModal: () => {}, updateSpecs: () => {},
    onPriceCommit: (target, previousUSD, priceUSD) => commits.push({ ...target, previousUSD, priceUSD }),
    priceQuestionFor: (kind, index, equipmentId) => { asked.push({ kind, index, equipmentId }); return kind === 'panel' && index === 0 ? React.createElement('span', { id: 'q' }, '¿Usar como precio genérico?') : null; } });
  const row = findProps(tree, (props) => props.id === 'pd-cost-panel-0')[0];
  row.onCommit(100, 110);
  assert.deepEqual(commits[0], { kind: 'panel', index: 0, equipmentId: 'eq-1', supplierPriceUSD: 95, previousUSD: 100, priceUSD: 110 }, 'resuelve con resolveGroupCatalogItem (catalogItemId)');
  assert.ok(row.footer, 'la pregunta va bajo el precio de su fila');
  assert.deepEqual(asked[0], { kind: 'panel', index: 0, equipmentId: 'eq-1' }, 'la fila pasa su equipo resuelto para casar la pregunta');
  const inverterRow = findProps(tree, (props) => props.id === 'pd-cost-inverter-0')[0];
  inverterRow.onCommit(1, 2);
  assert.equal((commits[1] as { equipmentId?: string }).equipmentId, undefined, 'un modelo sin resolver no tiene equipo');
}
// ── Estado de la pregunta en el dock: se casa por fila y equipo, y un confirmado rechazado en la misma fila la quita ──
{
  const q = (over: Partial<RowQuestion> = {}): RowQuestion => ({ projectId: 'pr-1', equipmentId: 'eq-1', priceUSD: 120, observationId: 'po-1', scope: 's', userId: 'ana', kind: 'panel', index: 0, ...over });
  const panel0 = { kind: 'panel' as const, index: 0 };
  const none = { observationId: null, question: null };
  // 120 creó la pregunta; luego 100 (igual al proveedor) se rechaza en la misma fila: la pregunta de 120 ya no vale
  assert.equal(nextRowQuestion(q(), panel0, none), null, 'un confirmado rechazado en la misma fila quita la pregunta');
  assert.deepEqual(nextRowQuestion(q(), { kind: 'inverter', index: 0 }, none), q(), 'un rechazo en otra fila no la toca');
  assert.equal(nextRowQuestion(q(), { kind: 'inverter', index: 0 }, { observationId: 'po-2', question: null }), null, 'un registro nuevo sin pregunta la reemplaza');
  const { kind: _k, index: _i, ...plain } = q({ priceUSD: 130, observationId: 'po-3' });
  assert.deepEqual(nextRowQuestion(q(), panel0, { observationId: 'po-3', question: plain }), q({ priceUSD: 130, observationId: 'po-3' }));
  // casado por propuesta, fila y equipo
  assert.deepEqual(rowQuestionFor(q(), 'pr-1', 'panel', 0, 'eq-1'), q());
  assert.equal(rowQuestionFor(q(), 'pr-1', 'panel', 0, 'eq-2'), null, 'la fila ahora tiene otro modelo');
  assert.equal(rowQuestionFor(q(), 'pr-1', 'panel', 0, undefined), null, 'la fila ya no resuelve el equipo');
  assert.equal(rowQuestionFor(q(), 'pr-1', 'panel', 1, 'eq-1'), null);
  assert.equal(rowQuestionFor(q(), 'pr-2', 'panel', 0, 'eq-1'), null);
  assert.equal(rowQuestionFor(null, 'pr-1', 'panel', 0, 'eq-1'), null);
}
console.log('PASS: Regla 2 del precio genérico (confirmación, condiciones, registro vivo por par y pregunta).');
