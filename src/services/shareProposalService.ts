import { ProjectSimulation, FinancialSummaryResult } from '../types';
import { ELECTSUN_LOGO_COLOR_BASE64 } from '../assets/electsunLogo';

export interface ShareResult {
  success: boolean;
  id?: string;
  shareUrl?: string;
  expiresAt?: string;
  validityDays?: number;
  error?: string;
}

const STORAGE_WORKER_URL_KEY = 'solarsim_share_worker_url';
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
        // Cache locally for the current project
        try {
          localStorage.setItem(
            `solarsim_last_share_${project.id}`,
            JSON.stringify({
              id: result.id,
              shareUrl: result.shareUrl,
              expiresAt: result.expiresAt,
              validityDays: result.validityDays,
              savedAt: new Date().toISOString(),
            })
          );
        } catch {
          // ignore cache error
        }
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
}
