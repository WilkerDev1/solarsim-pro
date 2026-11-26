import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { formatMoney } from '../../../../shared/quotations';
import { calculateProjectFinancialSummary } from '../../../engine/financeEngine';
import { useEnergyCalculationMode } from '../../../features/application/useApplicationFeatures';
import { convertibleProposals, proposalMeta, proposalName } from '../../../features/quotations/linkedQuotations';
import { createQuotationFromProposal, proposalConversionContext } from '../../../features/quotations/proposalConversion';
import {
  ALL_CONVERSION_BLOCKS, CONVERSION_BLOCKS, buildProposalQuotationSource, proposalPriceCents, type ConversionBlock, type ConversionBlocks,
} from '../../../features/quotations/proposalSource';
import { useSimulationStore } from '../../../store/useSimulationStore';

/** Propuestas que se listan a la vez; el resto se alcanza buscando. */
export const CONVERT_LIST_LIMIT = 50;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ConvertProposalDialogProps {
  /** Propuesta preseleccionada (p. ej. la abierta en el resumen). */
  initialProjectId?: string | null;
  onClose: () => void;
}

/**
 * «Crear cotización desde una propuesta» (docs/QUOTATION_FROM_PROPOSAL.md): elige la propuesta de origen y qué bloques
 * pasan al borrador; «Crear borrador» lo crea enlazado a la propuesta (que no cambia) y lo abre en el editor.
 * Diálogo modal nativo: el resto de la página queda inerte, el foco circula dentro y Escape cierra.
 */
