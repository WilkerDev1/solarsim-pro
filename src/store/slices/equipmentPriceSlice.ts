// Registros de precio y precio genérico de equipos (ADR 0006 §3). Solo lo acotado vive en el store: el mapa de
// genéricos del servidor y la cola local; el historial se pide al abrir su vista y nunca se guarda.
import { isWriterRole } from '../../../shared/permissions';
import { featureScope } from '../../../shared/applicationFeatures';
import { REFERENCE_EQUIPMENT_IDS } from '../../../shared/referenceEquipment';
import {
  PRICE_OBSERVATION_LIMITS,
  genericPriceDecision,
  isObservationId,
  validateObservation,
  type GenericPriceInfo,
  type ObservationInput,
  type PriceObservationSource,
} from '../../../shared/equipmentPrices';
import { SyncService } from '../../services/syncService';
import type { SolarEquipmentItem } from '../../types/equipment';
import type { SimulationSlice, SimulationStore } from '../types';

/** Cada entrada recuerda el espacio (`scope`) y el usuario que la creó: solo ese usuario, en ese espacio, la envía. */
export interface PendingPriceObservation extends ObservationInput {
  scope: string;
  userId: string;
}
export interface PendingPriceVoid {
  id: string;
  scope: string;
  userId: string;
}
export interface PricePendingQueue {
  observations: PendingPriceObservation[];
  voids: PendingPriceVoid[];
}
/** Lo que un llamador registra: el id y la fecha los pone la porción. */
export type PriceObservationDraft = Omit<ObservationInput, 'id' | 'observedAt'> & { observedAt?: string };
export interface GenericPriceContext {
  derivedFromId?: string;
  supplierName?: string;
  supplierOfferId?: string;
  originalCurrency?: ObservationInput['originalCurrency'];
  originalPrice?: number;
}
export type PriceSyncResult = { status: 'ok' | 'unsupported' | 'skipped' | 'error'; message?: string };

export interface EquipmentPriceSlice {
  /** Copia de `GET /api/equipment-prices/generic` del espacio de trabajo activo. */
  genericPrices: Record<string, GenericPriceInfo>;
  pricePending: PricePendingQueue;
  /** Encola registros (validados). Devuelve los ids creados; sin sesión o sin permiso de escritura, `[]`. */
  recordPriceObservations: (inputs: PriceObservationDraft[]) => string[];
  /** Fija el precio genérico (> 0) con un registro `generic`. Devuelve su id o `null` si no se pudo. */
  setGenericPrice: (equipmentId: string, priceUSD: number, source: PriceObservationSource, ctx?: GenericPriceContext) => string | null;
  /** Encola la anulación de un registro (p. ej. el genérico vigente). */
  voidPriceObservation: (id: string) => boolean;
  /** Envía la cola del usuario actual en lotes y, con `refresh` (por defecto), vuelve a descargar los genéricos. Nunca lanza. */
  syncPriceObservations: (options?: { refresh?: boolean }) => Promise<PriceSyncResult>;
}

export const EMPTY_PRICE_QUEUE: PricePendingQueue = { observations: [], voids: [] };
const REFERENCE_ORGANIZATION = 'org-electsun-default';
const REFERENCE_IDS = new Set<string>(REFERENCE_EQUIPMENT_IDS);
const sameServer = (a: string, b: string) => a.trim().replace(/\/+$/, '') === b.trim().replace(/\/+$/, '');

/** Sesión con identidad: la función solo existe con un usuario (modo local = apagada). */
export function priceFeatureActive(state: Pick<SimulationStore, 'syncSettings'>): boolean {
  return !!state.syncSettings.currentUser;
}

/** Contexto con el que se registra: usuario con permiso de escritura (EDITOR o ADMIN). `null` = no se registra. */
export function priceRecordingContext(state: Pick<SimulationStore, 'syncSettings'>): { scope: string; userId: string } | null {
  const user = state.syncSettings.currentUser;
  if (!user || !isWriterRole(user.role)) return null;
  return { scope: featureScope(state.syncSettings.serverUrl, user.organizationId), userId: user.id };
}

