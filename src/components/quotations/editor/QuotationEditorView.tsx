import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Eye, FileText, Lock, RotateCcw, Send } from 'lucide-react';
import { canWrite } from '../../../../shared/permissions';
import { assumptionFields } from '../../../../shared/assumptions';
import { canTransitionQuotation, effectiveQuotationStatus, isQuotationContentLocked, type QuotationStatus } from '../../../../shared/quotations';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { quotationContent } from '../../../store/sync/quotationContent';
import type { QuotationRecord } from '../../../types/quotation';
import type { SolarEquipmentItem } from '../../../types/equipment';
import { contentPatch } from '../../../domain/quotationEdit';
import { newDocumentCompany } from '../../../features/quotations/issuer';
import { storeGenericPriceFor } from '../../simulator/params/logic/storeGenericPrice';
import { localIsoDate } from '../../../utils/localDate';
import { QuotationStatusChip } from '../common/QuotationStatusChip';
import { ClientSection, DiscountsSection, DocumentSection, ItemsSection, NotesSection, SummarySection, type Edit } from './ContentSections';
import { QuotationPreview } from './QuotationPreview';
import { quotationSaveStatus } from './saveStatus';
import '../../clients/client-link.css';
import './quotation-editor.css';

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
    change, sidebarTheme, currentUser, online, clients, catalog, defaults, seal,
    updateQuotationRecord, setQuotationStatus, linkQuotationToClient, closeQuotation,
  } = useSimulationStore(useShallow((s) => ({
    change: s.quotationChanges[quotation.id],
    sidebarTheme: s.sidebarTheme,
    currentUser: s.syncSettings.currentUser,
    online: !!s.syncSettings.currentUser && !!s.syncSettings.authToken,
    clients: s.clients,
    catalog: s.equipmentCatalog,
    defaults: s.defaultSimulationSettings,
    seal: newDocumentCompany(s)?.signatureSealBase64 ?? null,
    updateQuotationRecord: s.updateQuotationRecord,
    setQuotationStatus: s.setQuotationStatus,
    linkQuotationToClient: s.linkQuotationToClient,
    closeQuotation: s.closeQuotation,
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

  const edit: Edit = useCallback((update) => {
    const latest = useSimulationStore.getState().quotations.find((q) => q.id === id);
    if (!latest) return 'Cotización no encontrada.';
    const base = quotationContent(latest);
    const patch = contentPatch(base, update(base));
    if (!Object.keys(patch).length) return null;
    const result = updateQuotationRecord(id, patch);
    return result.ok ? null : result.error;
  }, [id, updateQuotationRecord]);
  const link = useCallback((clientId: string | null) => {
    const result = linkQuotationToClient(id, clientId);
    return result.ok ? null : result.error;
  }, [id, linkQuotationToClient]);
  const transition = (status: QuotationStatus) => {
    const result = setQuotationStatus(id, status);
    setStatusError(result.ok ? null : result.error);
  };
  // Margen de venta de los ajustes (fábrica de supuestos, ADR 0003) y genérico vigente al abrir el selector (ADR 0006).
  const saleMarginMultiplier = assumptionFields(undefined, defaults).specs.saleMarginMultiplier;
  const catalogContext = useCallback((item: SolarEquipmentItem) => ({
    currency: content.currency,
    exchangeRate: content.exchangeRate,
    saleMarginMultiplier,
    genericPrice: storeGenericPriceFor(item.id),
  }), [content.currency, content.exchangeRate, saleMarginMultiplier]);
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
          <ClientSection content={content} readOnly={readOnly} edit={edit} clients={clients} link={link} />
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