export const ConvertProposalDialog: React.FC<ConvertProposalDialogProps> = ({ initialProjectId = null, onClose }) => {
  const { projects, folders, sidebarTheme } = useSimulationStore(useShallow((s) => ({ projects: s.projects, folders: s.folders, sidebarTheme: s.sidebarTheme })));
  const mode = useEnergyCalculationMode();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const initial = initialProjectId ? projects.find((p) => p.id === initialProjectId && !p.isDeleted) : undefined;
    return initial?.id ?? null;
  });
  const [blocks, setBlocks] = useState<ConversionBlocks>({ ...ALL_CONVERSION_BLOCKS });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    if (element && !element.open) element.showModal?.();
    search.current?.focus();
    return () => {
      if (element?.open) element.close();
      opener?.focus?.();
    };
  }, []);

  const matches = useMemo(() => convertibleProposals(projects, folders, query), [projects, folders, query]);
  const shown = useMemo(() => {
    const list = matches.slice(0, CONVERT_LIST_LIMIT);
    // La elegida siempre se ve (primera), aunque la búsqueda la deje fuera: nunca hay una selección oculta.
    const selected = selectedId ? projects.find((p) => p.id === selectedId && !p.isDeleted) : undefined;
    return selected && !list.includes(selected) ? [selected, ...list] : list;
  }, [matches, selectedId, projects]);
  const totals = useMemo(() => new Map(shown.map((p) => [p.id, proposalPriceCents(calculateProjectFinancialSummary(p, mode), 'USD', 1)])), [shown, mode]);
  const selected = selectedId ? projects.find((p) => p.id === selectedId && !p.isDeleted) : undefined;
  // Avisos del borrador que saldría (documentos que no pasan, cliente fuera del directorio…): se muestran discretos.
  const preview = useMemo(() => {
    if (!selected) return null;
    const state = useSimulationStore.getState();
    return buildProposalQuotationSource(selected, blocks, proposalConversionContext(state, selected.companyProfileId, undefined, mode));
  }, [selected, blocks, mode]);
  const count = CONVERSION_BLOCKS.filter((b) => blocks[b.id]).length;

  const toggle = (id: ConversionBlock) => setBlocks((current) => ({ ...current, [id]: !current[id] }));
  const create = () => {
    if (!selected) { setError('Elige la propuesta de origen.'); return; }
    const result = createQuotationFromProposal(selected.id, blocks, mode);
    if (!result.ok) { setError(result.error); return; }
    onClose();
  };
  // Foco atrapado: Tab y Mayús+Tab circulan por los controles del diálogo.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab' || !dialog.current) return;
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('[hidden]'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const notes = [
    ...(preview?.notices ?? []),
    ...(blocks.documents && preview?.omittedDocuments.length
      ? [`${preview.omittedDocuments.length === 1 ? 'Un documento no pasa' : `${preview.omittedDocuments.length} documentos no pasan`}: ${preview.omittedDocuments.map((d) => `«${d.title}»`).join(', ')}. ${preview.omittedDocuments[0].reason}`]
      : []),
    ...(blocks.documents && selected ? ['El PDF de la propuesta no se adjunta: se genera al exportarla.'] : []),
  ];

  return (
    <dialog
      ref={dialog}
      className="qconv"
      data-theme={sidebarTheme}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={onKeyDown}
    >
      <div className="qconv-head">
        <div>
          <h2 id={titleId}>Crear cotización desde una propuesta</h2>
          <p id={descriptionId}>La propuesta no se modifica. El borrador queda enlazado a ella.</p>
        </div>
        <button type="button" className="qconv-close" aria-label="Cerrar" onClick={onClose}><X className="h-[18px] w-[18px]" aria-hidden="true" /></button>
      </div>

      <div className="qconv-body">
        <fieldset className="qconv-step">
          <legend className="qconv-step-title">1 · Propuesta de origen</legend>
          <label className="qconv-search">
            <Search className="h-[15px] w-[15px]" aria-hidden="true" />
            <span className="sr-only">Buscar propuesta</span>
            <input ref={search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por cliente, número o carpeta" />
          </label>
          {shown.length === 0 ? (
            <p className="qconv-empty">{projects.some((p) => !p.isDeleted) ? 'Ninguna propuesta coincide con la búsqueda.' : 'Todavía no hay propuestas que convertir.'}</p>
          ) : (
            <div className="qconv-list">
              {shown.map((project) => (
                <label key={project.id} className="qconv-option" data-selected={project.id === selectedId || undefined}>
                  <input type="radio" name="qconv-proposal" value={project.id} checked={project.id === selectedId} onChange={() => { setSelectedId(project.id); setError(null); }} />
                  <span className="qconv-option-text">
                    <span className="qconv-option-name">{proposalName(project)}</span>
                    <span className="qconv-option-meta">{proposalMeta(project, folders)}</span>
                  </span>
                  <span className="qconv-option-total">{formatMoney(totals.get(project.id) ?? 0, 'USD')}</span>
                </label>
              ))}
            </div>
          )}
          {matches.length > CONVERT_LIST_LIMIT && <p className="qconv-hint">Se muestran {CONVERT_LIST_LIMIT} de {matches.length}: busca para encontrar el resto.</p>}
        </fieldset>

        <fieldset className="qconv-step">
          <legend className="qconv-step-title">2 · Qué pasa al borrador</legend>
          {CONVERSION_BLOCKS.map((block) => (
            <label key={block.id} className="qconv-block">
              <input type="checkbox" checked={blocks[block.id]} onChange={() => toggle(block.id)} aria-describedby={`${titleId}-${block.id}`} />
              <span>
                <span className="qconv-block-label">{block.label}</span>
                <span className="qconv-block-desc" id={`${titleId}-${block.id}`}>{block.description}</span>
              </span>
            </label>
          ))}
          {notes.length > 0 && (
            <details className="qconv-notes">
              <summary><Info className="h-3.5 w-3.5" aria-hidden="true" />{notes.length === 1 ? '1 aviso sobre este borrador' : `${notes.length} avisos sobre este borrador`}</summary>
              <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
            </details>
          )}
        </fieldset>
      </div>

      <div className="qconv-foot">
        <p className="qconv-summary" aria-live="polite">
          {error ? <span className="qconv-error" role="alert">{error}</span> : `${count} de ${CONVERSION_BLOCKS.length} bloques seleccionados`}
        </p>
        <div className="qconv-actions">
          <button type="button" className="qconv-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="qconv-btn qconv-btn-primary" disabled={!selected} onClick={create}>Crear borrador</button>
        </div>
      </div>
    </dialog>
  );
};
