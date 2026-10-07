import { ProjectSimulation, FinancialSummaryResult } from '../types';
import { ELECTSUN_LOGO_COLOR_BASE64 } from '../assets/electsunLogo';
import { useSimulationStore } from '../store/useSimulationStore';
import { energyCalculationMode, featureScope } from '../../shared/applicationFeatures';
import { effectiveFeatureSettings } from '../features/application/featurePolicy';
import { calculateProjectFinancialSummary } from '../engine/financeEngine';

export interface ShareResult {
  success: boolean;
  id?: string;
  shareUrl?: string;
  expiresAt?: string;
  validityDays?: number;
  error?: string;
}

export interface SharedProposalRecord {
  /** Missing only on legacy records retained without assigning an organization. */
  serverUrl?: string;
  organizationId?: string;
  id: string;
  projectId: string;
  projectCode: string;
  quoteNumber: string;
  clientName: string;
  companyName?: string;
  location?: string;
  systemKWp: number;
  shareUrl: string;
  createdAt: string;
  expiresAt: string;
  validityDays: number;
  workerUrl: string;
}

export interface RemainingTimeInfo {
  isExpired: boolean;
  days: number;
  hours: number;
  minutes: number;
  formattedText: string;
  percentRemaining: number;
  color: 'emerald' | 'amber' | 'rose';
  badgeText: string;
}

const STORAGE_WORKER_URL_KEY = 'solarsim_share_worker_url';
export const STORAGE_SHARED_HISTORY_KEY = 'solarsim_shared_links_history';
export const DEFAULT_WORKER_URL = 'https://propuesta.electsun.net';
const SCOPED_HISTORY_PREFIX = `${STORAGE_SHARED_HISTORY_KEY}_v2_`;

interface HistoryContext {
  key: string;
  serverUrl: string;
  organizationId: string;
  userId: string;
  generation: number;
}

function canonicalServer(url: string): string {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch { return url.trim().replace(/\/+$/, ''); }
}


export class ShareProposalService {
  private static historyContext(): HistoryContext | null {
    const state = useSimulationStore.getState();
    const user = state.syncSettings.currentUser;
    if (!user?.organizationId) return null;
    const serverUrl = canonicalServer(state.syncSettings.serverUrl);
    return { serverUrl, organizationId: user.organizationId, userId: user.id,
      generation: state.sessionGeneration,
      key: `${SCOPED_HISTORY_PREFIX}${encodeURIComponent(serverUrl)}|${encodeURIComponent(user.organizationId)}` };
  }

  public static getHistoryScopeKey(): string | null {
    return this.historyContext()?.key || null;
  }

  private static contextIsCurrent(context: HistoryContext): boolean {
    const active = this.historyContext();
    return !!active && active.key === context.key && active.userId === context.userId && active.generation === context.generation;
  }

