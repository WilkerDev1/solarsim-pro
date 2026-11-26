import { SHA256_HEX, assetRef, assetRefHash, isAssetCandidate, isAssetRef, mapDocumentAssetFields, replaceAssetRefs } from '../../../shared/documentAssets';
import type { PersistCodec, TextStorage } from './deferredStorage';

/**
 * Imágenes del documento guardadas una sola vez en la persistencia local.
 *
 * Los logos (`customization.*LogoBase64`, logos de la empresa) y las miniaturas de anexos se repetían en cada
 * propuesta, versión del historial, cola, conflicto y archivo de organización: ~98% de cada escritura, que serializa
 * todo el espacio en el hilo principal. Al escribir, cada imagen se sustituye por `asset:sha256:<hex>` (mismo
 * formato que la API, `shared/documentAssets.ts`) y su contenido se guarda una vez en la clave `<nombre>-assets`.
 * Al hidratar se expanden: el store, el PDF, la publicación web y la sincronización siguen viendo el base64.
 *
 * El hash (SubtleCrypto, asíncrono) nunca bloquea una escritura: una imagen sin hash conocido se escribe en línea y,
 * cuando el hash llega, `onLearned` pide reescribir. Cada texto se calcula una sola vez por sesión, y los objetos sin
 * cambios reutilizan su versión colapsada. Nunca se escribe una referencia cuyo contenido no esté ya guardado.
 */
export type DocumentAssetHasher = (text: string) => Promise<string | null>;

const COMPANY_IMAGE_FIELDS = ['logoBase64', 'watermarkLogoBase64', 'signatureSealBase64'] as const;
export const persistedAssetsKey = (name: string) => `${name}-assets`;

/**
 * Cotizaciones: `issuer.logo` y `attachments[].thumbnailDataUrl`. Una imagen en línea se guarda con su propio prefijo
 * (`quotation-asset:sha256:`), no con `asset:sha256:`, porque en una cotización una referencia `asset:sha256:` es un
 * dato del servidor que debe volver a publicarse tal cual: expandirla al hidratar la convertiría en una imagen en
 * línea que la sincronización enviaría vacía. Por eso las claves de cotizaciones quedan fuera de la expansión general
 * y solo se expande su prefijo propio.
 */
const QUOTATION_IMAGE_PREFIX = 'quotation-asset:sha256:';
const QUOTATION_KEYS = ['quotations', 'quotationChanges', 'quotationDeletionQueue'] as const;

const subtleSha256: DocumentAssetHasher = async (text) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

type Rec = Record<string, any>;
const isRecord = (value: unknown): value is Rec => !!value && typeof value === 'object' && !Array.isArray(value);
interface Pass { used: Set<string>; pending: boolean }

const mapArray = (value: unknown, map: (item: any) => any) => {
  if (!Array.isArray(value)) return value;
  let changed = false;
  const next = value.map((item) => { const out = map(item); if (out !== item) changed = true; return out; });
  return changed ? next : value;
};
const mapRecord = (value: unknown, map: (item: any) => any) => {
  if (!isRecord(value)) return value;
  let next: Rec | null = null;
  for (const [key, item] of Object.entries(value)) {
    const out = map(item);
    if (out !== item) (next ??= { ...value })[key] = out;
  }
  return next ?? value;
};
const withField = (value: unknown, field: string, map: (item: any) => any) => {
  if (!isRecord(value) || value[field] === undefined) return value;
  const out = map(value[field]);
  return out === value[field] ? value : { ...value, [field]: out };
};
/** Copy of a quotation with each non-empty image passed through `map`; unchanged → same object. */
const mapQuotationImages = (value: unknown, map: (text: string) => string): unknown => {
  if (!isRecord(value)) return value;
  const text = (item: unknown) => (typeof item === 'string' && item ? map(item) : item);
  const issuer = withField(value.issuer, 'logo', text);
  const attachments = mapArray(value.attachments, (attachment) => withField(attachment, 'thumbnailDataUrl', text));
  if (issuer === value.issuer && attachments === value.attachments) return value;
  return { ...value, ...(issuer !== value.issuer ? { issuer } : {}), ...(attachments !== value.attachments ? { attachments } : {}) };
};

