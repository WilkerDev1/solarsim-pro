// Diario de deshacer por propuesta (F2a1; ADR 0004, «Deshacer por propuesta»). Funciones puras: sin Zustand ni temporizadores,
// el reloj llega como `now`. El store guarda un `UndoHistory` en memoria (no se persiste) y solo traduce Ctrl+Z/rehacer a
// `restoreProjectContent` sobre la propuesta activa.
//
// Reglas:
// - Un diario por `projectId`. Deshacer y rehacer son LIFO dentro del diario de la propuesta activa y nunca cruzan propuestas.
// - Activar una propuesta (abrir, crear, duplicar, restaurar, importar, borrador de IA) siembra la base de ESA propuesta. Si ya
//   tenía diario y su contenido coincide con la última instantánea, se conserva; si cambió mientras estaba cerrada
//   (sincronización, agente, conflicto), se siembra de nuevo sin pasos.
// - Cada paso guarda solo las secciones que cambiaron, con su antes y su después (las que restaura `restoreProjectContent`),
//   y, desde F2a2, las rutas de campo del registro que tocó la transacción (`fields`, derivadas incluidas): restaurar la
//   sección devuelve también lo que cambiaron las reglas; `fields` es lo que el diff, la tarjeta y F3 nombran.
// - Agrupar es explícito: dos registros seguidos con la misma `coalesceKey`, la misma fuente y el mismo turno, separados por
//   menos de `UNDO_COALESCE_WINDOW_MS`, son un solo paso (ventana deslizante, como el debounce anterior). Sin clave no se agrupa.
import type { ProjectSimulation } from '../../types';

/** Quién originó el cambio. Hoy casi todo entra como `user`; las fases siguientes distinguirán dock, asistente y agentes. */
export type UndoSource = 'user' | 'dock' | 'assistant' | 'external_agent' | 'system';

/** Secciones que el diario sigue y restaura: las mismas que `restoreProjectContent`. */
export const UNDO_SECTIONS = ['client', 'specs', 'rates', 'financials', 'monthlyConsumption', 'customization', 'status'] as const;
export type UndoSection = (typeof UNDO_SECTIONS)[number];
export type UndoSnapshot = Pick<ProjectSimulation, UndoSection>;

export interface UndoPathChange {
  /** Una sección de `UNDO_SECTIONS`: la unidad que restauran deshacer y rehacer. */
  path: string;
  before: unknown;
  after: unknown;
}

/** Ruta de campo del registro que cambió en el paso (F2a2), con su antes y su después. */
export interface UndoFieldChange {
  path: string;
  before: unknown;
  after: unknown;
  /** La cambió una regla o una dependencia, no la edición. */
  derived: boolean;
}

export interface UndoEntry {
  projectId: string;
  source: UndoSource;
  turnId?: string;
  coalesceKey?: string;
  paths: UndoPathChange[];
  /** Rutas de campo que tocaron las transacciones del paso (`commitProjectEdits`); las ediciones antiguas no las traen. */
  fields?: UndoFieldChange[];
  /** Momento del último registro agrupado en este paso (para la ventana de agrupado). */
  at: number;
}

export interface ProjectUndoJournal {
  projectId: string;
  /** Última instantánea conocida de la propuesta (JSON, sin claves `undefined`). */
  head: UndoSnapshot;
  undo: UndoEntry[];
  redo: UndoEntry[];
  /** Falso tras deshacer o rehacer: el siguiente registro abre un paso nuevo aunque caiga dentro de la ventana. */
  coalesceOpen: boolean;
}

export interface UndoHistory {
  /** Propuesta a la que pertenecen `canUndo`/`canRedo` (la activa cuando se tocó el diario por última vez). */
  activeId: string | null;
  journals: Record<string, ProjectUndoJournal>;
  /** Del menos al más reciente; el exceso sobre `MAX_UNDO_JOURNALS` se olvida por el principio. */
  order: string[];
}

export interface UndoRecordOptions {
  source?: UndoSource;
  coalesceKey?: string;
  turnId?: string;
  /** Rutas de campo de la transacción que produjo este estado. */
  fields?: readonly UndoFieldChange[];
}