/** Equipos a los que la organización puede ponerles precio: los propios, los sin dueño y los de referencia compartidos. */
export function canPriceEquipment(state: Pick<SimulationStore, 'syncSettings'>, item: SolarEquipmentItem | undefined): boolean {
  const user = state.syncSettings.currentUser;
  if (!item || !user || !isWriterRole(user.role)) return false;
  if (REFERENCE_IDS.has(item.id) && (!item.organizationId || item.organizationId === REFERENCE_ORGANIZATION)) return true;
  if (item.organizationId && item.organizationId !== user.organizationId) return false;
  return !item.syncServerUrl || sameServer(item.syncServerUrl, state.syncSettings.serverUrl);
}

const mine = (state: Pick<SimulationStore, 'syncSettings'>) => {
  const user = state.syncSettings.currentUser;
  if (!user) return null;
  const scope = featureScope(state.syncSettings.serverUrl, user.organizationId);
  return (entry: { scope: string; userId: string }) => entry.scope === scope && entry.userId === user.id;
};

/**
 * Precio genérico efectivo: el mapa del servidor con lo pendiente del usuario actual aplicado encima. Un `generic` en
 * cola gana (el más reciente); una anulación en cola del vigente lo quita hasta la siguiente descarga.
 */
export function effectiveGenericPrice(
  state: Pick<SimulationStore, 'syncSettings' | 'genericPrices' | 'pricePending'>,
  equipmentId: string,
): GenericPriceInfo | null {
  const owns = mine(state);
  if (!owns) return null;
  const queue = state.pricePending ?? EMPTY_PRICE_QUEUE;
  const voided = new Set(queue.voids.filter(owns).map((entry) => entry.id));
  for (let index = queue.observations.length - 1; index >= 0; index--) {
    const entry = queue.observations[index];
    if (entry.equipmentId === equipmentId && entry.kind === 'generic' && owns(entry) && !voided.has(entry.id))
      return { priceUSD: entry.priceUSD, observedAt: entry.observedAt, observationId: entry.id };
  }
  const server = state.genericPrices?.[equipmentId];
  return server && !voided.has(server.observationId) ? server : null;
}

/** Regla 1: qué ofrecer tras guardar ofertas. Toma la más baja de las registradas (un solo equipo) y la compara con el genérico. */
export interface GenericSuggestion {
  equipmentId: string;
  observationId: string;
  priceUSD: number;
  currentUSD?: number;
  decision: 'assign' | 'update';
}
export function genericSuggestionFor(state: SimulationStore, observationIds: readonly string[]): GenericSuggestion | null {
  if (!priceRecordingContext(state) || !observationIds.length) return null;
  const ids = new Set(observationIds);
  const candidates = state.pricePending.observations.filter((entry) => ids.has(entry.id) && entry.kind === 'observation' && entry.priceUSD > 0);
  if (!candidates.length) return null;
  const lowest = candidates.reduce((best, entry) => (entry.priceUSD < best.priceUSD ? entry : best));
  const item = state.equipmentCatalog.find((entry) => entry.id === lowest.equipmentId);
  if (!canPriceEquipment(state, item)) return null;
  const current = effectiveGenericPrice(state, lowest.equipmentId);
  const decision = genericPriceDecision(current?.priceUSD, lowest.priceUSD);
  if (decision === 'none') return null;
  return { equipmentId: lowest.equipmentId, observationId: lowest.id, priceUSD: lowest.priceUSD, ...(current ? { currentUSD: current.priceUSD } : {}), decision };
}

