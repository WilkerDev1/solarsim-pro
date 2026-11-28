import { canWrite } from '../../../shared/permissions';
import { assumptionFields } from '../../../shared/assumptions';
import {
  canTransitionQuotation, emptyQuotationContent, freezePrintedDesign, isQuotationContentLocked, validateQuotationContent, type QuotationContent,
} from '../../../shared/quotations';
import type { QuotationSlice, SimulationSlice, SimulationStore } from '../types';
import type { QuotationChange, QuotationMutationResult, QuotationRecord } from '../../types/quotation';
import { QuotationSyncService, type QuotationWriteResult } from '../../services/quotationSyncService';
import { workspaceScope } from '../sync/organizationWorkspace';
import { reuseArray, reuseIfEqual, reuseRecord } from '../sync/structuralSharing';
import {
  canonicalQuotationContent, confirmedLocalOnlyOf, declareQuotationApiSupport, keepLocalImages, keepLocalOnlyFields, localOnlyKey, nextLocalQuotationNumber, noteQuotationReceipt,
  planQuotationPush, quotationApiSupport, quotationContent, sameQuotationContent, serverTruth, withLocalOnlyOf, type LocalOnlySupport,
} from '../sync/quotationContent';
import { localIsoDate } from '../../utils/localDate';
import { contentEqual } from '../sync/projectDifferences';
import { DocumentAssetService } from '../../services/documentAssetService';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';
import { publishQuotationAssets, uploadedQuotationAttachments } from '../sync/quotationAssets';
import { trackAttachmentCopy } from '../sync/attachmentCopies';
import { UNKNOWN_DOCUMENT_ASSET, assetRefHash, isAssetRef } from '../../../shared/documentAssets';

const SESSION_CHANGED = { success: false, message: 'La sesión cambió.' };
const fail = (error: string) => ({ ok: false as const, error });
/** 409 codes for a link the API no longer accepts, and the field that holds it. */
const DEAD_LINK_CODES: Record<string, 'clientId' | 'folderId' | undefined> = { invalid_client: 'clientId', invalid_folder: 'folderId' };

type ReceiptState = Pick<SimulationStore, 'quotations' | 'quotationChanges' | 'quotationDeletionQueue'>;

/** Keeps identity and sync metadata of `record` and replaces its whole content (absent optional links stay absent). */
const withContent = (record: QuotationRecord, content: QuotationContent, updatedAt: string): QuotationRecord => {
  const metadata: Partial<QuotationRecord> = { ...record };
  for (const key of Object.keys(quotationContent(record)) as (keyof QuotationContent)[]) delete metadata[key];
  // Una nueva edición local de los campos «solo locales» vuelve a conservarlos tras «Usar la del servidor».
  if (metadata.discardLocalOnly && localOnlyKey(record) !== localOnlyKey(content)) delete metadata.discardLocalOnly;
  return { ...(metadata as QuotationRecord), ...content, updatedAt };
};

/** Server number once assigned; it never changes afterwards. */
const serverRecord = (
  server: QuotationRecord,
  local: QuotationRecord | undefined,
  { keepLocalOnly = true, support }: { keepLocalOnly?: boolean; support?: LocalOnlySupport } = {},
): QuotationRecord => {
  const { confirmedLocalOnly: _old, discardLocalOnly: _discard, ...plain } = server;
  const record = keepLocalImages({ ...plain, number: local?.number ?? server.number ?? null }, local);
  // Lo que una API anterior descarta (`dismissedSourceDocuments`, `alsoSeparate` de cada adjunto) se conserva, salvo al
  // elegir la copia del servidor (también en la descarga que sigue a «Usar la del servidor» de un rechazo). La copia del
  // servidor sin lo conservado queda en `confirmedLocalOnly`: es la base de los cambios (`serverTruth`).
  const keep = keepLocalOnly && !local?.discardLocalOnly;
  return { ...(keep ? keepLocalOnlyFields(record, local, support) : record), confirmedLocalOnly: confirmedLocalOnlyOf(server) };
};

/**
 * Installs a write receipt together with the change it clears, so a later failure in the pass cannot orphan it.
 * An intermediate step of a multi-PUT plan (`final` false) or a newer local revision keeps the change pending
 * with the server version as its new base.
 */
