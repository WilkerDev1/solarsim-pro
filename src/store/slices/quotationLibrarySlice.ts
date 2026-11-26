import { canWrite } from '../../../shared/permissions';
import { isAssetRef } from '../../../shared/documentAssets';
import {
  validateQuotationSignature, validateQuotationTemplate, type LibraryValidation, type QuotationSignatureContent, type QuotationTemplateContent,
} from '../../../shared/quotations';
import type { QuotationLibrarySlice, SimulationSlice } from '../types';
import {
  emptyQuotationLibrary, type LibraryChange, type LibraryCollectionState, type LibraryKind, type LibraryMutationResult, type QuotationLibraryState,
  type QuotationSignature, type QuotationTemplate,
} from '../../types/quotationLibrary';
import { QuotationLibrarySyncService } from '../../services/quotationLibrarySyncService';
import { DocumentAssetService, DocumentAssetUploadError, assetRefFor } from '../../services/documentAssetService';
import { workspaceScope } from '../sync/organizationWorkspace';
import { contentEqual } from '../sync/projectDifferences';

type AnyRecord = QuotationTemplate | QuotationSignature;
type AnyContent = QuotationTemplateContent | QuotationSignatureContent;

const VALIDATORS: Record<LibraryKind, (raw: unknown) => LibraryValidation<AnyContent>> = {
  templates: validateQuotationTemplate,
  signatures: validateQuotationSignature,
};
const NOUN: Record<LibraryKind, string> = { templates: 'plantillas', signatures: 'firmas y sellos' };
const fail = (error: string) => ({ ok: false as const, error });

/** Contenido validado de un registro (sin identidad ni metadatos). */
export function libraryContent(kind: LibraryKind, record: AnyRecord | AnyContent): AnyContent | null {
  const result = VALIDATORS[kind](record);
  return result.ok ? result.value : null;
}

/** Ámbito de la predeterminada: una plantilla en total; una firma y un sello. */
const sameDefaultScope = (kind: LibraryKind, a: AnyContent, b: AnyContent) =>
  kind === 'templates' || (a as QuotationSignatureContent).kind === (b as QuotationSignatureContent).kind;

const inlineImage = (kind: LibraryKind, record: AnyContent | undefined) =>
  kind === 'signatures' && record && !isAssetRef((record as QuotationSignatureContent).image) ? (record as QuotationSignatureContent).image : null;

