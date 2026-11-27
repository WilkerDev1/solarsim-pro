import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Eye, FileText, Lock, Paperclip, Palette, RotateCcw, Send } from 'lucide-react';
import { canWrite } from '../../../../shared/permissions';
import { canTransitionQuotation, effectiveQuotationStatus, isQuotationContentLocked, type QuotationStatus } from '../../../../shared/quotations';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { quotationContent } from '../../../store/sync/quotationContent';
import type { QuotationRecord } from '../../../types/quotation';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { newDocumentCompany, stampForIssuer } from '../../../features/quotations/issuer';
import { quotationCatalogContext } from '../../../features/quotations/catalogLine';
import { quotationEditorActions } from '../../../features/quotations/editorActions';
import { selectSourceProject, sourceProposalLink, sourceProposalOptions } from '../../../features/quotations/linkedQuotations';
import { storeGenericPriceFor } from '../../simulator/params/logic/storeGenericPrice';
import { localIsoDate } from '../../../utils/localDate';
import { QuotationStatusChip } from '../common/QuotationStatusChip';
import { ClientSection, DiscountsSection, DocumentSection, IssuerSection, ItemsSection, NotesSection, type Edit } from './ContentSections';
import { QuotationPreview, type PreviewView } from './QuotationPreview';
import { DesignTab } from './DesignTab';
import { AttachmentsTab } from './AttachmentsTab';
import { templateFromQuotation } from '../../../../shared/quotations';
import { printedSignature, printedStamp } from '../../../features/quotations/library';
import { useAssetImage } from '../../../features/quotations/assetImages';
import { quotationSaveStatus } from './saveStatus';
import '../../clients/client-link.css';
import './quotation-editor.css';
import './source-proposal.css';

/**
 * Editor de una cotización (docs/QUOTATION_EDITOR.md): formulario a la izquierda y la hoja real a la derecha. No hay
 * «Guardar»: cada cambio confirmado se guarda con `updateQuotationRecord`. Mirar nunca escribe.
 */
export const QuotationEditorView: React.FC<{ initialPreview?: PreviewView }> = ({ initialPreview }) => {
  const { activeQuotationId, quotation, closeQuotation } = useSimulationStore(useShallow((s) => ({
    activeQuotationId: s.activeQuotationId,
    quotation: s.quotations.find((q) => q.id === s.activeQuotationId),
    closeQuotation: s.closeQuotation,
  })));
  // La vista activa se persiste pero la cotización activa no (o ya no existe): de vuelta al catálogo, sin escribir nada.
  useEffect(() => {
    if (!activeQuotationId || !quotation) closeQuotation();
  }, [activeQuotationId, quotation, closeQuotation]);
  if (!quotation) return null;
  return <QuotationEditor key={quotation.id} quotation={quotation} initialPreview={initialPreview} />;
};

const LOCK_REASONS: Record<QuotationStatus, string> = {
  draft: '',
  issued: 'Emitida: el contenido está bloqueado. Reábrela para editarla.',
  accepted: 'Aceptada: el contenido ya no se puede editar.',
  rejected: 'Rechazada: reábrela como borrador para editarla.',
  void: 'Anulada: solo se puede consultar.',
};