const installReceipt = (s: ReceiptState, id: string, revision: string, saved: QuotationRecord, final: boolean, support?: LocalOnlySupport): Partial<ReceiptState> => {
  const changes = { ...s.quotationChanges };
  const acknowledged = final && changes[id]?.revision === revision;
  if (acknowledged) delete changes[id];
  else if (changes[id]) changes[id] = { ...changes[id], baseVersion: saved.version, base: canonicalQuotationContent(saved) };
  return {
    quotations: s.quotations.map((q) => {
      if (q.id !== id) return q;
      if (acknowledged) return serverRecord(saved, q, { support });
      return {
        ...q, number: q.number ?? saved.number ?? null, version: saved.version, baseVersion: saved.version, confirmedLocalOnly: confirmedLocalOnlyOf(saved),
        organizationId: saved.organizationId ?? q.organizationId, createdById: saved.createdById || q.createdById,
        createdBy: saved.createdBy || q.createdBy, createdAt: saved.createdAt || q.createdAt,
      };
    }),
    quotationChanges: changes,
    quotationDeletionQueue: s.quotationDeletionQueue.map((c) => (c.id === id ? { ...c, baseVersion: saved.version } : c)),
  };
};

/**
 * Registro que vuelve a mostrarse tras una eliminación rechazada: la copia del servidor, o la local guardada en la orden
 * (que conserva su `confirmedLocalOnly`: no es una copia del servidor).
 */
function restoredRecord(shown: QuotationRecord, local: QuotationRecord | undefined, support: LocalOnlySupport): QuotationRecord {
  const record = serverRecord(shown, local, { support });
  if (shown !== local) return record;
  const { confirmedLocalOnly: _derived, ...rest } = record;
  return local.confirmedLocalOnly ? { ...rest, confirmedLocalOnly: local.confirmedLocalOnly } : rest;
}

/**
 * Contenido del reintento único tras un 400 `quotation_locked`: solo si el PUT era un cambio de estado de una bloqueada
 * sin otras ediciones (difiere de la copia del servidor solo en los campos «solo locales»). La copia del servidor sale de
 * la descarga de esta pasada o, si no vino (descarga incremental), de la base sin `dismissedSourceDocuments` (los
 * registros anteriores a `confirmedLocalOnly` solo pueden tener ese; `alsoSeparate` siempre tiene copia confirmada).
 * `null`: no se reintenta.
 */
function lockedRetry(server: QuotationRecord | undefined, base: QuotationContent | undefined, sent: QuotationContent, baseVersion: number): QuotationContent | null {
  const copy = server && server.version === baseVersion ? canonicalQuotationContent(server)
    : base ? canonicalQuotationContent(withLocalOnlyOf(base, { separateIds: new Set(base.attachments.filter((a) => a.alsoSeparate).map((a) => a.id)) })) : null;
  if (!copy || !isQuotationContentLocked(copy.status)) return null;
  const separateIds = new Set(copy.attachments.filter((a) => a.alsoSeparate).map((a) => a.id));
  const { status: _sent, ...rest } = canonicalQuotationContent(withLocalOnlyOf(sent, { dismissedSourceDocuments: copy.dismissedSourceDocuments, separateIds }));
  const { status: _saved, ...stored } = copy;
  if (!contentEqual(rest, stored) || contentEqual(copy, canonicalQuotationContent(sent))) return null;
  return { ...copy, status: sent.status };
}