/** Hidratación: un mapa o una cola mal formados (versiones viejas, almacenamiento dañado) se descartan, nunca se reparan a medias. */
export function normalizePriceState(value: { genericPrices?: unknown; pricePending?: unknown }): Pick<EquipmentPriceSlice, 'genericPrices' | 'pricePending'> {
  const map = value.genericPrices && typeof value.genericPrices === 'object' && !Array.isArray(value.genericPrices) ? (value.genericPrices as Record<string, GenericPriceInfo>) : {};
  const genericPrices = Object.fromEntries(
    Object.entries(map).filter(([, info]) => info && Number.isFinite(info.priceUSD) && info.priceUSD > 0 && typeof info.observedAt === 'string' && isObservationId(info.observationId)),
  );
  const queue = value.pricePending as Partial<PricePendingQueue> | undefined;
  const tagged = (entry: unknown): entry is { id: string; scope: string; userId: string } =>
    !!entry && typeof entry === 'object' && isObservationId((entry as PendingPriceVoid).id) && typeof (entry as PendingPriceVoid).scope === 'string' && typeof (entry as PendingPriceVoid).userId === 'string';
  if (!queue || typeof queue !== 'object' || !Array.isArray(queue.observations) || !Array.isArray(queue.voids)) return { genericPrices, pricePending: { observations: [], voids: [] } };
  return {
    genericPrices,
    pricePending: {
      observations: queue.observations.filter((entry): entry is PendingPriceObservation => tagged(entry) && validateObservation(entry).ok),
      voids: queue.voids.filter(tagged).map(({ id, scope, userId }) => ({ id, scope, userId })),
    },
  };
}

const newObservationId = () => `po-${crypto.randomUUID()}`;
const ACKNOWLEDGED = new Set(['created', 'duplicate', 'conflict', 'rejected', 'voided', 'already_voided']);

