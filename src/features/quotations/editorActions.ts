import type { SimulationStore } from '../../store/types';
import type { ClientRecord } from '../../types/client';
import type { CompanyProfile } from '../../types/companyProfile';
import type { QuotationContent } from '../../types/quotation';
import { quotationContent } from '../../store/sync/quotationContent';
import {
  contentPatch, linkSourceProposal, mergeSourceDocuments, printedClientFromDirectory, removeSourceDocument, setIssuer, setPrintedClient, unlinkSourceProposal,
} from '../../domain/quotationEdit';
import { proposalDocumentAttachments } from './proposalDocuments';
import { LOGO_REJECTED, issuerFromCompany } from './issuer';

type EditorStore = Pick<SimulationStore, 'quotations' | 'updateQuotationRecord' | 'linkQuotationToClient' | 'projects'>;

/** Resultado de traer documentos de la propuesta: error del store, añadidos y los que no cupieron. */
export interface SourceDocumentsResult { error: string | null; added: number; overflow: number }

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
  /**
   * Documentos de la propuesta de origen (solo lee la propuesta: nunca la modifica). Enlazar trae los que F7 sabe
   * convertir; «Actualizar» añade los nuevos sin duplicar ni reactivar los quitados.
   */
  const withSourceDocuments = (projectId: string, merge: (content: QuotationContent, docs: ReturnType<typeof proposalDocumentAttachments>['attachments']) => ReturnType<typeof mergeSourceDocuments>): SourceDocumentsResult => {
    const project = getState().projects.find((p) => p.id === projectId && !p.isDeleted);
    const docs = project ? proposalDocumentAttachments(project).attachments : [];
    let added = 0, overflow = 0;
    const error = edit((content) => {
      const result = merge(content, docs);
      ({ added, overflow } = result);
      return result.content;
    });
    return { error, added: error ? 0 : added, overflow };
  };
  const linkProposal = (projectId: string): SourceDocumentsResult => withSourceDocuments(projectId, (content, docs) => linkSourceProposal(content, projectId, docs));
  const refreshProposalDocuments = (): SourceDocumentsResult => {
    const latest = getState().quotations.find((q) => q.id === id);
    if (!latest?.sourceProjectId) return { error: null, added: 0, overflow: 0 };
    return withSourceDocuments(latest.sourceProjectId, mergeSourceDocuments);
  };
  const unlinkProposal = (keepDocuments: boolean): string | null => edit((content) => unlinkSourceProposal(content, keepDocuments));
  const removeProposalDocument = (attachmentId: string): string | null => edit((content) => removeSourceDocument(content, attachmentId));
  return { edit, link, chooseClient, refreshIssuer, linkProposal, refreshProposalDocuments, unlinkProposal, removeProposalDocument };
}
