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
  /**
   * Regla 2: registro vivo por (propuesta, equipo), `"<projectId>|<equipmentId>"` → id del registro. Se guarda con el
   * espacio de trabajo (un mapa por organización) para anular el anterior al registrar otro precio del mismo par.
   */
  proposalPriceLive: Record<string, string>;
  /** Equipos (`"<scope>|<equipmentId>"`) por los que el usuario contestó «No» a la pregunta: solo en memoria, por sesión. */
  genericQuestionDismissed: Record<string, true>;
  /** Registra el precio de una propuesta (`proposal`) y anula el registro vivo anterior del mismo par. Sin condiciones: ver `commitProposalPrice`. */
  recordProposalPrice: (projectId: string, equipmentId: string, priceUSD: number) => string | null;
  /** «No» a «¿Usar como precio genérico?»: deja de preguntar por ese equipo durante la sesión. */
  dismissGenericQuestion: (equipmentId: string) => void;
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

/**
 * Mapa de precios genéricos efectivos de los equipos del catálogo (contexto de las propuestas automáticas). Vacío sin
 * sesión: en modo local la función está apagada.
 */
export function effectiveGenericPriceMap(
  state: Pick<SimulationStore, 'syncSettings' | 'genericPrices' | 'pricePending'> & { equipmentCatalog: readonly { id: string }[] },
): Record<string, GenericPriceInfo> {
  if (!priceFeatureActive(state)) return {};
  const map: Record<string, GenericPriceInfo> = {};
  for (const item of state.equipmentCatalog) {
    const generic = effectiveGenericPrice(state, item.id);
    if (generic) map[item.id] = generic;
  }
  return map;
}

/** Regla 1: qué ofrecer tras guardar ofertas. Toma la más baja de las registradas (un solo equipo) y la compara con el genérico. */
export interface GenericSuggestion {
  equipmentId: string;
  observationId: string;
  priceUSD: number;
  currentUSD?: number;
  decision: 'assign' | 'update';
  /** Procedencia capturada al guardar: la cola puede vaciarse (envío automático) antes de que el usuario acepte. */
  supplierName?: string;
  supplierOfferId?: string;
  originalCurrency?: ObservationInput['originalCurrency'];
  originalPrice?: number;
  /** Espacio y usuario de la sugerencia: aceptar en otro espacio no hace nada. */
  scope: string;
  userId: string;
}
export function genericSuggestionFor(state: SimulationStore, observationIds: readonly string[]): GenericSuggestion | null {
  const context = priceRecordingContext(state);
  if (!context || !observationIds.length) return null;
  const ids = new Set(observationIds);
  const candidates = state.pricePending.observations.filter((entry) => ids.has(entry.id) && entry.kind === 'observation' && entry.priceUSD > 0);
  // One equipment per suggestion: a bulk save across several models never offers a generic price.
  if (!candidates.length || new Set(candidates.map((entry) => entry.equipmentId)).size > 1) return null;
  const lowest = candidates.reduce((best, entry) => (entry.priceUSD < best.priceUSD ? entry : best));
  const item = state.equipmentCatalog.find((entry) => entry.id === lowest.equipmentId);
  if (!canPriceEquipment(state, item)) return null;
  const current = effectiveGenericPrice(state, lowest.equipmentId);
  const decision = genericPriceDecision(current?.priceUSD, lowest.priceUSD);
  if (decision === 'none') return null;
  return {
    equipmentId: lowest.equipmentId, observationId: lowest.id, priceUSD: lowest.priceUSD, ...(current ? { currentUSD: current.priceUSD } : {}), decision,
    supplierName: lowest.supplierName, supplierOfferId: lowest.supplierOfferId, originalCurrency: lowest.originalCurrency, originalPrice: lowest.originalPrice,
    ...context,
  };
}

/** Acepta la sugerencia de la Regla 1: registro `generic` derivado de la oferta. `null` si cambió la sesión o no hay permiso. */
export function acceptGenericSuggestion(state: SimulationStore, suggestion: GenericSuggestion): string | null {
  const context = priceRecordingContext(state);
  if (!context || context.scope !== suggestion.scope || context.userId !== suggestion.userId) return null;
  return state.setGenericPrice(suggestion.equipmentId, suggestion.priceUSD, 'supplier_offer', {
    derivedFromId: suggestion.observationId,
    supplierName: suggestion.supplierName,
    supplierOfferId: suggestion.supplierOfferId,
    originalCurrency: suggestion.originalCurrency,
    originalPrice: suggestion.originalPrice,
  });
}