export const createEquipmentPriceSlice: SimulationSlice<EquipmentPriceSlice> = (set, get) => {
  let inFlight: { generation: number; refresh: boolean; promise: Promise<PriceSyncResult> } | null = null;
  const enqueue = (entries: ObservationInput[], context: { scope: string; userId: string }) =>
    set((state) => ({ pricePending: { ...state.pricePending, observations: [...state.pricePending.observations, ...entries.map((entry) => ({ ...entry, ...context }))] } }));
  /** Envío inmediato cuando el usuario tiene la sincronización automática (un fallo se reintenta en la siguiente). */
  const autoSync = () => {
    const { autoSyncEnabled, authToken } = get().syncSettings;
    if (autoSyncEnabled && authToken) void get().syncPriceObservations({ refresh: false });
  };

  return {
    genericPrices: {},
    pricePending: EMPTY_PRICE_QUEUE,

    recordPriceObservations: (inputs) => {
      const context = priceRecordingContext(get());
      if (!context || !inputs.length) return [];
      const now = new Date().toISOString();
      const valid: ObservationInput[] = [];
      for (const input of inputs) {
        const checked = validateObservation({ ...input, id: newObservationId(), observedAt: input.observedAt ?? now });
        if (checked.ok) valid.push(checked.value);
      }
      if (valid.length) enqueue(valid, context);
      return valid.map((entry) => entry.id);
    },

    setGenericPrice: (equipmentId, priceUSD, source, ctx = {}) => {
      const state = get();
      const context = priceRecordingContext(state);
      if (!context || !(Number.isFinite(priceUSD) && priceUSD > 0)) return null;
      if (!canPriceEquipment(state, state.equipmentCatalog.find((item) => item.id === equipmentId))) return null;
      const checked = validateObservation({
        id: newObservationId(), equipmentId, kind: 'generic', priceUSD, source, observedAt: new Date().toISOString(),
        derivedFromId: ctx.derivedFromId, supplierName: ctx.supplierName, supplierOfferId: ctx.supplierOfferId,
        originalCurrency: ctx.originalCurrency, originalPrice: ctx.originalPrice,
      });
      if (!checked.ok) return null;
      enqueue([checked.value], context);
      autoSync();
      return checked.value.id;
    },

    voidPriceObservation: (id) => {
      const context = priceRecordingContext(get());
      if (!context || !isObservationId(id)) return false;
      set((state) => ({
        pricePending: {
          ...state.pricePending,
          voids: [...state.pricePending.voids.filter((entry) => !(entry.id === id && entry.scope === context.scope && entry.userId === context.userId)), { id, ...context }],
        },
      }));
      autoSync();
      return true;
    },

    syncPriceObservations: async (options = {}) => {
      const generation = get().sessionGeneration;
      if (inFlight?.generation === generation) {
        if (options.refresh === false || inFlight.refresh) return inFlight.promise;
        // A send-only pass is running: wait for it, then send what is left and download the generic prices.
        const previous = inFlight.promise;
        return previous.then(() => (inFlight?.promise === previous ? previous : get().syncPriceObservations(options)));
      }
      const { serverUrl, authToken, currentUser } = get().syncSettings;
      if (!authToken || !currentUser) return { status: 'skipped' };
      const scope = featureScope(serverUrl, currentUser.organizationId);
      const ensureSession = () => {
        const fresh = get().syncSettings;
        if (generation !== get().sessionGeneration || !fresh.authToken || fresh.currentUser?.id !== currentUser.id || fresh.currentUser.organizationId !== currentUser.organizationId || fresh.serverUrl !== serverUrl)
          throw new Error('La sesión cambió durante la sincronización de precios.');
      };
      const owns = (entry: { scope: string; userId: string }) => entry.scope === scope && entry.userId === currentUser.id;
      const run = async (): Promise<PriceSyncResult> => {
        try {
          if (isWriterRole(currentUser.role)) {
            const captured = get().pricePending;
            const observations = captured.observations.filter(owns);
            const voids = captured.voids.filter(owns);
            const { batchObservations, batchVoids } = PRICE_OBSERVATION_LIMITS;
            for (let o = 0, v = 0; o < observations.length || v < voids.length; o += batchObservations, v += batchVoids) {
              const sentObservations = observations.slice(o, o + batchObservations);
              const sentVoids = voids.slice(v, v + batchVoids);
              const outcome = await SyncService.pushPriceObservations(serverUrl, get().syncSettings.authToken!, {
                observations: sentObservations.map(({ scope: _scope, userId: _user, ...input }) => input),
                voids: sentVoids.map(({ id }) => ({ id })),
              });
              ensureSession();
              if (outcome.status === 'unsupported') return { status: 'unsupported' };
              if (outcome.status === 'error') return { status: 'error', message: outcome.error };
              const sentObservationIds = new Set(sentObservations.map((entry) => entry.id));
              const sentVoidIds = new Set(sentVoids.map((entry) => entry.id));
              const doneObservations = new Set(outcome.observations.filter((r) => sentObservationIds.has(r.id) && ACKNOWLEDGED.has(r.status)).map((r) => r.id));
              const doneVoids = new Set(outcome.voids.filter((r) => sentVoidIds.has(r.id) && ACKNOWLEDGED.has(r.status)).map((r) => r.id));
              const voidedIds = new Set(outcome.voids.filter((r) => r.status === 'voided' || r.status === 'already_voided').map((r) => r.id));
              const createdGenerics = sentObservations.filter((entry) => entry.kind === 'generic' && outcome.observations.some((r) => r.id === entry.id && r.status === 'created'));
              set((state) => {
                const genericPrices = { ...state.genericPrices };
                // The newest created generic is the current one until the next download corrects it.
                for (const entry of createdGenerics) genericPrices[entry.equipmentId] = { priceUSD: entry.priceUSD, observedAt: entry.observedAt, observationId: entry.id };
                for (const [equipmentId, info] of Object.entries(genericPrices)) if (voidedIds.has(info.observationId)) delete genericPrices[equipmentId];
                return {
                  genericPrices,
                  pricePending: {
                    observations: state.pricePending.observations.filter((entry) => !(owns(entry) && doneObservations.has(entry.id))),
                    voids: state.pricePending.voids.filter((entry) => !(owns(entry) && doneVoids.has(entry.id))),
                  },
                };
              });
            }
          }
          if (options.refresh === false) return { status: 'ok' };
          const fetched = await SyncService.fetchGenericPrices(serverUrl, get().syncSettings.authToken!);
          ensureSession();
          if (fetched.status === 'unsupported') return { status: 'unsupported' };
          if (fetched.status === 'error') return { status: 'error', message: fetched.error };
          set({ genericPrices: fetched.prices });
          return { status: 'ok' };
        } catch (error) {
          return { status: 'error', message: error instanceof Error ? error.message : 'No se pudieron sincronizar los precios.' };
        }
      };
      const promise = run();
      inFlight = { generation, refresh: options.refresh !== false, promise };
      try {
        return await promise;
      } finally {
        if (inFlight?.promise === promise) inFlight = null;
      }
    },
  };
};