export const createQuotationLibrarySlice: SimulationSlice<QuotationLibrarySlice> = (set, get) => {
  let running: { generation: number; rerun: boolean; promise: Promise<{ success: boolean; message: string }> } | null = null;
  const account = () => get().syncSettings.currentUser;
  const writable = () => canWrite(account());
  const sync = () => {
    if (get().syncSettings.authToken && get().syncSettings.autoSyncEnabled) void get().syncQuotationLibraryWithServer();
  };
  const collection = <K extends LibraryKind>(kind: K) => get().quotationLibrary[kind] as unknown as LibraryCollectionState<AnyRecord>;
  const patch = (kind: LibraryKind, update: (state: LibraryCollectionState<AnyRecord>) => Partial<LibraryCollectionState<AnyRecord>>) =>
    set((s) => {
      const current = s.quotationLibrary[kind] as unknown as LibraryCollectionState<AnyRecord>;
      return { quotationLibrary: { ...s.quotationLibrary, [kind]: { ...current, ...update(current) } } as QuotationLibraryState };
    });
  const dirty = (kind: LibraryKind, previous: AnyRecord | null, id: string): Record<string, LibraryChange<AnyRecord>> => {
    const changes = collection(kind).changes;
    const { rejected: _retry, ...kept } = changes[id] ?? { revision: '', baseVersion: previous?.version ?? 0 };
    return { ...changes, [id]: { ...kept, revision: crypto.randomUUID(), ownerId: account()?.id } };
  };
  /** Marcar una predeterminada desmarca las demás de su ámbito (la API hace lo mismo y sube su versión). */
  const clearOtherDefaults = (kind: LibraryKind, items: AnyRecord[], keep: AnyRecord): AnyRecord[] =>
    keep.isDefault
      ? items.map((item) => (item.id !== keep.id && item.isDefault && sameDefaultScope(kind, item, keep) ? { ...item, isDefault: false } : item))
      : items;

  const create = (kind: LibraryKind, raw: Partial<AnyContent>): LibraryMutationResult<AnyRecord> => {
    if (!writable()) return fail(`Tu rol no permite crear ${NOUN[kind]}.`);
    const validation = VALIDATORS[kind](raw);
    if (!validation.ok) return fail(validation.error);
    const user = account(), now = new Date().toISOString();
    const record = {
      ...validation.value,
      id: `${kind === 'templates' ? 'qtemplate' : 'qsignature'}-${crypto.randomUUID()}`,
      ...(user?.organizationId ? { organizationId: user.organizationId } : {}),
      version: 0, baseVersion: 0, createdById: user?.id ?? '', createdBy: user?.name || 'Local', createdAt: now, updatedAt: now,
    } as AnyRecord;
    const changes = dirty(kind, null, record.id);
    patch(kind, (state) => ({ items: [...clearOtherDefaults(kind, state.items, record), record], changes }));
    sync();
    return { ok: true, record };
  };
  const update = (kind: LibraryKind, id: string, changes: Partial<AnyContent>): LibraryMutationResult<AnyRecord> => {
    if (!writable()) return fail(`Tu rol no permite editar ${NOUN[kind]}.`);
    const existing = collection(kind).items.find((item) => item.id === id);
    if (!existing) return fail(kind === 'templates' ? 'Plantilla no encontrada.' : 'Firma no encontrada.');
    const base = libraryContent(kind, existing) ?? existing;
    const validation = VALIDATORS[kind]({ ...base, ...changes, ...(kind === 'signatures' ? { kind: (existing as QuotationSignature).kind } : {}) });
    if (!validation.ok) return fail(validation.error);
    if (contentEqual(validation.value, base)) return { ok: true, record: existing };
    const record = { ...existing, ...validation.value, updatedAt: new Date().toISOString() } as AnyRecord;
    const nextChanges = dirty(kind, existing, id);
    patch(kind, (state) => ({ items: clearOtherDefaults(kind, state.items.map((item) => (item.id === id ? record : item)), record), changes: nextChanges }));
    sync();
    return { ok: true, record };
  };
  const remove = (kind: LibraryKind, id: string) => {
    if (!writable()) return fail(`Tu rol no permite eliminar ${NOUN[kind]}.`);
    const existing = collection(kind).items.find((item) => item.id === id);
    if (!existing) return fail('No encontrada.');
    patch(kind, (state) => {
      const { [id]: _dropped, ...changes } = state.changes;
      return {
        items: state.items.filter((item) => item.id !== id),
        changes,
        deletions: [...state.deletions.filter((d) => d.id !== id), { id, ownerId: account()?.id, baseVersion: existing.version, record: existing }],
      };
    });
    sync();
    return { ok: true as const };
  };

  const resolve = (kind: LibraryKind, id: string, resolution: 'accept_server' | 'keep_local') => {
    const state = collection(kind), change = state.changes[id], user = account();
    const refused = state.deletions.find((d) => d.id === id && d.rejected);
    if (!change && refused) {
      if (resolution === 'keep_local' && !writable()) return;
      patch(kind, (s) => resolution === 'keep_local'
        ? { items: s.items.filter((item) => item.id !== id), deletions: s.deletions.map((d) => (d.id === id ? { ...d, rejected: undefined } : d)) }
        : { deletions: s.deletions.filter((d) => d.id !== id), cursor: null });
      sync();
      return;
    }
    if (!change || (change.server === undefined && !change.rejected) || (change.ownerId && change.ownerId !== user?.id)) return;
    if (resolution === 'keep_local' && !writable()) return;
    const local = state.items.find((item) => item.id === id);
    patch(kind, (s) => {
      const { [id]: _current, ...changes } = s.changes;
      if (change.server === null) {
        if (resolution === 'accept_server' || !local) return { items: s.items.filter((item) => item.id !== id), changes };
        // Borrada en el servidor: conservar la copia local crea un registro nuevo (el id borrado no revive).
        const copy = { ...local, id: `${kind === 'templates' ? 'qtemplate' : 'qsignature'}-${crypto.randomUUID()}`, version: 0, baseVersion: 0 };
        return {
          items: [...s.items.filter((item) => item.id !== id), copy],
          changes: { ...changes, [copy.id]: { revision: crypto.randomUUID(), ownerId: user?.id, baseVersion: 0 } },
        };
      }
      if (change.server) {
        const server = change.server;
        if (resolution === 'accept_server') return { items: s.items.map((item) => (item.id === id ? server : item)), changes };
        return {
          items: s.items.map((item) => (item.id === id ? { ...item, version: server.version, baseVersion: server.version } : item)),
          changes: { ...changes, [id]: { revision: crypto.randomUUID(), ownerId: change.ownerId, baseVersion: server.version } },
        };
      }
      // Rechazo 4xx: reintentar tal cual, o descartar lo local (la próxima descarga es completa).
      if (resolution === 'keep_local') return { changes: { ...changes, [id]: { ...change, rejected: undefined, revision: crypto.randomUUID() } } };
      return local?.version ? { changes, cursor: null } : { items: s.items.filter((item) => item.id !== id), changes };
    });
    sync();
  };

  const syncKind = async (
    kind: LibraryKind,
    context: { current: () => boolean; own: (ownerId?: string) => boolean; scope: string; userId: string },
  ): Promise<number | 'changed'> => {
    const state = get().syncSettings;
    const transport = QuotationLibrarySyncService.transport(state.serverUrl, () => get().syncSettings.authToken || '');
    const assets = DocumentAssetService.transport(state.serverUrl, () => get().syncSettings.authToken || '');
    let failures = 0;
    const setChange = (id: string, value: Partial<LibraryChange<AnyRecord>>) =>
      patch(kind, (s) => (s.changes[id] ? { changes: { ...s.changes, [id]: { ...s.changes[id], ...value } } } : {}));
    /** La API guarda referencias: la copia local conserva su imagen en línea si es la misma (mismo sha256). */
    const keepLocalImage = async (server: AnyRecord, local: AnyRecord | undefined): Promise<AnyRecord> => {
      const image = inlineImage(kind, local);
      if (!image || (server as QuotationSignature).image !== (await assetRefFor(image))) return server;
      return { ...server, image } as AnyRecord;
    };
    const install = async (server: AnyRecord) => {
      const local = collection(kind).items.find((item) => item.id === server.id);
      const kept = await keepLocalImage(server, local);
      patch(kind, (s) => ({ items: s.items.some((item) => item.id === server.id) ? s.items.map((item) => (item.id === server.id ? kept : item)) : [...s.items, kept] }));
    };

    for (const command of [...collection(kind).deletions]) {
      if (!context.current()) return 'changed';
      if (!context.own(command.ownerId)) continue;
      if (command.rejected) { failures++; continue; }
      const release = () => patch(kind, (s) => ({ deletions: s.deletions.filter((d) => d.id !== command.id) }));
      if (!command.baseVersion) { release(); continue; }
      const result = await QuotationLibrarySyncService.remove<AnyRecord>(transport, kind, command.id, command.baseVersion);
      if (!context.current()) return 'changed';
      if (result.ok || result.status === 404 || (result.status === 409 && !result.record)) { release(); continue; }
      failures++;
      if (result.status === 409 && result.record) {
        // Un borrado obsoleto nunca se aplica a ciegas: la copia nueva del servidor vuelve a la lista.
        release();
        await install(result.record);
      } else if (result.status >= 400 && result.status < 500) {
        patch(kind, (s) => ({
          items: command.record && !s.items.some((item) => item.id === command.id) ? [...s.items, command.record as AnyRecord] : s.items,
          deletions: s.deletions.map((d) => (d.id === command.id ? { ...d, rejected: { status: result.status, error: result.error } } : d)),
        }));
      }
    }

    for (const id of Object.keys(collection(kind).changes)) {
      if (!context.current()) return 'changed';
      const change = collection(kind).changes[id];
      const local = collection(kind).items.find((item) => item.id === id);
      if (!change || !local || !context.own(change.ownerId)) continue;
      if (change.server !== undefined || change.rejected?.revision === change.revision) { failures++; continue; }
      let content = libraryContent(kind, local);
      if (!content) { failures++; continue; }
      const image = inlineImage(kind, content);
      if (image) {
        try {
          content = { ...content, image: await DocumentAssetService.ensureUploaded(assets, context.scope, image) } as AnyContent;
        } catch (error) {
          if (!(error instanceof DocumentAssetUploadError) || error.status >= 500) throw error;
          failures++;
          setChange(id, { rejected: { revision: change.revision, status: error.status, ...(error.code ? { code: error.code } : {}), error: error.message } });
          continue;
        }
      }
      const saved = await QuotationLibrarySyncService.put<AnyRecord>(transport, kind, id, content, change.baseVersion);
      if (!context.current()) return 'changed';
      // Recibo perdido: el servidor ya tiene exactamente este contenido.
      const receipt = saved.ok ? saved.record : saved.status === 409 && saved.record && contentEqual(libraryContent(kind, saved.record), content) ? saved.record : null;
      if (receipt) {
        const kept = await keepLocalImage(receipt, local);
        patch(kind, (s) => {
          const latest = s.changes[id];
          const changes = { ...s.changes };
          if (latest?.revision === change.revision) delete changes[id];
          else if (latest) changes[id] = { ...latest, baseVersion: receipt.version };
          return {
            items: s.items.map((item) => (item.id !== id ? item : latest?.revision === change.revision ? kept : { ...item, version: receipt.version, baseVersion: receipt.version })),
            changes,
          };
        });
        continue;
      }
      if (saved.ok) continue;
      failures++;
      if (saved.status === 409) setChange(id, { server: saved.record });
      else if (saved.status >= 400 && saved.status < 500)
        setChange(id, { rejected: { revision: change.revision, status: saved.status, ...(saved.code ? { code: saved.code } : {}), error: saved.error } });
    }

    const cursor = collection(kind).cursor;
    const since = cursor?.scope === context.scope && Number.isFinite(Date.parse(cursor.serverTimestamp)) ? cursor.serverTimestamp : null;
    const listed = await QuotationLibrarySyncService.list<AnyRecord>(transport, kind, since);
    if (!context.current()) return 'changed';
    if (!listed.supported) {
      const pending = Object.values(collection(kind).changes).some((c) => context.own(c.ownerId)) || collection(kind).deletions.some((d) => context.own(d.ownerId));
      return pending ? failures + 1 : failures;
    }
    const remote = new Map(listed.items.map((item) => [item.id, item]));
    const deleted = new Set(listed.deletedIds);
    const images = new Map<string, AnyRecord>();
    for (const server of remote.values()) {
      const local = collection(kind).items.find((item) => item.id === server.id);
      images.set(server.id, await keepLocalImage(server, local));
    }
    patch(kind, (s) => {
      const changes = { ...s.changes };
      for (const id of deleted) if (changes[id] && changes[id].server === undefined) changes[id] = { ...changes[id], server: null };
      const hidden = new Set(s.deletions.map((d) => d.id));
      const kept = s.items
        .filter((item) => changes[item.id] || (since ? !deleted.has(item.id) : remote.has(item.id)))
        .map((item) => (!changes[item.id] && images.has(item.id) ? images.get(item.id)! : item));
      const added = [...images.values()].filter((item) => !s.items.some((i) => i.id === item.id) && !changes[item.id] && !hidden.has(item.id));
      return {
        items: [...kept, ...added],
        changes,
        ...(listed.serverTimestamp ? { cursor: { scope: context.scope, serverTimestamp: listed.serverTimestamp } } : {}),
      };
    });
    return failures + Object.values(collection(kind).changes).filter((c) => c.server !== undefined && context.own(c.ownerId)).length;
  };

  return {
    quotationLibrary: emptyQuotationLibrary(),
    quotationLibrarySyncFeedback: null,

    createQuotationTemplate: (content) => create('templates', content) as LibraryMutationResult<QuotationTemplate>,
    updateQuotationTemplate: (id, changes) => update('templates', id, changes) as LibraryMutationResult<QuotationTemplate>,
    duplicateQuotationTemplate: (id) => {
      const source = collection('templates').items.find((item) => item.id === id) as QuotationTemplate | undefined;
      if (!source) return fail('Plantilla no encontrada.');
      const content = libraryContent('templates', source) as QuotationTemplateContent;
      return create('templates', { ...content, name: `${content.name} (copia)`.slice(0, 120), isDefault: false }) as LibraryMutationResult<QuotationTemplate>;
    },
    setDefaultQuotationTemplate: (id) => {
      if (id === null) {
        const current = collection('templates').items.find((item) => item.isDefault);
        if (!current) return { ok: true };
        const result = update('templates', current.id, { isDefault: false });
        return result.ok ? { ok: true } : result;
      }
      const result = update('templates', id, { isDefault: true });
      return result.ok ? { ok: true } : result;
    },
    deleteQuotationTemplate: (id) => remove('templates', id),
    createQuotationSignature: (content) => create('signatures', content) as LibraryMutationResult<QuotationSignature>,
    updateQuotationSignature: (id, changes) => update('signatures', id, changes) as LibraryMutationResult<QuotationSignature>,
    setDefaultQuotationSignature: (id) => {
      const result = update('signatures', id, { isDefault: true });
      return result.ok ? { ok: true } : result;
    },
    deleteQuotationSignature: (id) => remove('signatures', id),
    resolveQuotationLibraryConflict: resolve,

    syncQuotationLibraryWithServer: () => {
      const initial = get(), generation = initial.sessionGeneration, user = initial.syncSettings.currentUser;
      if (running?.generation === generation) {
        running.rerun = true;
        return running.promise;
      }
      if (!user || !initial.syncSettings.authToken) return Promise.resolve({ success: false, message: 'Inicia sesión para sincronizar plantillas y firmas.' });
      const scope = workspaceScope(initial.syncSettings);
      const current = () =>
        get().sessionGeneration === generation && get().syncSettings.currentUser?.id === user.id &&
        get().syncSettings.serverUrl === initial.syncSettings.serverUrl && workspaceScope(get().syncSettings) === scope;
      const context = { current, own: (ownerId?: string) => !ownerId || ownerId === user.id, scope, userId: user.id };
      const promise = (async () => {
        try {
          let failures = 0;
          for (const kind of ['templates', 'signatures'] as const) {
            const result = await syncKind(kind, context);
            if (result === 'changed') return { success: false, message: 'La sesión cambió.' };
            failures += result;
          }
          const message = failures ? `${failures} plantilla(s) o firma(s) pendientes: hay conflictos o rechazos del servidor. Revisa y sincroniza.` : null;
          set({ quotationLibrarySyncFeedback: message });
          return { success: !failures, message: message ?? 'Plantillas y firmas sincronizadas.' };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudieron sincronizar las plantillas y firmas.';
          if (current()) set({ quotationLibrarySyncFeedback: message });
          return { success: false, message };
        }
      })().finally(() => {
        if (running?.promise !== promise) return;
        const rerun = running.rerun;
        running = null;
        if (rerun && current() && !get().quotationLibrarySyncFeedback) queueMicrotask(() => { if (current()) void get().syncQuotationLibraryWithServer(); });
      });
      running = { generation, promise, rerun: false };
      return promise;
    },
  };
};