/** Junta las rutas de dos registros agrupados: el primer antes y el último después; sin efecto neto, la ruta se va. */
function mergeFields(previous: readonly UndoFieldChange[] | undefined, next: readonly UndoFieldChange[] | undefined): UndoFieldChange[] | undefined {
  if (!previous?.length && !next?.length) return undefined;
  const merged = (previous ?? []).map((change) => ({ ...change }));
  for (const change of next ?? []) {
    const existing = merged.find((item) => item.path === change.path);
    if (existing) { existing.after = clone(change.after); existing.derived = existing.derived && change.derived; }
    else merged.push({ ...change, before: clone(change.before), after: clone(change.after) });
  }
  const effective = merged.filter((change) => !same(change.before, change.after));
  return effective.length ? effective : undefined;
}

export const UNDO_COALESCE_WINDOW_MS = 600;
/** Pasos por propuesta: los mismos que daban las 50 instantáneas de la pila anterior (base incluida). */
export const MAX_UNDO_ENTRIES = 49;
/** Propuestas con diario en memoria a la vez. */
export const MAX_UNDO_JOURNALS = 10;
/** Clave con la que el store agrupa las ediciones sin más información (dock, formularios, documento), como el debounce de antes. */
export const DEFAULT_EDIT_COALESCE_KEY = 'edit';

export const EMPTY_UNDO_HISTORY: UndoHistory = Object.freeze({ activeId: null, journals: {}, order: [] }) as UndoHistory;

const clone = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Copia congelada en JSON de las secciones que sigue el diario. */
export function snapshotOf(project: ProjectSimulation): UndoSnapshot {
  const snapshot = {} as Record<UndoSection, unknown>;
  for (const section of UNDO_SECTIONS) snapshot[section] = clone(project[section]);
  return snapshot as UndoSnapshot;
}

function sameSnapshot(head: UndoSnapshot, project: ProjectSimulation) {
  return UNDO_SECTIONS.every((section) => same(head[section], project[section]));
}

function withJournal(history: UndoHistory, journal: ProjectUndoJournal): UndoHistory {
  const order = [...history.order.filter((id) => id !== journal.projectId), journal.projectId];
  const journals = { ...history.journals, [journal.projectId]: journal };
  while (order.length > MAX_UNDO_JOURNALS) delete journals[order.shift()!];
  return { activeId: journal.projectId, journals, order };
}

const freshJournal = (project: ProjectSimulation): ProjectUndoJournal =>
  ({ projectId: project.id, head: snapshotOf(project), undo: [], redo: [], coalesceOpen: false });

/**
 * Activa el diario de `project` (el estado que se ve al abrirla). Reactivar la activa no cambia nada; volver a una propuesta
 * cuyo contenido coincide con su diario lo conserva; si no coincide, siembra una base nueva.
 */
export function activateJournal(history: UndoHistory, project: ProjectSimulation): UndoHistory {
  if (!project?.id) return history;
  const existing = history.journals[project.id];
  if (existing && history.activeId === project.id) return history;
  if (existing && sameSnapshot(existing.head, project)) return withJournal(history, { ...existing, coalesceOpen: false });
  return withJournal(history, freshJournal(project));
}

/**
 * Registra el estado actual de la propuesta activa. Si el diario activo es de otra propuesta (o no existe), el estado recibido
 * pasa a ser la base: nunca se hereda nada de otra propuesta.
 */
export function recordUndo(history: UndoHistory, project: ProjectSimulation, options: UndoRecordOptions & { now: number }): UndoHistory {
  if (!project?.id) return history;
  const journal = history.journals[project.id];
  if (!journal || history.activeId !== project.id) return activateJournal(history, project);

  const changed = UNDO_SECTIONS.filter((section) => !same(journal.head[section], project[section]));
  if (changed.length === 0) return history;
  const head = { ...journal.head } as Record<UndoSection, unknown>;
  for (const section of changed) head[section] = clone(project[section]);

  const source = options.source ?? 'user';
  const last = journal.undo[journal.undo.length - 1];
  const coalesce = !!last && journal.coalesceOpen && !!options.coalesceKey && last.coalesceKey === options.coalesceKey
    && last.source === source && last.turnId === options.turnId && options.now - last.at <= UNDO_COALESCE_WINDOW_MS;

  let undo: UndoEntry[];
  if (coalesce) {
    const paths = last.paths.map((change) => (changed.includes(change.path as UndoSection) ? { ...change, after: head[change.path as UndoSection] } : change));
    for (const section of changed)
      if (!paths.some((change) => change.path === section)) paths.push({ path: section, before: journal.head[section], after: head[section] });
    const effective = paths.filter((change) => !same(change.before, change.after));
    const fields = mergeFields(last.fields, options.fields);
    const merged: UndoEntry = { ...last, paths: effective, at: options.now };
    if (fields) merged.fields = fields; else delete merged.fields;
    undo = effective.length ? [...journal.undo.slice(0, -1), merged] : journal.undo.slice(0, -1);
  } else {
    const entry: UndoEntry = {
      projectId: project.id, source, paths: changed.map((section) => ({ path: section, before: journal.head[section], after: head[section] })), at: options.now,
      ...(options.turnId ? { turnId: options.turnId } : {}), ...(options.coalesceKey ? { coalesceKey: options.coalesceKey } : {}),
      ...(options.fields?.length ? { fields: mergeFields(undefined, options.fields) } : {}),
    };
    undo = [...journal.undo, entry].slice(-MAX_UNDO_ENTRIES);
  }
  return withJournal(history, { ...journal, head: head as UndoSnapshot, undo, redo: [], coalesceOpen: true });
}