const QuotationEditor: React.FC<{ quotation: QuotationRecord; initialPreview?: PreviewView }> = ({ quotation, initialPreview }) => {
  const {
    change, sidebarTheme, currentUser, online, clients, sourceProject, catalog, defaults, seal, setQuotationStatus, closeQuotation, setActiveProject, templates, signatures, openQuotationLibrary, imageIssues,
  } = useSimulationStore(useShallow((s) => ({
    imageIssues: s.quotationAssetIssues[quotation.id],
    templates: s.quotationLibrary.templates.items,
    signatures: s.quotationLibrary.signatures.items,
    openQuotationLibrary: s.openQuotationLibrary,
    change: s.quotationChanges[quotation.id],
    sidebarTheme: s.sidebarTheme,
    currentUser: s.syncSettings.currentUser,
    online: !!s.syncSettings.currentUser && !!s.syncSettings.authToken,
    clients: s.clients,
    // Solo la propuesta de origen (misma referencia mientras no cambie), no toda la lista de propuestas.
    sourceProject: selectSourceProject(s, quotation.sourceProjectId),
    catalog: s.equipmentCatalog,
    defaults: s.defaultSimulationSettings,
    // El sello es el del membrete que emitió la cotización, nunca el de otra empresa (el activo puede ser otro).
    seal: stampForIssuer(s.companies, quotation.issuer),
    setQuotationStatus: s.setQuotationStatus,
    closeQuotation: s.closeQuotation,
    setActiveProject: s.setActiveProject,
  })));
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pane, setPane] = useState<'form' | 'preview'>('form');
  const [tab, setTab] = useState<'content' | 'design' | 'attachments'>('content');
  const id = quotation.id;
  const writable = canWrite(currentUser);
  const locked = isQuotationContentLocked(quotation.status);
  const readOnly = !writable || locked;
  const content = useMemo(() => quotationContent(quotation), [quotation]);
  const displayStatus = effectiveQuotationStatus(quotation, localIsoDate());
  const save = quotationSaveStatus(change, { online, version: quotation.version });
  const canReopen = writable && locked && canTransitionQuotation(quotation.status, 'draft');

  const actions = useMemo(() => quotationEditorActions(useSimulationStore.getState, id), [id]);
  const edit: Edit = actions.edit;
  const transition = (status: QuotationStatus) => {
    const result = setQuotationStatus(id, status);
    setStatusError(result.ok ? null : result.error);
  };
  // Margen de las propuestas automáticas con los ajustes del usuario y genérico vigente al abrir el selector (ADR 0006).
  const catalogContext = useCallback(
    (item: SolarEquipmentItem) => quotationCatalogContext(content, defaults, storeGenericPriceFor(item.id)),
    [content, defaults],
  );
  // Imágenes de la hoja: en línea al instante; las referencias del servidor, cuando llegan (mirar nunca escribe).
  // Un borrador sigue la biblioteca; una bloqueada imprime solo su copia fija (printedSignature/printedStamp).
  const signer = useMemo(() => printedSignature(content, signatures), [content, signatures]);
  const stampSource = printedStamp(content, signatures, seal);
  const signerImage = useAssetImage(signer?.image);
  const stamp = useAssetImage(stampSource);
  const logo = useAssetImage(content.issuer.logo);
  // Color personalizado mientras se elige: solo la vista previa, sin escribir hasta confirmarlo.
  const [previewAccent, setPreviewAccent] = useState<string | null>(null);
  const sheet = useMemo(() => ({
    ...content,
    number: quotation.number,
    design: previewAccent ? { ...content.design, accent: previewAccent } : content.design,
    issuer: { ...content.issuer, logo: logo ?? '' },
    signature: signer ? { name: signer.name, role: signer.role, image: signerImage } : null,
  }), [content, quotation.number, logo, signer, signerImage, previewAccent]);
  const imageSources = useMemo(() => [
    { label: 'el logo del emisor', value: content.issuer.logo, apply: 'logo' as const },
    { label: 'la firma', value: signer?.image ?? '', apply: 'signature' as const },
    { label: 'el sello', value: stampSource ?? '', apply: 'stamp' as const },
  ], [content.issuer.logo, signer, stampSource]);
  const saveTemplate = (name: string) => {
    const result = useSimulationStore.getState().createQuotationTemplate(templateFromQuotation(content, name));
    return result.ok ? null : result.error;
  };
  const tabs = [
    { id: 'content' as const, label: 'Contenido', icon: FileText },
    { id: 'design' as const, label: 'Plantilla y firmas', icon: Palette },
    { id: 'attachments' as const, label: content.attachments.length ? `Adjuntos · ${content.attachments.length}` : 'Adjuntos', icon: Paperclip },
  ];
  // «Agregar correo del cliente» en la vista de correo: abre Contenido, despliega los datos impresos y enfoca «Correo».
  // Solo cambia la vista (estado local); no escribe nada.
  const goToClientEmail = () => {
    setTab('content');
    setPane('form');
    requestAnimationFrame(() => {
      const details = document.getElementById('qe-client-printed') as HTMLDetailsElement | null;
      if (!details) return;
      details.open = true;
      const input = details.querySelector<HTMLInputElement>('input[type="email"]');
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
    });
  };
  const readOnlyReason = !writable ? 'Solo lectura: tu rol no permite editar cotizaciones.' : LOCK_REASONS[quotation.status];

  return (
    <div className="quotation-editor" data-theme={sidebarTheme}>
      <header className="qe-header">
        <div className="qe-header-identity">
          <button type="button" className="qe-back" onClick={closeQuotation}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Cotizaciones
          </button>
          <span className="qe-divider" aria-hidden="true" />
          <h1>{quotation.number ?? 'Sin número'}</h1>
          <QuotationStatusChip status={displayStatus} />
          <span className={`qe-save qe-save-${save.tone}`} title={save.detail}>
            <span className="qe-save-dot" aria-hidden="true" />
            {save.label}
            {save.detail && <span className="sr-only">: {save.detail}</span>}
          </span>
        </div>
        <div className="qe-actions">
          {writable && quotation.status === 'draft' && (
            <button type="button" className="qe-btn qe-btn-primary" onClick={() => transition('issued')}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Emitir cotización
            </button>
          )}
          {canReopen && (
            <button type="button" className="qe-btn qe-btn-primary" onClick={() => transition('draft')}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reabrir para editar
            </button>
          )}
        </div>
        {statusError && <p className="qe-header-error" role="alert">{statusError}</p>}
      </header>
      <div className="qe-pane-switch" role="group" aria-label="Mostrar">
        <button type="button" aria-pressed={pane === 'form'} onClick={() => setPane('form')}><FileText className="h-4 w-4" aria-hidden="true" />Contenido</button>
        <button type="button" aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}><Eye className="h-4 w-4" aria-hidden="true" />Vista previa</button>
      </div>
      <div className="qe-body" data-pane={pane}>
        <div className="qe-form" aria-label="Contenido de la cotización" role="region">
          {readOnly && (
            <p className="qe-lock-notice" role="note">
              <Lock className="h-4 w-4" aria-hidden="true" />
              <span>{readOnlyReason}</span>
            </p>
          )}
          {imageIssues?.filter((issue) => issue.kind === 'image').map((issue) => (
            <p key={issue.message} className="qe-field-hint qe-asset-issue" role="note">{issue.message}</p>
          ))}
          <div className="qe-tabs" role="tablist" aria-label="Secciones del editor">
            {tabs.map(({ id: tabId, label, icon: Icon }) => (
              <button key={tabId} type="button" role="tab" id={`qe-tab-${tabId}`} aria-controls={`qe-panel-${tabId}`} aria-selected={tab === tabId} tabIndex={tab === tabId ? 0 : -1} onClick={() => setTab(tabId)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const next = tabs[(tabs.findIndex((t) => t.id === tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id;
                  setTab(next);
                  document.getElementById(`qe-tab-${next}`)?.focus();
                }}>
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`qe-panel-${tab}`} aria-labelledby={`qe-tab-${tab}`} className="qe-tabpanel">
            {tab === 'content' && (
              <>
                <DocumentSection content={content} readOnly={readOnly} edit={edit} number={quotation.number} />
                <IssuerSection content={content} readOnly={readOnly} refresh={() => actions.refreshIssuer(newDocumentCompany(useSimulationStore.getState()))} />
                <ClientSection
                  content={content}
                  readOnly={readOnly}
                  edit={edit}
                  clients={clients}
                  chooseClient={actions.chooseClient}
                  source={{
                    link: sourceProposalLink(sourceProject ? [sourceProject] : [], quotation.sourceProjectId),
                    loadOptions: () => { const { projects, folders } = useSimulationStore.getState(); return sourceProposalOptions(projects, folders); },
                    onOpenProposal: (projectId) => setActiveProject(projectId, 'project-hub'),
                  }}
                />
                <ItemsSection content={content} readOnly={readOnly} edit={edit} catalog={catalog} catalogContext={catalogContext} />
                <DiscountsSection content={content} readOnly={readOnly} edit={edit} />
                <NotesSection content={content} readOnly={readOnly} edit={edit} />
              </>
            )}
            {tab === 'design' && (
              <DesignTab content={content} readOnly={readOnly} canSaveTemplate={writable} edit={edit} templates={templates} signatures={signatures} saveTemplate={saveTemplate} openLibrary={openQuotationLibrary} onPreviewAccent={setPreviewAccent} />
            )}
            {tab === 'attachments' && <AttachmentsTab quotationId={id} content={content} readOnly={readOnly} edit={edit} catalog={catalog} />}
          </div>
        </div>
        <div className="qe-preview">
          <QuotationPreview quotation={sheet} stampImage={stamp} quotationId={id} attachments={content.attachments} imageSources={imageSources} initialView={initialPreview} onGoToClientEmail={readOnly ? undefined : goToClientEmail} />
        </div>
      </div>
    </div>
  );
};