/** Clave del registro vivo de la Regla 2. */
export const proposalPriceKey = (projectId: string, equipmentId: string) => `${projectId}|${equipmentId}`;

export interface ProposalPriceCommitInput {
  projectId: string;
  equipmentId: string | undefined;
  /** Precio al entrar en el campo (o tras el último Enter). */
  previousUSD: number | undefined;
  priceUSD: number;
  /** Precio del proveedor asignado al grupo, si lo hay. */
  supplierPriceUSD?: number;
}
/** Pregunta compacta bajo el precio; los datos se capturan al confirmar, no al responder. */
export interface ProposalGenericQuestion {
  projectId: string;
  equipmentId: string;
  priceUSD: number;
  observationId: string;
  scope: string;
  userId: string;
}

const differs = (a: number | null | undefined, b: number) => !(typeof a === 'number' && Number.isFinite(a) && genericPriceDecision(a, b) === 'none');

/**
 * Regla 2 (ADR 0006 §4): al confirmar un precio escrito a mano en la fila de costo unitario. Registra una observación
 * `proposal` si hay sesión con permiso de escritura, la propuesta es de la organización actual y no está en la papelera, el
 * equipo está resuelto (y se le puede poner precio), el precio es > 0, cambió y difiere del proveedor asignado y del genérico
 * vigente. Devuelve la pregunta solo si el equipo no tiene genérico y el usuario no la descartó en esta sesión.
 */
export function commitProposalPrice(state: SimulationStore, input: ProposalPriceCommitInput): { observationId: string | null; question: ProposalGenericQuestion | null } {
  const none = { observationId: null, question: null };
  const context = priceRecordingContext(state);
  const user = state.syncSettings.currentUser;
  if (!context || !user || !input.equipmentId) return none;
  const { priceUSD, previousUSD } = input;
  if (!(Number.isFinite(priceUSD) && priceUSD > 0) || !differs(previousUSD, priceUSD) || !differs(input.supplierPriceUSD, priceUSD)) return none;
  const project = state.projects.find((entry) => entry.id === input.projectId);
  if (!project || project.isDeleted || project.deletedAt || project.organizationId !== user.organizationId) return none;
  if (project.syncServerUrl && !sameServer(project.syncServerUrl, state.syncSettings.serverUrl)) return none;
  const item = state.equipmentCatalog.find((entry) => entry.id === input.equipmentId);
  if (!canPriceEquipment(state, item)) return none;
  const current = effectiveGenericPrice(state, input.equipmentId);
  if (!differs(current?.priceUSD, priceUSD)) return none;
  const observationId = state.recordProposalPrice(project.id, input.equipmentId, priceUSD);
  if (!observationId) return none;
  const dismissed = state.genericQuestionDismissed?.[`${context.scope}|${input.equipmentId}`];
  return {
    observationId,
    question: current || dismissed ? null : { projectId: project.id, equipmentId: input.equipmentId, priceUSD, observationId, ...context },
  };
}

/** «Usar»: fija el genérico con el precio capturado al confirmar, derivado de su registro. `null` si cambió la sesión. */
export function acceptProposalGenericQuestion(state: SimulationStore, question: ProposalGenericQuestion): string | null {
  const context = priceRecordingContext(state);
  if (!context || context.scope !== question.scope || context.userId !== question.userId) return null;
  // Los precios de propuesta están en USD: moneda y precio original como en su observación y en los derivados de ofertas.
  return state.setGenericPrice(question.equipmentId, question.priceUSD, 'proposal', {
    derivedFromId: question.observationId, originalCurrency: 'USD', originalPrice: question.priceUSD,
  });
}