function step(history: UndoHistory, projectId: string, direction: 'undo' | 'redo', current?: ProjectSimulation) {
  const journal = history.journals[projectId];
  if (!journal || history.activeId !== projectId) return null;
  const from = direction === 'undo' ? journal.undo : journal.redo;
  const entry = from[from.length - 1];
  if (!entry) return null;
  // Sobre el contenido ACTUAL: solo vuelven las rutas del paso. Lo que cambió fuera del diario (un pull, el estado) se conserva
  // y pasa a la base, para que el siguiente registro no lo cuente como del usuario.
  const head = (current?.id === projectId ? snapshotOf(current) : { ...journal.head }) as Record<string, unknown>;
  for (const change of entry.paths) head[change.path] = clone(direction === 'undo' ? change.before : change.after);
  const next: ProjectUndoJournal = direction === 'undo'
    ? { ...journal, head: head as UndoSnapshot, undo: journal.undo.slice(0, -1), redo: [...journal.redo, entry], coalesceOpen: false }
    : { ...journal, head: head as UndoSnapshot, redo: journal.redo.slice(0, -1), undo: [...journal.undo, entry], coalesceOpen: false };
  // La instantánea devuelta es una copia: el proyecto restaurado no comparte objetos con el diario.
  return { history: withJournal(history, next), snapshot: clone(next.head), entry };
}

/** Deshace el último paso de la propuesta activa sobre `current` (su contenido actual). `null` si no hay paso o el diario activo es de otra propuesta. */
export const undoStep = (history: UndoHistory, projectId: string, current?: ProjectSimulation) => step(history, projectId, 'undo', current);
/** Rehace el último paso deshecho de la propuesta activa. */
export const redoStep = (history: UndoHistory, projectId: string, current?: ProjectSimulation) => step(history, projectId, 'redo', current);

/** Traslada el diario de `oldId` a `newId` (el servidor bifurcó la propuesta con un id nuevo), con sus pasos. */
export function renameJournal(history: UndoHistory, oldId: string, newId: string): UndoHistory {
  const journal = history.journals[oldId];
  if (!journal || oldId === newId) return history;
  const retag = (entries: UndoEntry[]) => entries.map((entry) => ({ ...entry, projectId: newId }));
  const journals = { ...history.journals };
  delete journals[oldId];
  journals[newId] = { ...journal, projectId: newId, undo: retag(journal.undo), redo: retag(journal.redo) };
  return {
    activeId: history.activeId === oldId ? newId : history.activeId, journals,
    order: history.order.filter((id) => id !== newId).map((id) => (id === oldId ? newId : id)),
  };
}

/** Olvida el diario de una propuesta (papelera, borrado). */
export function dropJournal(history: UndoHistory, projectId: string): UndoHistory {
  if (!history.journals[projectId]) return history;
  const journals = { ...history.journals };
  delete journals[projectId];
  return { activeId: history.activeId === projectId ? null : history.activeId, journals, order: history.order.filter((id) => id !== projectId) };
}

/** Lo que muestran los botones y el atajo para `projectId`: solo cuenta si su diario es el activo. */
export function undoAvailability(history: UndoHistory, projectId: string | null | undefined) {
  const journal = projectId && history.activeId === projectId ? history.journals[projectId] : undefined;
  return { canUndo: !!journal && journal.undo.length > 0, canRedo: !!journal && journal.redo.length > 0 };
}