export const createQuotationSlice: SimulationSlice<QuotationSlice> = (set, get) => {
  let running: { generation: number; rerun: boolean; promise: Promise<{ success: boolean; message: string }> } | null = null;
  const account = () => get().syncSettings.currentUser;
  const writable = () => canWrite(account());
  const sync = () => {
    if (get().syncSettings.authToken && get().syncSettings.autoSyncEnabled) void get().syncQuotationsWithServer();
  };
  /** New revision of `previous` (the record before the edit): its confirmed content becomes the base of a new change. */
  const dirty = (previous: QuotationRecord): Record<string, QuotationChange> => {
    const changes = get().quotationChanges, existing = changes[previous.id];
    // Editing keeps the quotation: a pending deletion conflict becomes an ordinary (version) conflict.
    const { rejected: _retry, deletionConflict: _keep, ...kept } = existing ?? {
      revision: '', baseVersion: previous.baseVersion ?? previous.version ?? 0,
      // La base es lo que el servidor tiene (sin lo conservado solo aquí): ver `serverTruth`.
      ...(previous.version ? { base: canonicalQuotationContent(serverTruth(previous)) } : {}),
    };
    return { ...changes, [previous.id]: { ...kept, revision: crypto.randomUUID(), ownerId: account()?.id } };
  };
  const linkError = (content: QuotationContent, previous?: QuotationContent): string | null => {
    const state = get();
    if (content.clientId && content.clientId !== previous?.clientId && !state.clients.some((c) => c.id === content.clientId)) return 'Cliente no encontrado.';
    if (content.folderId && content.folderId !== previous?.folderId && !state.folders.some((f) => f.id === content.folderId)) return 'Carpeta no encontrada.';
    return null;
  };
  /** Adds a new draft: local workspaces number it now, organization workspaces wait for the server. */
  const insert = (content: QuotationContent): QuotationMutationResult => {
    const state = get(), user = account(), now = new Date().toISOString();
    const numbering = user ? null : nextLocalQuotationNumber(state.quotationNumberCounters, state.quotations, content.issueDate);
    const quotation: QuotationRecord = {
      ...content,
      id: `quotation-${crypto.randomUUID()}`,
      number: numbering?.number ?? null,
      ...(user?.organizationId ? { organizationId: user.organizationId } : {}),
      version: 0,
      baseVersion: 0,
      createdById: user?.id ?? '',
      createdBy: user?.name || 'Local',
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      quotations: [...s.quotations, quotation],
      quotationChanges: { ...s.quotationChanges, [quotation.id]: { revision: crypto.randomUUID(), ownerId: user?.id, baseVersion: 0 } },
      ...(numbering ? { quotationNumberCounters: numbering.counters } : {}),
    }));
    sync();
    return { ok: true, quotation };
  };
  /** Validated content replacement of an existing quotation. */
  const replace = (existing: QuotationRecord, raw: QuotationContent): QuotationMutationResult => {
    const validation = validateQuotationContent(raw);
    if (!validation.ok) return fail(validation.error);
    const error = linkError(validation.value, existing);
    if (error) return fail(error);
    const quotation = withContent(existing, validation.value, new Date().toISOString());
    set({ quotations: get().quotations.map((q) => (q.id === existing.id ? quotation : q)), quotationChanges: dirty(existing) });
    sync();
    return { ok: true, quotation };
  };
  const editable = (id: string, action: string): QuotationRecord | string => {
    if (!writable()) return `Tu rol no permite ${action} cotizaciones.`;
    const existing = get().quotations.find((q) => q.id === id);
    if (!existing) return 'Cotización no encontrada.';
    return existing;
  };
  const unlocked = (existing: QuotationRecord): string | null =>
    isQuotationContentLocked(existing.status) ? 'La cotización no es un borrador: reábrela para cambiar su contenido.' : null;

  return {
    quotations: [],
    quotationChanges: {},
    quotationDeletionQueue: [],
    quotationSyncCursor: null,
    quotationNumberCounters: {},
    quotationSyncFeedback: null,
    quotationAssetIssues: {},

    createQuotationRecord: (overrides = {}) => {
      if (!writable()) return fail('Tu rol no permite crear cotizaciones.');
      const state = get(), user = account();
      // The exchange rate new proposals start with (ADR 0003 factory) and the seller already known to the store.
      const exchangeRate = assumptionFields(undefined, state.defaultSimulationSettings).specs.dopExchangeRate;
      const seller = user ? user.name : state.localUserProfile?.name ?? '';
      const validation = validateQuotationContent(emptyQuotationContent(localIsoDate(), { exchangeRate, seller, ...overrides, status: 'draft' }));
      if (!validation.ok) return fail(validation.error);
      const error = linkError(validation.value);
      if (error) return fail(error);
      return insert(validation.value);
    },
    updateQuotationRecord: (id, patch) => {
      const existing = editable(id, 'editar');
      if (typeof existing === 'string') return fail(existing);
      const locked = unlocked(existing);
      if (locked) return fail(locked);
      const { status: _status, ...rest } = patch;
      return replace(existing, { ...quotationContent(existing), ...rest, status: existing.status });
    },
    setQuotationStatus: (id, status) => {
      const existing = editable(id, 'cambiar el estado de');
      if (typeof existing === 'string') return fail(existing);
      if (!canTransitionQuotation(existing.status, status)) return fail('Cambio de estado no permitido.');
      // Al salir de borrador se fija la copia de la firma y el sello que se imprimen: la biblioteca ya no la cambia.
      const design = existing.status === 'draft' && isQuotationContentLocked(status)
        ? freezePrintedDesign(existing.design, get().quotationLibrary.signatures.items)
        : existing.design;
      return replace(existing, { ...quotationContent(existing), design, status });
    },
    duplicateQuotationRecord: (id) => {
      if (!writable()) return fail('Tu rol no permite crear cotizaciones.');
      const state = get(), source = state.quotations.find((q) => q.id === id);
      if (!source) return fail('Cotización no encontrada.');
      const today = localIsoDate();
      const content: QuotationContent = {
        ...quotationContent(source),
        status: 'draft',
        issueDate: today,
        validUntil: source.validUntil && source.validUntil >= today ? source.validUntil : null,
      };
      // Links to records that no longer exist are not copied.
      if (content.clientId && !state.clients.some((c) => c.id === content.clientId)) delete content.clientId;
      if (content.folderId && !state.folders.some((f) => f.id === content.folderId)) delete content.folderId;
      // Adjuntos propios con id nuevo y sus bytes copiados: quitar uno en la copia nunca borra los del original. Las
      // fichas del catálogo conservan su id (el mismo en todas las cotizaciones: son una caché del activo del equipo).
      const copies: [string, string][] = [];
      content.attachments = content.attachments.map((attachment) => {
        if (attachment.origin === 'catalog') return attachment;
        const id = `attachment-${crypto.randomUUID()}`;
        copies.push([attachment.id, id]);
        return { ...attachment, id };
      });
      const validation = validateQuotationContent(content);
      if (!validation.ok) return fail(validation.error);
      const result = insert(validation.value);
      if (result.ok) {
        const names = new Map(content.attachments.map((a) => [a.id, a.fileName]));
        for (const [from, to] of copies)
          trackAttachmentCopy(from, PDFAttachmentStorage.getAttachment(from)
            .then((bytes) => (bytes ? PDFAttachmentStorage.saveAttachment(to, result.quotation.id, names.get(to) ?? '', bytes) : undefined))
            .catch(() => undefined));
      }
      return result;
    },
    deleteQuotationRecord: (id) => {
      const existing = editable(id, 'eliminar');
      if (typeof existing === 'string') return fail(existing);
      const state = get(), changes = { ...state.quotationChanges };
      delete changes[id];
      set({
        quotations: state.quotations.filter((q) => q.id !== id),
        quotationChanges: changes,
        quotationDeletionQueue: [
          ...state.quotationDeletionQueue.filter((c) => c.id !== id),
          { id, ownerId: account()?.id, baseVersion: existing.version ?? 0, quotation: existing },
        ],
      });
      sync();
      return { ok: true };
    },
    linkQuotationToClient: (id, clientId) => {
      const existing = editable(id, 'enlazar');
      if (typeof existing === 'string') return fail(existing);
      if ((existing.clientId ?? null) === clientId) return { ok: true };
      const locked = unlocked(existing);
      if (locked) return fail(locked);
      if (clientId && !get().clients.some((c) => c.id === clientId)) return fail('Cliente no encontrado.');
      const result = replace(existing, { ...quotationContent(existing), clientId: clientId || undefined });
      return result.ok ? { ok: true } : result;
    },
    moveQuotationToFolder: (id, folderId) => {
      const existing = editable(id, 'organizar');
      if (typeof existing === 'string') return fail(existing);
      if ((existing.folderId ?? null) === folderId) return { ok: true };
      const locked = unlocked(existing);
      if (locked) return fail(locked);
      if (folderId && !get().folders.some((f) => f.id === folderId)) return fail('Carpeta no encontrada.');
      const result = replace(existing, { ...quotationContent(existing), folderId: folderId || undefined });
      return result.ok ? { ok: true } : result;
    },
    resolveQuotationConflict: (id, resolution) => {
      const state = get(), change = state.quotationChanges[id], user = account();
      const refused = state.quotationDeletionQueue.find((c) => c.id === id && c.rejected);
      if (!change && refused) {
        // Deletion rejected by the API (4xx): retry it, or discard it and keep the quotation.
        if ((refused.ownerId && refused.ownerId !== user?.id) || (resolution === 'keep_local' && !writable())) return;
        if (resolution === 'keep_local') {
          const { rejected: _retry, ...command } = refused;
          set({
            quotations: state.quotations.filter((q) => q.id !== id),
            quotationDeletionQueue: state.quotationDeletionQueue.map((c) => (c.id === id ? command : c)),
            quotationSyncFeedback: null,
          });
        } else {
          // The copy shown may be older than the server's: the next pull is a full one and brings it.
          set({
            quotationDeletionQueue: state.quotationDeletionQueue.filter((c) => c.id !== id),
            quotationSyncCursor: null,
            quotationSyncFeedback: null,
          });
        }
        sync();
        return;
      }
      if (!(change?.serverQuotation || change?.serverDeleted || change?.rejected) || (change.ownerId && change.ownerId !== user?.id)) return;
      // Discarding local work is always allowed to its owner; keeping it requires write access.
      if (resolution === 'keep_local' && !writable()) return;
      const changes = { ...state.quotationChanges };
      const local = state.quotations.find((q) => q.id === id);
      const support = quotationApiSupport(state.syncSettings.serverUrl);
      if (change.serverDeleted) {
        // The id is a tombstone: keeping the edits creates a new draft with a new id and no number.
        delete changes[id];
        set({ quotations: state.quotations.filter((q) => q.id !== id), quotationChanges: changes, quotationSyncFeedback: null });
        if (resolution === 'keep_local' && local) insert(validateQuotationContent({ ...quotationContent(local), status: 'draft' }).ok
          ? { ...quotationContent(local), status: 'draft' } : quotationContent(local));
        return;
      }
      if (change.serverQuotation) {
        const server = change.serverQuotation;
        if (change.deletionConflict && resolution === 'keep_local') {
          // A stale deletion kept: deleted again against the newest server version known.
          delete changes[id];
          set({
            quotations: state.quotations.filter((q) => q.id !== id),
            quotationChanges: changes,
            quotationDeletionQueue: [
              ...state.quotationDeletionQueue.filter((c) => c.id !== id),
              { id, ownerId: user?.id, baseVersion: server.version, quotation: serverRecord(server, local, { support }) },
            ],
            quotationSyncFeedback: null,
          });
          sync();
          return;
        }
        if (resolution === 'accept_server') {
          delete changes[id];
          set({
            // «Usar la del servidor»: su contenido tal cual, también sin la lista local de documentos quitados.
            quotations: [...state.quotations.filter((q) => q.id !== id), serverRecord(server, local, { keepLocalOnly: false })],
            quotationChanges: changes,
            quotationSyncFeedback: null,
          });
        } else {
          changes[id] = { revision: crypto.randomUUID(), ownerId: change.ownerId, baseVersion: server.version, base: canonicalQuotationContent(server) };
          set({
            quotations: state.quotations.map((q) => (q.id === id
              ? { ...q, number: q.number ?? server.number, version: server.version, baseVersion: server.version, confirmedLocalOnly: confirmedLocalOnlyOf(server) }
              : q)),
            quotationChanges: changes,
            quotationSyncFeedback: null,
          });
          sync();
        }
        return;
      }
      // Rejected by the API (4xx): retry as is, or drop the local edits and restore the server copy on a full pull.
      if (resolution === 'keep_local') {
        const { rejected: _rejected, ...kept } = change;
        changes[id] = { ...kept, revision: crypto.randomUUID() };
        set({ quotationChanges: changes, quotationSyncFeedback: null });
      } else {
        delete changes[id];
        const published = !!local?.version;
        set({
          // La descarga completa que sigue instala la copia del servidor sin volver a añadir lo local (`discardLocalOnly`).
          quotations: published
            ? state.quotations.map((q) => (q.id === id ? { ...q, discardLocalOnly: true as const } : q))
            : state.quotations.filter((q) => q.id !== id),
          quotationChanges: changes,
          quotationSyncCursor: published ? null : state.quotationSyncCursor,
          quotationSyncFeedback: null,
        });
      }
      sync();
    },
    syncQuotationsWithServer: () => {
      const initial = get(), generation = initial.sessionGeneration, user = initial.syncSettings.currentUser;
      if (running?.generation === generation) {
        running.rerun = true;
        return running.promise;
      }
      if (!user || !initial.syncSettings.authToken)
        return Promise.resolve({ success: false, message: 'Inicia sesión para sincronizar cotizaciones.' });
      const scope = workspaceScope(initial.syncSettings);
      const current = () =>
        get().sessionGeneration === generation &&
        get().syncSettings.currentUser?.id === user.id &&
        get().syncSettings.serverUrl === initial.syncSettings.serverUrl &&
        workspaceScope(get().syncSettings) === scope;
      const own = (ownerId?: string) => !ownerId || ownerId === user.id;
      const transport = QuotationSyncService.transport(initial.syncSettings.serverUrl, () => get().syncSettings.authToken || '');
      // Se relee en cada uso: un recibo de esta misma pasada puede revelar que la API guarda los campos «solo locales».
      const support = () => quotationApiSupport(initial.syncSettings.serverUrl);
      const assets = DocumentAssetService.transport(initial.syncSettings.serverUrl, () => get().syncSettings.authToken || '');
      const promise = (async () => {
        try {
          const cursor = get().quotationSyncCursor;
          const since = cursor?.scope === scope && Number.isFinite(Date.parse(cursor.serverTimestamp)) ? cursor.serverTimestamp : null;
          const listed = await QuotationSyncService.list(transport, since);
          // A response that arrives after a workspace change belongs to another workspace: it is discarded.
          if (!current()) return SESSION_CHANGED;
          // La API nueva declara qué campos «solo locales» guarda: se sabe antes de instalar nada de esta pasada.
          if (listed.supported) declareQuotationApiSupport(initial.syncSettings.serverUrl, listed.localOnlyFieldsStored);
          if (!listed.supported) {
            const pending = Object.values(get().quotationChanges).some((c) => own(c.ownerId)) || get().quotationDeletionQueue.some((c) => own(c.ownerId));
            const message = 'El servidor aún no admite cotizaciones.';
            set({ quotationSyncFeedback: pending ? message : null });
            return { success: !pending, message };
          }
          const full = !since;
          const remote = new Map(listed.quotations.map((q) => [q.id, q]));
          const deleted = new Set(listed.deletedIds);
          let failures = 0;
          const patchChange = (id: string, patch: Partial<QuotationChange>, baseVersion = 0) =>
            set((s) => {
              const { serverQuotation: _s, serverDeleted: _d, rejected: _r, deletionConflict: _c, ...kept } =
                s.quotationChanges[id] ?? { revision: crypto.randomUUID(), ownerId: user.id, baseVersion };
              return { quotationChanges: { ...s.quotationChanges, [id]: { ...kept, ...patch } } };
            });
          const conflict = (id: string, serverQuotation: QuotationRecord, baseVersion?: number) => patchChange(id, { serverQuotation }, baseVersion);
          const tombstone = (id: string) => patchChange(id, { serverDeleted: true });
          const reject = (id: string, revision: string, result: Extract<QuotationWriteResult, { ok: false }>) =>
            patchChange(id, { rejected: { revision, status: result.status, ...(result.code ? { code: result.code } : {}), error: result.error } });

          for (const command of [...get().quotationDeletionQueue]) {
            if (!current()) return SESSION_CHANGED;
            if (!own(command.ownerId)) continue;
            const release = () => set((s) => ({ quotationDeletionQueue: s.quotationDeletionQueue.filter((c) => c.id !== command.id) }));
            // Already deleted on the server (also after a rejected attempt): nothing left to do.
            if (deleted.has(command.id)) {
              release();
              continue;
            }
            if (command.rejected) {
              // Rejected deletions wait for the user to retry or discard them: no retry loop.
              failures++;
              continue;
            }
            // Never-published drafts are dropped without a request.
            if (!remote.has(command.id) && command.baseVersion === 0) {
              release();
              continue;
            }
            const result = await QuotationSyncService.remove(transport, command.id, command.baseVersion);
            if (!current()) return SESSION_CHANGED;
            // 404: it never existed; 409 without a record: it is already deleted (with another version).
            if (result.ok || result.status === 404 || (result.status === 409 && !result.quotation)) {
              remote.delete(command.id);
              deleted.add(command.id);
              release();
              continue;
            }
            failures++;
            if (result.status === 409 && result.quotation) {
              // A stale deletion is never applied blindly: the server record returns for review as a deletion conflict.
              const server = result.quotation;
              set((s) => ({
                quotations: [...s.quotations.filter((q) => q.id !== command.id), serverRecord(server, command.quotation, { support: support() })],
                quotationDeletionQueue: s.quotationDeletionQueue.filter((c) => c.id !== command.id),
              }));
              patchChange(command.id, { serverQuotation: server, deletionConflict: true }, command.baseVersion);
            } else if (result.status >= 400 && result.status < 500) {
              // Not retried by itself (e.g. 403 after losing the role): the quotation is shown again with the error.
              const shown = remote.get(command.id) ?? command.quotation;
              set((s) => ({
                quotations: shown && !s.quotations.some((q) => q.id === command.id)
                  ? [...s.quotations, restoredRecord(shown, command.quotation, support())]
                  : s.quotations,
                quotationDeletionQueue: s.quotationDeletionQueue.map((c) =>
                  c.id === command.id ? { ...c, rejected: { status: result.status, error: result.error } } : c),
              }));
            }
          }

          for (const id of Object.keys(get().quotationChanges)) {
            if (!current()) return SESSION_CHANGED;
            // Read now, not from a copy taken when the loop started: earlier PUTs await, and the user may resolve
            // or edit this change meanwhile.
            const change = get().quotationChanges[id];
            const local = get().quotations.find((q) => q.id === id);
            if (!change || !local) continue;
            const newer = remote.get(id);
            const waits = (c: QuotationChange) => !own(c.ownerId) || !!c.serverQuotation || c.rejected?.revision === c.revision;
            const waiting = waits(change);
            if (waiting && !change.serverDeleted && newer && newer.version > (change.serverQuotation?.version ?? change.baseVersion)) {
              // A newer server copy of a quotation that is not pushed in this pass is kept in its conflict, so the
              // cursor can advance without losing it: `accept_server` always installs the newest copy known.
              set((s) => {
                const latest = s.quotationChanges[id];
                if (!latest || !waits(latest) || latest.serverDeleted) return {};
                const { rejected: _r, ...kept } = latest;
                return { quotationChanges: { ...s.quotationChanges, [id]: { ...kept, serverQuotation: newer } } };
              });
            }
            if (!own(change.ownerId)) {
              // A teammate's retained change is never uploaded here, but a tombstone still protects it for its owner.
              if (deleted.has(id) && !change.serverDeleted) tombstone(id);
              continue;
            }
            if (deleted.has(id)) {
              // Deleted by a teammate while this device holds unsynced edits: kept for review, never pushed.
              tombstone(id);
              failures++;
              continue;
            }
            if (waiting || change.serverDeleted) {
              // Unresolved conflicts and 4xx rejections wait for the user (or a new edit): no retry loop.
              failures++;
              continue;
            }
            // Logo, thumbnails and attachments travel as `asset:sha256:` references: upload what this device has.
            const { pending, issues } = await publishQuotationAssets(local, {
              scope,
              base: change.base,
              upload: (dataUrl) => DocumentAssetService.ensureUploaded(assets, scope, dataUrl),
              attachmentBytes: (attachmentId) => PDFAttachmentStorage.getAttachment(attachmentId),
            });
            if (!current()) return SESSION_CHANGED;
            // Definitive refusals (413/415…): published without that image or attachment, with a notice saying what to do.
            set((s) => {
              const { [id]: _previous, ...others } = s.quotationAssetIssues;
              return { quotationAssetIssues: issues.length ? { ...others, [id]: issues } : others };
            });
            const assetsPending = pending.length ? `No se pudo subir ${pending.join(', ')}: se reintentará en la próxima sincronización.` : undefined;
            if ((get().quotationChanges[id]?.assetsPending) !== assetsPending)
              set((s) => {
                const latest = s.quotationChanges[id];
                if (!latest) return {};
                const { assetsPending: _old, ...rest } = latest;
                return { quotationChanges: { ...s.quotationChanges, [id]: assetsPending ? { ...rest, assetsPending } : rest } };
              });
            if (assetsPending) {
              // Never published without its images or attachments: an empty slot would erase them on the server.
              failures++;
              continue;
            }
            const serverCopy = remote.get(id);
            // `alsoSeparate` ausente en el servidor solo se da por descartado si el servidor ya pudo recibirlo (su versión
            // va por delante de la base): con la misma versión, un destino recién marcado es un cambio por publicar.
            if (serverCopy && sameQuotationContent(serverCopy, local, { separate: serverCopy.version > change.baseVersion }, support())) {
              // Recover a lost PUT receipt only from identical authoritative content.
              set((s) => installReceipt(s, id, change.revision, serverCopy, true, support()));
              continue;
            }
            if (serverCopy && change.baseVersion === 0) {
              failures++;
              conflict(id, serverCopy);
              continue;
            }
            if (!serverCopy && change.baseVersion === 0 && local.status === 'void') {
              // Never published and voided offline: like a never-published draft, it is discarded without a request
              // (the API only creates drafts or issued quotations).
              set((s) => {
                if (s.quotationChanges[id]?.revision !== change.revision) return {};
                const { [id]: _void, ...changes } = s.quotationChanges;
                return { quotations: s.quotations.filter((q) => q.id !== id), quotationChanges: changes };
              });
              continue;
            }
            const plan = planQuotationPush(change.base, local, support());
            if (!plan.length) {
              // Back to the confirmed content (e.g. reopened and issued again without edits): nothing to publish.
              set((s) => {
                if (s.quotationChanges[id]?.revision !== change.revision) return {};
                const { [id]: _done, ...changes } = s.quotationChanges;
                return { quotationChanges: changes };
              });
              continue;
            }
            let baseVersion = change.baseVersion;
            for (const [index, content] of plan.entries()) {
              let sent = content;
              let saved = await QuotationSyncService.put(transport, id, sent, baseVersion);
              if (!current()) return SESSION_CHANGED;
              const retry = !saved.ok && saved.status === 400 && saved.code === 'quotation_locked' ? lockedRetry(remote.get(id), change.base, sent, baseVersion) : null;
              if (retry) {
                // Respaldo: un cambio de estado sin otras ediciones que la API toma por una edición de la bloqueada (los
                // campos «solo locales» no coinciden con lo guardado) se reintenta una vez con la copia del servidor.
                sent = retry;
                saved = await QuotationSyncService.put(transport, id, sent, baseVersion);
                if (!current()) return SESSION_CHANGED;
              }
              if (saved.ok) {
                noteQuotationReceipt(initial.syncSettings.serverUrl, sent, saved.quotation);
                remote.set(id, saved.quotation);
                baseVersion = saved.quotation.version;
                const receipt = saved.quotation;
                set((s) => installReceipt(s, id, change.revision, receipt, index === plan.length - 1, support()));
                continue;
              }
              failures++;
              const deadLink = saved.status === 409 ? DEAD_LINK_CODES[saved.code ?? ''] : undefined;
              if (deadLink) {
                // The linked client/folder was deleted or is not accessible: only the link goes (the printed client
                // stays) and the change stays pending for the next pass; it is not a version conflict.
                set((s) => ({
                  quotations: s.quotations.map((q) => {
                    if (q.id !== id || !q[deadLink]) return q;
                    const { [deadLink]: _dead, ...rest } = q;
                    return rest as QuotationRecord;
                  }),
                }));
              } else if (saved.status === 400 && saved.code === UNKNOWN_DOCUMENT_ASSET) {
                // The server lacks an asset this quotation references: forget it as uploaded, so the next pass uploads
                // it again from this device. Without its bytes here no retry can help: it waits for the user.
                const missing = saved.missing ?? [];
                DocumentAssetService.forgetUploaded(scope, missing);
                uploadedQuotationAttachments.forgetHashes(missing);
                const lost = new Set(missing);
                const missingHere: string[] = [];
                for (const attachment of local.attachments) {
                  if (!attachment.assetId || !isAssetRef(attachment.assetId) || !lost.has(assetRefHash(attachment.assetId))) continue;
                  if (!(await PDFAttachmentStorage.getAttachment(attachment.id).catch(() => null))) missingHere.push(`«${attachment.title || attachment.fileName}»`);
                }
                if (missingHere.length) {
                  reject(id, change.revision, {
                    ...saved,
                    error: `El servidor no tiene ${missingHere.join(', ')} y este equipo tampoco: quita el adjunto o súbelo desde el equipo que lo tiene.`,
                  });
                } else {
                  set((s) => (s.quotationChanges[id]
                    ? { quotationChanges: { ...s.quotationChanges, [id]: { ...s.quotationChanges[id], assetsPending: 'El servidor no tiene un adjunto o una imagen de este equipo: se volverá a subir en la próxima sincronización.' } } }
                    : {}));
                }
              } else if (saved.status === 409) {
                if (saved.quotation) conflict(id, saved.quotation);
                else tombstone(id);
              } else if (saved.status >= 400 && saved.status < 500) {
                reject(id, change.revision, saved);
              }
              break;
            }
          }

          if (!current()) return SESSION_CHANGED;
          set((s) => {
            // Unsynced edits to a tombstoned quotation stay as a deletion conflict; everything else about it is dropped.
            const changes = reuseRecord(s.quotationChanges, Object.fromEntries(
              Object.entries(s.quotationChanges).filter(([id, c]) => !deleted.has(id) || (c.serverDeleted && s.quotations.some((q) => q.id === id))),
            ));
            const hidden = new Set(s.quotationDeletionQueue.filter((c) => !c.rejected).map((c) => c.id));
            const known = new Map(s.quotations.map((q) => [q.id, q]));
            const install = (server: QuotationRecord) => reuseIfEqual(known.get(server.id), serverRecord(server, known.get(server.id), { support: support() }));
            // A full pull is the whole list; a partial one (`since`) only brings changes and tombstones.
            const kept = s.quotations
              .filter((q) => changes[q.id] || (full ? remote.has(q.id) : !deleted.has(q.id)))
              .map((q) => (!changes[q.id] && remote.has(q.id) ? install(remote.get(q.id)!) : q));
            const added = [...remote.values()].filter((q) => !known.has(q.id) && !changes[q.id] && !hidden.has(q.id)).map(install);
            const quotations = reuseArray(s.quotations, [...kept, ...added]);
            const unresolved = Object.values(changes).some((c) => (c.serverQuotation || c.serverDeleted || c.rejected?.revision === c.revision) && own(c.ownerId));
            const refusedDeletions = s.quotationDeletionQueue.some((c) => c.rejected && own(c.ownerId));
            return {
              quotations,
              quotationChanges: changes,
              // The cursor is stored only with the download it describes, fully applied.
              ...(listed.serverTimestamp ? { quotationSyncCursor: { scope, serverTimestamp: listed.serverTimestamp } } : {}),
              quotationSyncFeedback: failures || unresolved || refusedDeletions
                ? `${failures} cotización(es) pendientes: hay conflictos, rechazos del servidor, subidas de imágenes o adjuntos pendientes o permisos distintos. Revisa y sincroniza.`
                : null,
            };
          });
          return { success: failures === 0, message: failures ? get().quotationSyncFeedback! : 'Cotizaciones sincronizadas.' };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudieron sincronizar las cotizaciones.';
          if (current()) set({ quotationSyncFeedback: message });
          return { success: false, message };
        }
      })().finally(() => {
        if (running?.promise !== promise) return;
        const rerun = running.rerun;
        running = null;
        // Repeat only when local edits arrived during a successful pass; errors require review.
        if (rerun && current() && !get().quotationSyncFeedback)
          queueMicrotask(() => {
            if (current()) void get().syncQuotationsWithServer();
          });
      });
      running = { generation, promise, rerun: false };
      return promise;
    },
  };
};