export function createPersistedDocumentAssets(options: { hash?: DocumentAssetHasher; onLearned?: () => void } = {}): PersistCodec & {
  settled: () => Promise<void>;
  setOnLearned: (listener: () => void) => void;
} {
  const hash = options.hash ?? subtleSha256;
  let onLearned = options.onLearned;
  // Text → hash and back. Never pruned in a session: a cached collapsed object may still point at any of them.
  const hashOf = new Map<string, string>();
  const contentOf = new Map<string, string>();
  const inflight = new Set<string>();
  let queue: string[] = [];
  let batch: Promise<void> | null = null;
  let disabled = false;
  /** Hashes present in each name's side key, and those the value being written references. */
  const stored = new Map<string, Set<string>>();
  const writing = new Map<string, Set<string>>();
  const caches = { project: new WeakMap<object, { out: unknown; hashes: string[] }>(), customization: new WeakMap<object, { out: unknown; hashes: string[] }>(), company: new WeakMap<object, { out: unknown; hashes: string[] }>(), quotation: new WeakMap<object, { out: unknown; hashes: string[] }>() };

  const runBatch = async () => {
    const texts = queue;
    queue = [];
    let learned = false;
    await Promise.all(texts.map(async (text) => {
      try {
        const sha = await hash(text);
        if (sha === null) disabled = true;
        else if (SHA256_HEX.test(sha)) { hashOf.set(text, sha); contentOf.set(sha, text); learned = true; }
      } catch {
        // Stays inline; retried on a later write.
      } finally {
        inflight.delete(text);
      }
    }));
    batch = queue.length && !disabled ? Promise.resolve().then(runBatch) : null;
    if (learned) onLearned?.();
  };
  const enqueue = (text: string) => {
    if (disabled || inflight.has(text)) return;
    inflight.add(text);
    queue.push(text);
    batch ??= Promise.resolve().then(runBatch);
  };

  const image = (text: string, pass: Pass): string => {
    if (!isAssetCandidate(text)) return text;
    const sha = hashOf.get(text);
    if (sha) { pass.used.add(sha); return assetRef(sha); }
    pass.pending = true;
    enqueue(text);
    return text;
  };
  /** Collapsed copy of an unchanged object is reused; one with an image still being hashed is recomputed later. */
  const cached = (cache: WeakMap<object, { out: unknown; hashes: string[] }>, value: unknown, pass: Pass, collapse: (inner: Pass) => unknown) => {
    if (!isRecord(value)) return value;
    const hit = cache.get(value);
    if (hit) { for (const sha of hit.hashes) pass.used.add(sha); return hit.out; }
    const inner: Pass = { used: new Set(), pending: false };
    const out = collapse(inner);
    for (const sha of inner.used) pass.used.add(sha);
    if (inner.pending) pass.pending = true;
    else cache.set(value, { out, hashes: [...inner.used] });
    return out;
  };
  const project = (value: unknown, pass: Pass) => cached(caches.project, value, pass, (inner) => mapDocumentAssetFields(value, (text) => image(text, inner)));
  /** Inline images of a quotation get the quotation prefix; server references (`asset:sha256:`) stay as they are. */
  const quotation = (value: unknown, pass: Pass) => cached(caches.quotation, value, pass, (inner) => mapQuotationImages(value, (text) => {
    if (isAssetRef(text)) return text;
    const out = image(text, inner);
    return isAssetRef(out) ? QUOTATION_IMAGE_PREFIX + assetRefHash(out) : out;
  }));
  const customization = (value: unknown, pass: Pass) =>
    cached(caches.customization, value, pass, (inner) => mapDocumentAssetFields({ customization: value }, (text) => image(text, inner)).customization);
  const company = (value: unknown, pass: Pass) => cached(caches.company, value, pass, (inner) => {
    const source = value as Rec;
    let next: Rec | null = null;
    for (const field of COMPANY_IMAGE_FIELDS) {
      const text = source[field];
      if (typeof text !== 'string' || !text) continue;
      const out = image(text, inner);
      if (out !== text) (next ??= { ...source })[field] = out;
    }
    return next ?? source;
  });
  const workspace = (state: Rec, pass: Pass): Rec => {
    const fields: Record<string, (value: unknown) => unknown> = {
      projects: (value) => mapArray(value, (item) => project(item, pass)),
      snapshotsByProject: (value) => mapRecord(value, (list) => mapArray(list, (snapshot) => withField(snapshot, 'data', (data) => project(data, pass)))),
      projectDeletionQueue: (value) => mapArray(value, (command) => withField(command, 'project', (data) => project(data, pass))),
      projectConflicts: (value) => mapRecord(value, (conflict) => withField(withField(conflict, 'localProject', (data) => project(data, pass)), 'serverProject', (data) => project(data, pass))),
      defaultDocumentCustomization: (value) => customization(value, pass),
      documentTemplatesByCompany: (value) => mapRecord(value, (item) => customization(item, pass)),
      companies: (value) => mapArray(value, (item) => company(item, pass)),
      quotations: (value) => mapArray(value, (item) => quotation(item, pass)),
      quotationDeletionQueue: (value) => mapArray(value, (command) => withField(command, 'quotation', (data) => quotation(data, pass))),
    };
    let next: Rec | null = null;
    for (const [key, collapse] of Object.entries(fields)) {
      if (state[key] === undefined) continue;
      const out = collapse(state[key]);
      if (out !== state[key]) (next ??= { ...state })[key] = out;
    }
    return next ?? state;
  };
  const collapseState = (state: Rec, pass: Pass): Rec => {
    const top = workspace(state, pass);
    const archives = mapRecord(state.organizationWorkspaces, (archive) => isRecord(archive) ? workspace(archive, pass) : archive);
    return archives === state.organizationWorkspaces ? top : { ...top, organizationWorkspaces: archives };
  };

  /** Expands one workspace: proposals and company images through every `asset:sha256:`, quotations only by their prefix. */
  const expandWorkspace = (workspace: Rec): Rec => {
    const held: Rec = {};
    const rest: Rec = { ...workspace };
    for (const key of QUOTATION_KEYS) if (key in rest) { held[key] = rest[key]; delete rest[key]; }
    const expanded = replaceAssetRefs(rest, (sha) => contentOf.get(sha));
    if (!Object.keys(held).length) return expanded === rest ? workspace : expanded;
    // A missing side-key entry (never written by this codec) reads as no image, never as an invalid value.
    const restore = (value: unknown) => mapQuotationImages(value, (text) =>
      text.startsWith(QUOTATION_IMAGE_PREFIX) ? contentOf.get(text.slice(QUOTATION_IMAGE_PREFIX.length)) ?? '' : text);
    if (held.quotations !== undefined) held.quotations = mapArray(held.quotations, restore);
    if (held.quotationDeletionQueue !== undefined)
      held.quotationDeletionQueue = mapArray(held.quotationDeletionQueue, (command) => withField(command, 'quotation', restore));
    return { ...expanded, ...held };
  };
  const expandState = (state: Rec): Rec => {
    const { organizationWorkspaces, ...top } = state;
    const expanded = expandWorkspace(top);
    if (organizationWorkspaces === undefined) return expanded;
    const archives = mapRecord(organizationWorkspaces, (archive) => (isRecord(archive) ? expandWorkspace(archive) : archive));
    return { ...expanded, organizationWorkspaces: archives };
  };

  /** Valid entries of the side key; a corrupt or missing key reads as empty. */
  const readAssets = (name: string, storage: TextStorage): Record<string, string> => {
    const entries: Record<string, string> = {};
    try {
      const raw = storage.getItem(persistedAssetsKey(name));
      const assets = raw ? JSON.parse(raw)?.assets : null;
      if (isRecord(assets)) for (const [sha, content] of Object.entries(assets)) if (SHA256_HEX.test(sha) && typeof content === 'string' && content) entries[sha] = content;
    } catch {
      // Unreadable side key: references stay as they are (never expanded to something else).
    }
    return entries;
  };
  const writeAssets = (name: string, storage: TextStorage, entries: Record<string, string>) => {
    const keys = Object.keys(entries);
    if (keys.length) storage.setItem(persistedAssetsKey(name), JSON.stringify({ version: 1, assets: entries }));
    else storage.removeItem(persistedAssetsKey(name));
    stored.set(name, new Set(keys));
  };
  const storedHashes = (name: string, storage: TextStorage) => {
    let known = stored.get(name);
    if (!known) stored.set(name, (known = new Set(Object.keys(readAssets(name, storage)))));
    return known;
  };

  return {
    encode(name, state, storage) {
      writing.delete(name);
      if (!isRecord(state)) return state;
      const pass: Pass = { used: new Set(), pending: false };
      const out = collapseState(state, pass);
      if (!pass.used.size && !storedHashes(name, storage).size) return out;
      const known = storedHashes(name, storage);
      const missing = [...pass.used].filter((sha) => !known.has(sha));
      if (missing.length) {
        // Never a dangling reference: without the content at hand, this write keeps every image inline.
        if (missing.some((sha) => !contentOf.has(sha))) return state;
        // Old ∪ new first: until the main value is written, the previous one still points at the old entries.
        const entries = readAssets(name, storage);
        for (const sha of pass.used) entries[sha] ??= contentOf.get(sha)!;
        try {
          writeAssets(name, storage, entries);
        } catch {
          // Sin espacio para la clave de imágenes (el blob anterior en línea aún ocupa el suyo): esta escritura va en
          // línea, como antes, para que el estado siempre se guarde. La siguiente reescritura vuelve a intentarlo
          // cuando el blob principal ya libera espacio.
          return state;
        }
      }
      writing.set(name, pass.used);
      return out;
    },
    committed(name, storage) {
      const used = writing.get(name);
      writing.delete(name);
      const known = stored.get(name);
      if (!used || !known || [...known].every((sha) => used.has(sha))) return;
      const previous = [...used].some((sha) => !contentOf.has(sha)) ? readAssets(name, storage) : {};
      const entries: Record<string, string> = {};
      for (const sha of used) {
        const content = contentOf.get(sha) ?? previous[sha];
        if (content) entries[sha] = content;
      }
      writeAssets(name, storage, entries);
    },
    decode(name, state, storage) {
      const entries = readAssets(name, storage);
      for (const [sha, content] of Object.entries(entries)) {
        contentOf.set(sha, content);
        hashOf.set(content, sha);
      }
      stored.set(name, new Set(Object.keys(entries)));
      const expanded = isRecord(state) ? expandState(state) : replaceAssetRefs(state, (sha) => contentOf.get(sha));
      // Warms the collapsed cache and starts hashing images still inline (data saved before this format).
      if (isRecord(expanded)) collapseState(expanded, { used: new Set(), pending: false });
      return expanded;
    },
    remove(name, storage) {
      storage.removeItem(persistedAssetsKey(name));
      stored.delete(name);
      writing.delete(name);
    },
    settled: async () => {
      while (batch) await batch;
    },
    setOnLearned: (listener) => {
      onLearned = listener;
    },
  };
}