/** Hidratación: un mapa o una cola mal formados (versiones viejas, almacenamiento dañado) se descartan, nunca se reparan a medias. */
export function normalizePriceState(value: { genericPrices?: unknown; pricePending?: unknown; proposalPriceLive?: unknown }): Pick<EquipmentPriceSlice, 'genericPrices' | 'pricePending' | 'proposalPriceLive'> {
  const live = value.proposalPriceLive && typeof value.proposalPriceLive === 'object' && !Array.isArray(value.proposalPriceLive) ? (value.proposalPriceLive as Record<string, unknown>) : {};
  const proposalPriceLive = Object.fromEntries(Object.entries(live).filter((entry): entry is [string, string] => isObservationId(entry[1])));
  const map = value.genericPrices && typeof value.genericPrices === 'object' && !Array.isArray(value.genericPrices) ? (value.genericPrices as Record<string, GenericPriceInfo>) : {};
  const genericPrices = Object.fromEntries(
    Object.entries(map).filter(([, info]) => info && Number.isFinite(info.priceUSD) && info.priceUSD > 0 && typeof info.observedAt === 'string' && isObservationId(info.observationId)),
  );
  const queue = value.pricePending as Partial<PricePendingQueue> | undefined;
  const tagged = (entry: unknown): entry is { id: string; scope: string; userId: string } =>
    !!entry && typeof entry === 'object' && isObservationId((entry as PendingPriceVoid).id) && typeof (entry as PendingPriceVoid).scope === 'string' && typeof (entry as PendingPriceVoid).userId === 'string';
  if (!queue || typeof queue !== 'object' || !Array.isArray(queue.observations) || !Array.isArray(queue.voids)) return { genericPrices, pricePending: { observations: [], voids: [] }, proposalPriceLive };
  return {
    genericPrices,
    proposalPriceLive,
    pricePending: {
      observations: queue.observations.filter((entry): entry is PendingPriceObservation => tagged(entry) && validateObservation(entry).ok),
      voids: queue.voids.filter(tagged).map(({ id, scope, userId }) => ({ id, scope, userId })),
    },
  };
}

/** El usuario actual tiene registros o anulaciones en cola en este espacio. */
const hasOwnPending = (state: Pick<SimulationStore, 'syncSettings' | 'pricePending'>) => {
  const owns = mine(state);
  return !!owns && (state.pricePending.observations.some(owns) || state.pricePending.voids.some(owns));
};

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
    proposalPriceLive: {},
    genericQuestionDismissed: {},

    recordProposalPrice: (projectId, equipmentId, priceUSD) => {
      const [id] = get().recordPriceObservations([{ equipmentId, kind: 'observation', priceUSD, source: 'proposal', projectId, originalCurrency: 'USD', originalPrice: priceUSD }]);
      if (!id) return null;
      const key = proposalPriceKey(projectId, equipmentId);
      const previous = get().proposalPriceLive[key];
      set((state) => ({ proposalPriceLive: { ...state.proposalPriceLive, [key]: id } }));
      // Un registro vivo por par: anular el anterior también envía (con la sincronización automática); si no había, se envía aquí.
      if (!(previous && get().voidPriceObservation(previous))) autoSync();
      return id;
    },

    dismissGenericQuestion: (equipmentId) => {
      const user = get().syncSettings.currentUser;
      if (!user) return;
      const key = `${featureScope(get().syncSettings.serverUrl, user.organizationId)}|${equipmentId}`;
      set((state) => ({ genericQuestionDismissed: { ...state.genericQuestionDismissed, [key]: true } }));
    },

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
        // The running pass captured the queue when it started. Once it settles, run once more when this call wants a
        // download the running pass skips, or when entries of this user were queued meanwhile (immediate send).
        const previous = inFlight;
        return previous.promise.then((result) => {
          if (inFlight?.promise === previous.promise) return result;
          const wantsRefresh = options.refresh !== false && !previous.refresh;
          if (!wantsRefresh && (result.status !== 'ok' || !hasOwnPending(get()))) return result;
          return get().syncPriceObservations(options);
        });
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
        // A generic answered other than `created` (e.g. `duplicate` after a lost response) or a void of the current
        // generic leaves the local map stale: download it even on a send-only pass (the previous generic comes back).
        let mapStale = false;
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
              if (sentObservations.some((entry) => entry.kind === 'generic' && !createdGenerics.includes(entry))) mapStale = true;
              if (Object.values(get().genericPrices).some((info) => voidedIds.has(info.observationId))) mapStale = true;
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
          if (options.refresh === false && !mapStale) return { status: 'ok' };
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