  public static hasQuarantinedLegacyHistory(): boolean {
    try {
    if (this.readRecords(STORAGE_SHARED_HISTORY_KEY).some((record) => !record.organizationId || !record.serverUrl)) return true;
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('solarsim_last_share_')) continue;
      try {
        const record = JSON.parse(localStorage.getItem(key) || 'null');
        if (record?.id && (!record.organizationId || !record.serverUrl)) return true;
      } catch { /* Keep malformed data for manual recovery. */ }
    }
    return false;
    } catch { return false; }
  }

  private static recordBelongsTo(record: SharedProposalRecord, context: HistoryContext): boolean {
    return !!record.serverUrl && record.organizationId === context.organizationId && canonicalServer(record.serverUrl) === context.serverUrl;
  }

  private static readRecords(key: string): SharedProposalRecord[] {
    try {
      const records: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(records) ? records.filter((record) => record && typeof record === 'object' && typeof record.id === 'string' && typeof record.shareUrl === 'string') : [];
    } catch { return []; }
  }

  private static writeRecords(context: HistoryContext, records: SharedProposalRecord[]): boolean {
    try { localStorage.setItem(context.key, JSON.stringify(records)); return true; }
    catch { return false; }
  }

  private static notifyHistoryUpdated(): void {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
  }

  private static lastShareKey(context: HistoryContext, projectId: string): string {
    return `${context.key}:last:${encodeURIComponent(projectId)}`;
  }

  /** Legacy entries stay untouched unless they carry explicit, verifiable scope metadata. */
  private static readScopedRecords(context: HistoryContext): SharedProposalRecord[] {
    const records = this.readRecords(context.key).filter((record) => this.recordBelongsTo(record, context));
    try { if (localStorage.getItem(context.key) !== null) return records; } catch { return records; }
    const legacy = this.readRecords(STORAGE_SHARED_HISTORY_KEY);
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('solarsim_last_share_')) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key) || 'null');
        if (item?.id && typeof item.shareUrl === 'string') legacy.push({ ...item,
          projectId: key.slice('solarsim_last_share_'.length),
          projectCode: item.projectCode || key.slice('solarsim_last_share_'.length),
          quoteNumber: item.quoteNumber || 'C-0001', clientName: item.clientName || 'Propuesta Solar',
          createdAt: item.savedAt || item.createdAt || new Date().toISOString(),
          validityDays: item.validityDays || 7, systemKWp: item.systemKWp || 0,
          workerUrl: item.workerUrl || this.getWorkerUrl() });
      } catch { /* Preserve malformed legacy data as well. */ }
    }
    for (const record of legacy) {
      if (this.recordBelongsTo(record, context) && !records.some((existing) => existing.id === record.id)) {
        records.push({ ...record, serverUrl: context.serverUrl });
      }
    }
    this.writeRecords(context, records);
    return records;
  }

  public static getWorkerUrl(): string {
    const customUrl = localStorage.getItem(STORAGE_WORKER_URL_KEY);
    if (customUrl && customUrl.trim()) {
      return customUrl.trim().replace(/\/+$/, '');
    }
    return DEFAULT_WORKER_URL;
  }

  public static setWorkerUrl(url: string): void {
    if (!url || !url.trim()) {
      localStorage.removeItem(STORAGE_WORKER_URL_KEY);
    } else {
      localStorage.setItem(STORAGE_WORKER_URL_KEY, url.trim().replace(/\/+$/, ''));
    }
  }

  public static async shareProposal(
    project: ProjectSimulation,
    summary: FinancialSummaryResult,
    validityDays: number = 7,
    workerUrlOverride?: string
  ): Promise<ShareResult> {
    const baseUrl = workerUrlOverride || this.getWorkerUrl();
    const endpoint = `${baseUrl}/api/share`;

    try {
      const initialState = useSimulationStore.getState();
      const initialSession = initialState.syncSettings;
      const publicationContext = this.historyContext();
      if (!publicationContext || !initialSession.currentUser || !initialSession.authToken) return { success: false, error: 'Inicia sesión en tu organización para publicar una propuesta.' };
      if (!['ADMIN', 'EDITOR'].includes(initialSession.currentUser.role)) return { success: false, error: 'Esta cuenta no tiene permiso para publicar propuestas.' };
      const destination = new URL(baseUrl);
      if (destination.protocol !== 'https:' || destination.username || destination.password || destination.search || destination.hash) return { success: false, error: 'La publicación autenticada requiere una URL HTTPS.' };
      await useSimulationStore.getState().loadOrganizationFeaturePolicy();
      const state = useSimulationStore.getState();
      const session = state.syncSettings;
      if (!this.contextIsCurrent(publicationContext) || session.currentUser?.id !== initialSession.currentUser.id || session.currentUser.organizationId !== initialSession.currentUser.organizationId || session.serverUrl !== initialSession.serverUrl || !session.authToken) return { success: false, error: 'La sesión cambió. Vuelve a intentar la publicación.' };
      const policy = state.organizationFeaturePolicies[featureScope(session.serverUrl, session.currentUser.organizationId)];
      if (!policy || state.featurePolicyRequest?.status === 'error') {
        const detail = state.featurePolicyRequest?.error;
        return {
          success: false,
          error: detail
            ? `No se pudo confirmar la configuración de simulación del servidor: ${detail}`
            : 'No se pudo confirmar la configuración de simulación del servidor.',
        };
      }
      const mode = energyCalculationMode(effectiveFeatureSettings(state));
      // One immutable publication captures both the confirmed policy and its financial result.
      // The caller's preview may have been calculated before settings changed.
      summary = calculateProjectFinancialSummary(project, mode);
      const calculationSnapshot = { mode, organizationId: session.currentUser.organizationId, policyVersion: policy.version, capturedAt: new Date().toISOString() };
      // Remove large unnecessary base64 or temporary buffers from project payload if needed
      const projectPayload = {
        id: project.id,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        client: project.client,
        specs: project.specs,
        rates: project.rates,
        financials: project.financials,
        monthlyConsumption: project.monthlyConsumption,
        customization: {
          companyName: project.customization?.companyName,
          companySlogan: project.customization?.companySlogan,
          companyFooterText: project.customization?.companyFooterText,
          companyPhone: project.customization?.companyPhone,
          companyEmail: project.customization?.companyEmail,
          companyRnc: project.customization?.companyRnc,
          companyWebsite: project.customization?.companyWebsite,
          companyInstagram: project.customization?.companyInstagram,
          headerLogoBase64: project.customization?.headerLogoBase64 || project.customization?.coverLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64,
          coverLogoBase64: project.customization?.coverLogoBase64 || project.customization?.headerLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64,
          contactName: project.customization?.contactName,
          clientPhone: project.customization?.clientPhone,
          clientEmail: project.customization?.clientEmail,
          regulatoryNote: project.customization?.regulatoryNote,
          validityNote: project.customization?.validityNote,
          panelWarrantyText: project.customization?.panelWarrantyText,
          inverterWarrantyText: project.customization?.inverterWarrantyText,
          batteryWarrantyText: project.customization?.batteryWarrantyText,
          workmanshipWarrantyText: project.customization?.workmanshipWarrantyText,
          servicesIncludedText: project.customization?.servicesIncludedText,
          // Page 6 & Custom engineering descriptions
          projectSummarySubtitle: project.customization?.projectSummarySubtitle,
          projectEngineeringScopeText: project.customization?.projectEngineeringScopeText,
          customProjectSummaryParagraph1: project.customization?.customProjectSummaryParagraph1,
          customProjectSummaryParagraph2: project.customization?.customProjectSummaryParagraph2,
          aboutUsIntroText: project.customization?.aboutUsIntroText,
          aboutUsTransitionText: project.customization?.aboutUsTransitionText,
          whyChooseUsText: project.customization?.whyChooseUsText,
          showSelfConsumptionInProposal: project.customization?.showSelfConsumptionInProposal,
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.authToken}`,
        },
        body: JSON.stringify({
          project: projectPayload,
          calculationSnapshot,
          summary,
          validityDays,
        }),
      });

      if (!this.contextIsCurrent(publicationContext)) return { success: false, error: 'La sesión cambió durante la publicación. Vuelve a consultar el historial de la organización original.' };
      if (!response.ok) {
        let errorMsg = `Error en el servidor (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson?.error) errorMsg = errJson.error;
        } catch {
          // ignore json parse error
        }
        return { success: false, error: errorMsg };
      }

      const result = await response.json();
      if (!this.contextIsCurrent(publicationContext)) return { success: false, error: 'La sesión cambió durante la publicación. Vuelve a consultar el historial de la organización original.' };
      if (result && result.success && result.shareUrl && typeof result.id === 'string' && /^[a-zA-Z0-9_-]{7,64}$/.test(result.id)) {
        const resolvedExpiresAt =
          result.expiresAt || new Date(Date.now() + validityDays * 86400 * 1000).toISOString();
        const resolvedId = result.id;
        // Use the selected HTTPS publication origin. Proxy transport URLs or an
        // unrelated URL in a response must never become a QR/link destination.
        const shareUrl = `${baseUrl}/p/${resolvedId}`;

        // Cache locally for the current project
        try {
          localStorage.setItem(
            this.lastShareKey(publicationContext, project.id),
            JSON.stringify({
              serverUrl: publicationContext.serverUrl,
              organizationId: publicationContext.organizationId,
              id: resolvedId,
              shareUrl,
              expiresAt: resolvedExpiresAt,
              validityDays: result.validityDays || validityDays,
              savedAt: new Date().toISOString(),
              clientName: project.client?.name || 'Cliente',
              projectCode: project.client?.projectId || project.id,
              quoteNumber: project.client?.quoteNumber || 'C-0001',
              systemKWp: Number(summary?.systemCapacityKWp || 0),
            })
          );
        } catch {
          // ignore cache error
        }

        // Guardar en el historial centralizado de enlaces
        const newRecord: SharedProposalRecord = {
          serverUrl: publicationContext.serverUrl,
          organizationId: publicationContext.organizationId,
          id: resolvedId,
          projectId: project.id,
          projectCode: project.client?.projectId || project.id,
          quoteNumber: project.client?.quoteNumber || 'C-0001',
          clientName: project.client?.name || 'Cliente Solar',
          companyName: project.client?.company || '',
          location: project.client?.location || project.client?.province || 'República Dominicana',
          systemKWp: Number(summary?.systemCapacityKWp || 0),
          shareUrl,
          createdAt: new Date().toISOString(),
          expiresAt: resolvedExpiresAt,
          validityDays: result.validityDays || validityDays,
          workerUrl: baseUrl,
        };
        this.saveSharedRecord(newRecord);

        return { ...result, shareUrl };
      }

      return {
        success: false,
        error: result?.error || 'No se recibió una URL válida del servidor.',
      };
    } catch (err: any) {
      console.error('Error in shareProposalService:', err);
      return {
        success: false,
        error: err?.message || 'Error de conexión con el servicio Cloudflare. Verifica tu conexión a internet o la URL del Worker.',
      };
    }
  }

  public static getLastSharedInfo(projectId: string): {
    id: string; shareUrl: string; expiresAt: string; validityDays: number; savedAt: string;
  } | null {
    const context = this.historyContext();
    if (!context) return null;
    try {
      const parsed = JSON.parse(localStorage.getItem(this.lastShareKey(context, projectId)) || 'null');
      if (parsed && this.recordBelongsTo(parsed, context) && new Date(parsed.expiresAt) > new Date()) return parsed;
      // Explicitly scoped migrated history can replace an old single-project cache.
      const record = this.getSharedHistory().find((entry) => entry.projectId === projectId && new Date(entry.expiresAt) > new Date());
      return record ? { ...record, savedAt: record.createdAt } : null;
    } catch { return null; }
  }

  /** Lists only the remembered authenticated organization's own links. Unscoped legacy is quarantined. */
  public static getSharedHistory(): SharedProposalRecord[] {
    try {
    const context = this.historyContext();
    if (!context) return [];
    const records = this.readScopedRecords(context);
    const reconciled = this.reconcileWithLocalProjects(records);
    if (reconciled.hasChanges) this.writeRecords(context, reconciled.updatedRecords);
    return reconciled.updatedRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch { return []; }
  }

  public static reconcileWithLocalProjects(records?: SharedProposalRecord[]): {
    updatedRecords: SharedProposalRecord[]; hasChanges: boolean;
  } {
    const context = this.historyContext();
    if (!context) return { updatedRecords: [], hasChanges: false };
    const projects = useSimulationStore.getState().projects.filter((project) =>
      project.organizationId === context.organizationId && !!project.syncServerUrl && canonicalServer(project.syncServerUrl) === context.serverUrl);
    const list = (records || this.readScopedRecords(context)).filter((record) => this.recordBelongsTo(record, context));
    let hasChanges = false;
    const updatedRecords = list.map((record) => {
      const project = projects.find((item) => item.id === record.projectId);
      if (!project) return record;
      const result = { ...record };
      if ((!result.clientName || ['Propuesta Solar', 'Cliente Solar', 'Cliente'].includes(result.clientName)) && project.client?.name) result.clientName = project.client.name;
      if ((!result.projectCode || result.projectCode === result.projectId || result.projectCode.startsWith('proj-')) && project.client?.projectId) result.projectCode = project.client.projectId;
      if ((!result.quoteNumber || result.quoteNumber === 'C-0001') && project.client?.quoteNumber) result.quoteNumber = project.client.quoteNumber;
      if (!result.systemKWp) result.systemKWp = Number(((project.specs.panelCount * project.specs.panelPowerW) / 1000).toFixed(2));
      if (!result.location) result.location = project.client.province || project.client.location;
      if (!result.companyName) result.companyName = project.client.company;
      if (JSON.stringify(result) !== JSON.stringify(record)) hasChanges = true;
      return result;
    });
    if (hasChanges && !records) {
      if (this.writeRecords(context, updatedRecords)) this.notifyHistoryUpdated();
    }
    return { updatedRecords, hasChanges };
  }

  /** Hydrates the captured scope only; changes of identity, organization or session discard pending responses. */
  public static async hydrateFromCloudflare(customWorkerUrl?: string): Promise<{ updatedCount: number; errors: number }> {
    const context = this.historyContext();
    if (!context) return { updatedCount: 0, errors: 0 };
    const history = this.getSharedHistory();
    const candidates = history.filter((record) => !record.clientName || ['Propuesta Solar', 'Cliente Solar', 'Cliente'].includes(record.clientName) || !record.projectCode || record.projectCode === record.projectId || record.projectCode.startsWith('proj-') || !record.quoteNumber || record.quoteNumber === 'C-0001' || !record.systemKWp);
    const groups = new Map<string, SharedProposalRecord[]>();
    for (const record of candidates) {
      const base = (customWorkerUrl || record.workerUrl || this.getWorkerUrl()).replace(/\/+$/, '');
      const group = groups.get(base) || [];
      group.push(record);
      groups.set(base, group);
    }
    let updatedCount = 0;
    let errors = 0;
    const apply = (metadata: Record<string, unknown>, expectedId: string): boolean => {
      if (!this.contextIsCurrent(context)) return false;
      // Read latest storage so late hydration never restores a deleted link or discards a newer publication.
      const latest = this.readScopedRecords(context);
      const index = latest.findIndex((record) => record.id === expectedId);
      if (index < 0) return false;
      const previous = latest[index];
      const next = { ...previous };
      for (const field of ['clientName', 'projectCode', 'quoteNumber', 'location', 'companyName'] as const) {
        if (typeof metadata[field] === 'string' && metadata[field]) next[field] = metadata[field];
      }
      if (typeof metadata.systemKWp === 'number' && Number.isFinite(metadata.systemKWp) && metadata.systemKWp > 0) next.systemKWp = metadata.systemKWp;
      if (JSON.stringify(next) === JSON.stringify(previous)) return false;
      latest[index] = next;
      if (!this.writeRecords(context, latest)) return false;
      this.notifyHistoryUpdated();
      return true;
    };
    const batches = [...groups.entries()].flatMap(([base, records]) => {
      const result: [string, SharedProposalRecord[]][] = [];
      for (let offset = 0; offset < records.length; offset += 50) result.push([base, records.slice(offset, offset + 50)]);
      return result;
    });
    for (const [base, records] of batches) {
      if (!this.contextIsCurrent(context)) return { updatedCount: 0, errors: 0 };
      let hydrated = false;
      try {
        if (new URL(base).protocol !== 'https:') throw new Error('HTTPS requerido para consultar enlaces.');
        const response = await fetch(`${base}/api/share/hydrate`, {
          signal: AbortSignal.timeout(8000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: records.map((record) => record.id) }),
        });
        const data = response.ok ? await response.json() : null;
        if (!this.contextIsCurrent(context)) return { updatedCount: 0, errors: 0 };
        if (data?.success && Array.isArray(data.proposals)) {
          const expected = new Set(records.map((record) => record.id));
          const received = new Set<string>();
          for (const metadata of data.proposals) {
            if (!metadata || !expected.has(metadata.id) || received.has(metadata.id)) continue;
            received.add(metadata.id);
            if (apply(metadata, metadata.id)) updatedCount++;
          }
          errors += expected.size - received.size;
          hydrated = true;
        }
      } catch { /* Older Workers may require the individual endpoint. */ }
      if (hydrated) continue;
      for (const record of records) {
        if (!this.contextIsCurrent(context)) return { updatedCount: 0, errors: 0 };
        try {
          if (new URL(base).protocol !== 'https:') throw new Error('HTTPS requerido.');
          const response = await fetch(`${base}/api/share/${encodeURIComponent(record.id)}`, { signal: AbortSignal.timeout(8000) });
          const data = response.ok ? await response.json() : null;
          if (!this.contextIsCurrent(context)) return { updatedCount: 0, errors: 0 };
          if (data?.success) { if (apply(data, record.id)) updatedCount++; }
          else errors++;
        } catch { errors++; }
      }
    }
    return { updatedCount, errors };
  }

  public static saveSharedRecord(record: SharedProposalRecord): void {
    const context = this.historyContext();
    if (!context) return;
    // This method creates new local records; existing legacy storage is never passed here for migration.
    const scoped = { ...record, serverUrl: record.serverUrl ? canonicalServer(record.serverUrl) : context.serverUrl, organizationId: record.organizationId || context.organizationId };
    if (!this.recordBelongsTo(scoped, context)) return;
    const records = this.readScopedRecords(context);
    const index = records.findIndex((entry) => entry.id === record.id);
    if (index >= 0) records[index] = { ...records[index], ...scoped };
    else records.unshift(scoped);
    if (this.writeRecords(context, records)) this.notifyHistoryUpdated();
  }

  public static deleteSharedRecord(id: string): void {
    const context = this.historyContext();
    if (!context) return;
    const history = this.getSharedHistory();
    const record = history.find((entry) => entry.id === id);
    if (!this.writeRecords(context, history.filter((entry) => entry.id !== id))) return;
    if (record) localStorage.removeItem(this.lastShareKey(context, record.projectId));
    this.notifyHistoryUpdated();
  }

  public static clearExpiredRecords(): number {
    const context = this.historyContext();
    if (!context) return 0;
    const history = this.getSharedHistory();
    const active = history.filter((record) => new Date(record.expiresAt) > new Date());
    if (!this.writeRecords(context, active)) return 0;
    for (const record of history.filter((record) => !active.includes(record))) localStorage.removeItem(this.lastShareKey(context, record.projectId));
    this.notifyHistoryUpdated();
    return history.length - active.length;
  }

  public static clearAllSharedRecords(): void {
    const context = this.historyContext();
    if (!context) return;
    for (const record of this.getSharedHistory()) localStorage.removeItem(this.lastShareKey(context, record.projectId));
    this.writeRecords(context, []);
    this.notifyHistoryUpdated();
  }

  /**
   * Calcula el tiempo restante de actividad de un enlace y su porcentaje de vida útil.
   */
  public static getRemainingTime(createdAt: string, expiresAt: string): RemainingTimeInfo {
    const now = new Date().getTime();
    const exp = new Date(expiresAt).getTime();
    const created = new Date(createdAt).getTime();
    const diffMs = exp - now;

    if (diffMs <= 0) {
      return {
        isExpired: true,
        days: 0,
        hours: 0,
        minutes: 0,
        formattedText: 'Expirado',
        percentRemaining: 0,
        color: 'rose',
        badgeText: 'Expirado',
      };
    }

    const totalDuration = Math.max(exp - created, 86400000);
    const percentRemaining = Math.max(0, Math.min(100, Math.round((diffMs / totalDuration) * 100)));

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let formattedText = '';
    if (days > 0) {
      formattedText = `${days}d ${hours}h restantes`;
    } else if (hours > 0) {
      formattedText = `${hours}h ${minutes}m restantes`;
    } else {
      formattedText = `${Math.max(1, minutes)}m restantes`;
    }

    let color: 'emerald' | 'amber' | 'rose' = 'emerald';
    let badgeText = 'Activo';

    if (days < 1) {
      color = 'rose';
      badgeText = 'Por Expirar';
    } else if (days <= 2) {
      color = 'amber';
      badgeText = 'Poco Tiempo';
    }

    return {
      isExpired: false,
      days,
      hours,
      minutes,
      formattedText,
      percentRemaining,
      color,
      badgeText,
    };
  }

  /**
   * Prueba de conexión activa con el microservicio Cloudflare Worker (/api/health).
   */
  public static async testWorkerConnection(workerUrl?: string): Promise<{
    success: boolean;
    message: string;
    latencyMs?: number;
  }> {
    const url = (workerUrl || this.getWorkerUrl()).replace(/\/+$/, '');
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${url}/api/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        return {
          success: true,
          message: `Servicio Cloudflare Worker operativo (${latencyMs}ms)`,
          latencyMs,
        };
      } else {
        return {
          success: false,
          message: `El Worker respondió con código HTTP ${res.status}`,
          latencyMs,
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        message:
          err.name === 'AbortError'
            ? 'Tiempo de espera agotado (>6s) al conectar con el Worker.'
            : (err?.message || 'No se pudo conectar con el servicio Cloudflare.'),
        latencyMs,
      };
    }
  }
}
