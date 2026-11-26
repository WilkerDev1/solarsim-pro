import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Eye, FileText, Lock, RotateCcw, Send } from 'lucide-react';
import { canWrite } from '../../../../shared/permissions';
import { canTransitionQuotation, effectiveQuotationStatus, isQuotationContentLocked, type QuotationStatus } from '../../../../shared/quotations';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { quotationContent } from '../../../store/sync/quotationContent';
import type { QuotationRecord } from '../../../types/quotation';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { newDocumentCompany, stampForIssuer } from '../../../features/quotations/issuer';
import { quotationCatalogContext } from '../../../features/quotations/catalogLine';
import { quotationEditorActions } from '../../../features/quotations/editorActions';
import { storeGenericPriceFor } from '../../simulator/params/logic/storeGenericPrice';
import { localIsoDate } from '../../../utils/localDate';
import { QuotationStatusChip } from '../common/QuotationStatusChip';
import { ClientSection, DiscountsSection, DocumentSection, IssuerSection, ItemsSection, NotesSection, SummarySection, type Edit } from './ContentSections';
import { QuotationPreview } from './QuotationPreview';
import { quotationSaveStatus } from './saveStatus';
import '../../clients/client-link.css';
import './quotation-editor.css';
import './source-proposal.css';

/**
 * Editor de una cotización (docs/QUOTATION_EDITOR.md): formulario a la izquierda y la hoja real a la derecha. No hay
 * «Guardar»: cada cambio confirmado se guarda con `updateQuotationRecord`. Mirar nunca escribe.
 */
export const QuotationEditorView: React.FC = () => {
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
  return <QuotationEditor key={quotation.id} quotation={quotation} />;
};

const LOCK_REASONS: Record<QuotationStatus, string> = {
  draft: '',
  issued: 'Emitida: el contenido está bloqueado. Reábrela para editarla.',
  accepted: 'Aceptada: el contenido ya no se puede editar.',
  rejected: 'Rechazada: reábrela como borrador para editarla.',
  void: 'Anulada: solo se puede consultar.',
};

const QuotationEditor: React.FC<{ quotation: QuotationRecord }> = ({ quotation }) => {
  const {
    change, sidebarTheme, currentUser, online, clients, projects, folders, catalog, defaults, seal, setQuotationStatus, closeQuotation, setActiveProject,
  } = useSimulationStore(useShallow((s) => ({
    change: s.quotationChanges[quotation.id],
    sidebarTheme: s.sidebarTheme,
    currentUser: s.syncSettings.currentUser,
    online: !!s.syncSettings.currentUser && !!s.syncSettings.authToken,
    clients: s.clients,
    projects: s.projects,
    folders: s.folders,
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
  const sheet = useMemo(() => ({ ...content, number: quotation.number }), [content, quotation.number]);
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
          <DocumentSection content={content} readOnly={readOnly} edit={edit} number={quotation.number} />
          <IssuerSection content={content} readOnly={readOnly} refresh={() => actions.refreshIssuer(newDocumentCompany(useSimulationStore.getState()))} />
          <ClientSection
            content={content}
            readOnly={readOnly}
            edit={edit}
            clients={clients}
            chooseClient={actions.chooseClient}
            projects={projects}
            folders={folders}
            onOpenProposal={(projectId) => setActiveProject(projectId, 'project-hub')}
          />
          <ItemsSection content={content} readOnly={readOnly} edit={edit} catalog={catalog} catalogContext={catalogContext} />
          <DiscountsSection content={content} readOnly={readOnly} edit={edit} />
          <NotesSection content={content} readOnly={readOnly} edit={edit} />
          <SummarySection content={content} />
        </div>
        <div className="qe-preview">
          <QuotationPreview quotation={sheet} stampImage={seal} />
        </div>
      </div>
    </div>
  );
};

