import type { SimulationStore } from '../../store/types';
import type { ClientRecord } from '../../types/client';
import type { CompanyProfile } from '../../types/companyProfile';
import type { QuotationContent } from '../../types/quotation';
import { quotationContent } from '../../store/sync/quotationContent';
import { contentPatch, printedClientFromDirectory, setIssuer, setPrintedClient } from '../../domain/quotationEdit';
import { LOGO_REJECTED, issuerFromCompany } from './issuer';

type EditorStore = Pick<SimulationStore, 'quotations' | 'updateQuotationRecord' | 'linkQuotationToClient'>;

/**
 * Acciones del editor sobre una cotización, separadas de React para probarlas con el store real. Cada edición se aplica
 * sobre el contenido guardado más reciente (no sobre el de la última pintura): dos confirmaciones seguidas no se pisan.
 * Devuelven el mensaje de error del store o `null`.
 */
export function quotationEditorActions(getState: () => EditorStore, id: string) {
  const edit = (update: (content: QuotationContent) => QuotationContent): string | null => {
    const state = getState();
    const latest = state.quotations.find((q) => q.id === id);
    if (!latest) return 'Cotización no encontrada.';
    const base = quotationContent(latest);
    const patch = contentPatch(base, update(base));
    if (!Object.keys(patch).length) return null;
    const result = state.updateQuotationRecord(id, patch);
    return result.ok ? null : result.error;
  };
  const link = (clientId: string | null): string | null => {
    const result = getState().linkQuotationToClient(id, clientId);
    return result.ok ? null : result.error;
  };
  /** Elegir un cliente enlaza y copia sus datos a los impresos; quitarlo solo desenlaza (docs/CLIENTS.md). */
  const chooseClient = (client: ClientRecord | null): string | null => {
    if (!client) return link(null);
    return link(client.id) ?? edit((content) => setPrintedClient(content, printedClientFromDirectory(client)));
  };
  /** «Actualizar desde el membrete»: reemplaza el emisor impreso; un logo que la cotización no admite se omite. */
  const refreshIssuer = (company: CompanyProfile | undefined): string | null => {
    const issuer = issuerFromCompany(company);
    const failure = edit((content) => setIssuer(content, issuer));
    if (failure && issuer.logo && failure.startsWith(LOGO_REJECTED)) return edit((content) => setIssuer(content, { ...issuer, logo: '' }));
    return failure;
  };
  return { edit, link, chooseClient, refreshIssuer };
}
