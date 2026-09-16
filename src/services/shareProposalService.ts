import { ProjectSimulation, FinancialSummaryResult } from '../types';
import { ELECTSUN_LOGO_COLOR_BASE64 } from '../assets/electsunLogo';
import { useSimulationStore } from '../store/useSimulationStore';

export interface ShareResult {
  success: boolean;
  id?: string;
  shareUrl?: string;
  expiresAt?: string;
  validityDays?: number;
  error?: string;
}

export interface SharedProposalRecord {
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

export class ShareProposalService {
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
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project: projectPayload,
          summary,
          validityDays,
        }),
      });

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
      if (result && result.success && result.shareUrl) {
        const resolvedExpiresAt =
          result.expiresAt || new Date(Date.now() + validityDays * 86400 * 1000).toISOString();
        const resolvedId = result.id || Math.random().toString(36).substring(2, 9);

        // Cache locally for the current project
        try {
          localStorage.setItem(
            `solarsim_last_share_${project.id}`,
            JSON.stringify({
              id: resolvedId,
              shareUrl: result.shareUrl,
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
          id: resolvedId,
          projectId: project.id,
          projectCode: project.client?.projectId || project.id,
          quoteNumber: project.client?.quoteNumber || 'C-0001',
          clientName: project.client?.name || 'Cliente Solar',
          companyName: project.client?.company || '',
          location: project.client?.location || project.client?.province || 'República Dominicana',
          systemKWp: Number(summary?.systemCapacityKWp || 0),
          shareUrl: result.shareUrl,
          createdAt: new Date().toISOString(),
          expiresAt: resolvedExpiresAt,
          validityDays: result.validityDays || validityDays,
          workerUrl: baseUrl,
        };
        this.saveSharedRecord(newRecord);

        return result;
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
    id: string;
    shareUrl: string;
    expiresAt: string;
    validityDays: number;
    savedAt: string;
  } | null {
    try {
      const raw = localStorage.getItem(`solarsim_last_share_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Check if not expired yet
        if (parsed?.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Obtiene la lista completa de todas las propuestas web generadas en Cloudflare.
   * Auto-migra cualquier clave suelta de tipo solarsim_last_share_* presente en el navegador.
   */
  /**
   * Obtiene la lista completa de todas las propuestas web generadas en Cloudflare.
   * Auto-migra cualquier clave suelta de tipo solarsim_last_share_* presente en el navegador
   * y reconcilia retroactivamente los nombres y códigos de proyectos locales existentes.
   */
  public static getSharedHistory(): SharedProposalRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_SHARED_HISTORY_KEY);
      let history: SharedProposalRecord[] = raw ? JSON.parse(raw) : [];

      // Auto-migración de registros antiguos en localStorage
      let hasMigration = false;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('solarsim_last_share_')) {
          try {
            const rawItem = localStorage.getItem(key);
            if (rawItem) {
              const parsed = JSON.parse(rawItem);
              if (parsed?.id && !history.some((h) => h.id === parsed.id || (h.shareUrl && h.shareUrl === parsed.shareUrl))) {
                const projId = key.replace('solarsim_last_share_', '');
                history.push({
                  id: parsed.id,
                  projectId: projId,
                  projectCode: parsed.projectCode || projId,
                  quoteNumber: parsed.quoteNumber || 'C-0001',
                  clientName: parsed.clientName || 'Propuesta Solar',
                  systemKWp: parsed.systemKWp || 0,
                  shareUrl: parsed.shareUrl,
                  createdAt: parsed.savedAt || new Date().toISOString(),
                  expiresAt: parsed.expiresAt,
                  validityDays: parsed.validityDays || 7,
                  workerUrl: parsed.workerUrl || this.getWorkerUrl(),
                });
                hasMigration = true;
              }
            }
          } catch {
            // ignore
          }
        }
      }

      // Reconciliación local automática con proyectos de la tienda Zustand
      const { updatedRecords, hasChanges } = this.reconcileWithLocalProjects(history);
      if (hasChanges) {
        history = updatedRecords;
        hasMigration = true;
      }

      if (hasMigration) {
        localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(history));
      }

      return history.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (err) {
      console.error('Error al leer el historial de propuestas compartidas:', err);
      return [];
    }
  }

  /**
   * Reconcilia registros del historial con los proyectos locales de la tienda Zustand.
   * Si un registro contiene valores genéricos/marcador ('Propuesta Solar', 'proj-...', 'C-0001')
   * y el proyecto correspondiente existe localmente, enriquece los metadatos reales al instante.
   */
  public static reconcileWithLocalProjects(records?: SharedProposalRecord[]): {
    updatedRecords: SharedProposalRecord[];
    hasChanges: boolean;
  } {
    try {
      let localProjects: ProjectSimulation[] = [];
      try {
        const store = useSimulationStore.getState();
        if (store && Array.isArray(store.projects)) {
          localProjects = store.projects;
        }
      } catch {
        // Entorno sin Zustand (tests unitarios aislados)
      }

      const list = records ? [...records] : (JSON.parse(localStorage.getItem(STORAGE_SHARED_HISTORY_KEY) || '[]') as SharedProposalRecord[]);
      if (!localProjects.length || !list.length) {
        return { updatedRecords: list, hasChanges: false };
      }

      let hasChanges = false;
      const updated = list.map((record) => {
        const matched = localProjects.find((p) => p.id === record.projectId);
        if (!matched) return record;

        let changed = false;
        const newRec = { ...record };

        const isGenericName =
          !newRec.clientName ||
          newRec.clientName === 'Propuesta Solar' ||
          newRec.clientName === 'Cliente Solar' ||
          newRec.clientName === 'Cliente';

        if (isGenericName && matched.client?.name) {
          newRec.clientName = matched.client.name;
          changed = true;
        }

        const isGenericCode =
          !newRec.projectCode ||
          newRec.projectCode === newRec.projectId ||
          newRec.projectCode.startsWith('proj-');

        if (isGenericCode && matched.client?.projectId) {
          newRec.projectCode = matched.client.projectId;
          changed = true;
        }

        const isGenericQuote =
          !newRec.quoteNumber ||
          newRec.quoteNumber === 'C-0001';

        if (isGenericQuote && matched.client?.quoteNumber && matched.client.quoteNumber !== 'C-0001') {
          newRec.quoteNumber = matched.client.quoteNumber;
          changed = true;
        }

        if (!newRec.systemKWp || newRec.systemKWp === 0) {
          const kwp = Number(
            (((matched.specs?.panelCount || 0) * (matched.specs?.panelPowerW || 0)) / 1000).toFixed(2)
          );
          if (kwp > 0) {
            newRec.systemKWp = kwp;
            changed = true;
          }
        }

        if (!newRec.location && (matched.client?.province || matched.client?.location)) {
          newRec.location = matched.client.province || matched.client.location;
          changed = true;
        }

        if (!newRec.companyName && matched.client?.company) {
          newRec.companyName = matched.client.company;
          changed = true;
        }

        if (changed) {
          hasChanges = true;
          return newRec;
        }
        return record;
      });

      if (hasChanges && !records) {
        localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(updated));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
        }
      }

      return { updatedRecords: updated, hasChanges };
    } catch (err) {
      console.error('Error reconciliando historial con proyectos locales:', err);
      return { updatedRecords: records || [], hasChanges: false };
    }
  }

  /**
   * Consulta el Worker de Cloudflare para enriquecer metadatos reales de propuestas activas
   * (nombres de cliente, IDs formales SP-2026-..., números de cotización C-010X y potencias kWp).
   */
  public static async hydrateFromCloudflare(
    customWorkerUrl?: string
  ): Promise<{ updatedCount: number; errors: number }> {
    try {
      const history = this.getSharedHistory();
      if (!history.length) return { updatedCount: 0, errors: 0 };

      // Identificar propuestas que aún tengan nombres o códigos de marcador de posición
      const needsHydration = history.filter((r) => {
        const isGenericName =
          !r.clientName ||
          r.clientName === 'Propuesta Solar' ||
          r.clientName === 'Cliente Solar' ||
          r.clientName === 'Cliente';
        const isGenericCode =
          !r.projectCode ||
          r.projectCode === r.projectId ||
          r.projectCode.startsWith('proj-');
        const isGenericQuote = !r.quoteNumber || r.quoteNumber === 'C-0001';
        return isGenericName || isGenericCode || isGenericQuote || !r.systemKWp;
      });

      if (!needsHydration.length) {
        return { updatedCount: 0, errors: 0 };
      }

      const baseUrl = (customWorkerUrl || this.getWorkerUrl()).replace(/\/+$/, '');
      const ids = needsHydration.map((r) => r.id);

      let updatedCount = 0;
      let errors = 0;

      // 1. Intentar con el endpoint de lote POST /api/share/hydrate
      try {
        const res = await fetch(`${baseUrl}/api/share/hydrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.proposals)) {
            let hasChanges = false;
            for (const prop of data.proposals) {
              const idx = history.findIndex((h) => h.id === prop.id);
              if (idx >= 0) {
                history[idx] = {
                  ...history[idx],
                  clientName: prop.clientName || history[idx].clientName,
                  projectCode: prop.projectCode || history[idx].projectCode,
                  quoteNumber: prop.quoteNumber || history[idx].quoteNumber,
                  systemKWp: prop.systemKWp || history[idx].systemKWp,
                  location: prop.location || history[idx].location,
                  companyName: prop.companyName || history[idx].companyName,
                };
                updatedCount++;
                hasChanges = true;
              }
            }
            if (hasChanges) {
              localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(history));
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
              }
              return { updatedCount, errors };
            }
          }
        }
      } catch (batchErr) {
        console.warn('Batch hydration fallo, intentando fallback individual:', batchErr);
      }

      // 2. Fallback individual GET /api/share/:id para cualquier elemento pendiente
      for (const rec of needsHydration) {
        try {
          const res = await fetch(`${baseUrl}/api/share/${rec.id}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
              const idx = history.findIndex((h) => h.id === rec.id);
              if (idx >= 0) {
                history[idx] = {
                  ...history[idx],
                  clientName: data.clientName || history[idx].clientName,
                  projectCode: data.projectCode || history[idx].projectCode,
                  quoteNumber: data.quoteNumber || history[idx].quoteNumber,
                  systemKWp: data.systemKWp || history[idx].systemKWp,
                  location: data.location || history[idx].location,
                  companyName: data.companyName || history[idx].companyName,
                };
                updatedCount++;
              }
            }
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      }

      if (updatedCount > 0) {
        localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(history));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
        }
      }

      return { updatedCount, errors };
    } catch (err) {
      console.error('Error general durante la hidratación de Cloudflare:', err);
      return { updatedCount: 0, errors: 1 };
    }
  }

  /**
   * Guarda o actualiza un registro en el historial compartido.
   */
  public static saveSharedRecord(record: SharedProposalRecord): void {
    try {
      const history = this.getSharedHistory();
      const existingIdx = history.findIndex((h) => h.id === record.id);
      if (existingIdx >= 0) {
        history[existingIdx] = { ...history[existingIdx], ...record };
      } else {
        history.unshift(record);
      }
      localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(history));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
      }
    } catch (err) {
      console.error('Error guardando registro de propuesta compartida:', err);
    }
  }

  /**
   * Elimina un enlace del historial.
   */
  public static deleteSharedRecord(id: string): void {
    try {
      const history = this.getSharedHistory().filter((h) => h.id !== id);
      localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(history));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
      }
    } catch (err) {
      console.error('Error eliminando enlace del historial:', err);
    }
  }

  /**
   * Elimina del historial todos los enlaces que hayan expirado.
   */
  public static clearExpiredRecords(): number {
    try {
      const now = new Date();
      const history = this.getSharedHistory();
      const active = history.filter((h) => new Date(h.expiresAt) > now);
      const removedCount = history.length - active.length;
      localStorage.setItem(STORAGE_SHARED_HISTORY_KEY, JSON.stringify(active));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
      }
      return removedCount;
    } catch (err) {
      console.error('Error limpiando enlaces expirados:', err);
      return 0;
    }
  }

  /**
   * Limpia todo el historial de enlaces generados.
   */
  public static clearAllSharedRecords(): void {
    try {
      localStorage.removeItem(STORAGE_SHARED_HISTORY_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('solarsim_shared_links_updated'));
      }
    } catch (err) {
      console.error('Error borrando historial completo:', err);
    }
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
