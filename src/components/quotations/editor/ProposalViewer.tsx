import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Eye, FileText, LayoutDashboard, SlidersHorizontal, X } from 'lucide-react';
import { resolveAssumptions } from '../../../../shared/assumptions';
import { NET_METERING_REGIME_LABELS } from '../../../../shared/netMetering';
import { noSavingsNote, supplyPresentation, supplySummaryText } from '../../../../shared/offGridSupply';
import { irrText } from '../../../../shared/returnIndicators';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { ProposalViewerTab } from '../../../store/types';
import type { FinancialSummaryResult, ProjectSimulation } from '../../../types';
import { calculateProjectFinancialSummary } from '../../../engine/financeEngine';
import { useEnergyCalculationMode } from '../../../features/application/useApplicationFeatures';
import { proposalName } from '../../../features/quotations/linkedQuotations';
import { DOCUMENT_STATUS_LABELS } from '../../../utils/clientSummary';
import { calculateTotalBatteryCapacityKWh, calculateTotalInverterPowerKW } from '../../../utils/equipmentSpecsUtils';
import { buildPdfLayout, normalizeSectionOrder } from '../../../utils/pdfLayout';
import { formatProposalDate } from '../../../utils/formatDateUtils';
import { paybackLabel, proposalDevices, savingsPresentation, summaryMoney } from '../../hub/proposalSummaryData';
import { DocumentEditorProvider } from '../../pdf/editor/DocumentEditorContext';
import { renderProposalSection } from '../../pdf/ProposalDocumentPages';
import { documentLayoutView } from '../../pdf/useDocumentLayout';
import { InfoTip } from '../../simulator/params/ui/InfoTip';
import './proposal-viewer.css';

/**
 * Visor de solo lectura de la propuesta de origen dentro del editor de cotización (docs/QUOTATION_EDITOR.md#visor-de-la-propuesta).
 * Recibe la propuesta y solo calcula con funciones puras (`calculateProjectFinancialSummary`, `renderProposalSection`
 * con el documento en modo `view`): no cambia `activeProjectId`, no llama a escritores del store ni monta la
 * sincronización de anexos, así que no hay guardado ni sincronización. El simulador no se muestra: lee y escribe siempre la
 * propuesta activa (ver la documentación); en su lugar, «Parámetros» desglosa lo que lo alimenta.
 */
export const PROPOSAL_VIEWER_TABS: readonly { id: ProposalViewerTab; label: string; icon: typeof Eye }[] = [
  { id: 'summary', label: 'Resumen', icon: LayoutDashboard },
  { id: 'document', label: 'Documento', icon: FileText },
  { id: 'parameters', label: 'Parámetros', icon: SlidersHorizontal },
];

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const kwh = (value: number) => `${Math.round(value).toLocaleString('es-DO')} kWh`;
const pct = (value: number) => `${Number.isFinite(value) ? value.toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '—'} %`;
const yesNo = (value: boolean) => (value ? 'Sí' : 'No');

const Facts: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <dl className="pv-facts">
    {rows.map(([label, value]) => (
      <div key={label}><dt>{label}</dt><dd>{value || 'Sin dato'}</dd></div>
    ))}
  </dl>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="pv-section"><h3>{title}</h3>{children}</section>
);

const DevicesTable: React.FC<{ project: ProjectSimulation }> = ({ project }) => {
  const devices = proposalDevices(project);
  if (!devices.length) return <p className="qe-muted">Sin equipos.</p>;
  return (
    <div className="pv-table-scroll">
      <table className="pv-table">
        <caption className="sr-only">Equipos de la propuesta</caption>
        <thead><tr><th>Equipo / modelo</th><th>Cantidad</th><th>Nominal</th></tr></thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td><strong>{device.name || 'Sin modelo'}</strong><span>{device.kind}</span></td>
              <td>{device.count}</td>
              <td>{device.nominal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SummaryTab: React.FC<{ project: ProjectSimulation; summary: FinancialSummaryResult }> = ({ project, summary }) => {
  const savings = savingsPresentation(project);
  const utility = `${project.rates.distributor} · ${project.rates.tariffCode}`;
  return (
    <>
      <div className="pv-metrics">
        <div><span>Potencia instalada</span><strong>{summary.systemCapacityKWp.toFixed(2)} <small>kWp</small></strong></div>
        <div><span>Precio de la propuesta</span><strong>{summaryMoney(summary.contractPriceUSD)} <small>USD</small></strong></div>
        <div>
          <span>Ahorro estimado · año 1</span>
          <strong title={savings.comparable ? undefined : noSavingsNote(savings.basis)}>
            {savings.comparable ? <>{summaryMoney(summary.year1SavingsUSD)} <small>USD</small></> : savings.noSavingsLabel}
          </strong>
        </div>
        <div><span>Retorno simple estimado</span><strong>{paybackLabel(summary, savings)}</strong></div>
      </div>
      <Section title="Sistema propuesto">
        <p className="pv-line">
          <span>Inversores: <strong>{calculateTotalInverterPowerKW(project.specs).toFixed(1)} kW AC</strong></span>
          <span>Almacenamiento: <strong>{calculateTotalBatteryCapacityKWh(project.specs).toFixed(2)} kWh</strong></span>
        </p>
        <DevicesTable project={project} />
      </Section>
      <Section title="Producción y consumo">
        <Facts rows={[
          ['Producción solar', `${kwh(summary.annualProductionKWh)}/año`],
          ['Consumo eléctrico', `${kwh(summary.annualConsumptionKWh)}/año`],
          ['Cobertura energética', `${summary.energyCoveragePct.toFixed(1)} %`],
        ]} />
      </Section>
      <Section title="Precio y retorno">
        <Facts rows={[
          ['Precio pagable', `${summaryMoney(summary.contractPriceUSD)} USD`],
          ['ITBIS exonerado', `${summaryMoney(summary.itbisSavedUSD)} USD`],
          ['Crédito ISR · Ley 57-07', `${summaryMoney(summary.ley5707CreditUSD)} USD`],
          ['Inversión neta tras crédito', `${summaryMoney(summary.netInvestmentUSD)} USD`],
          ...(savings.comparable
            ? ([['TIR', irrText(summary)], ['VAN', `${summaryMoney(summary.npvUSD)} USD`], ['Ahorro acumulado a 25 años', `${summaryMoney(summary.total25YearSavingsUSD)} USD`]] as [string, string][])
            : ([['TIR, VAN y ahorro', savings.noSavingsLabel]] as [string, string][])),
        ]} />
      </Section>
      <Section title="Cliente y suministro">
        <Facts rows={[
          ['Cliente', project.client.name],
          ['Empresa', project.client.company],
          ['Provincia', project.client.province],
          [supplyPresentation(project.rates).kind === 'utility' ? 'Distribuidora / tarifa' : 'Suministro actual', supplySummaryText(project.rates, utility)],
        ]} />
      </Section>
    </>
  );
};

const pricingModeLabel = (project: ProjectSimulation): string => {
  if (Number.isFinite(project.financials.customCostUSD) && (project.financials.customCostUSD ?? 0) > 0) return 'Precio manual';
  return project.specs.pricingMode === 'direct_watt' ? 'Directo por Wp/kWp' : 'Matriz de costos (catálogo)';
};

/** Desglose de lo que alimenta el simulador, solo lectura (el simulador no puede mostrarse sin cambiar la propuesta activa). */
const ParametersTab: React.FC<{ project: ProjectSimulation }> = ({ project }) => {
  const assumptions = resolveAssumptions(project);
  const monthly = project.monthlyConsumption ?? [];
  const annual = monthly.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const utility = `${project.rates.distributor} · ${project.rates.tariffCode}`;
  return (
    <>
      <Section title="Consumo">
        <Facts rows={[['Consumo anual', kwh(annual)], ['Promedio mensual', kwh(annual / 12)]]} />
        <ol className="pv-months" aria-label="Consumo mensual">
          {MONTHS.map((month, index) => (
            <li key={month}><span>{month}</span><strong>{Math.round(monthly[index] ?? 0).toLocaleString('es-DO')}</strong></li>
          ))}
        </ol>
      </Section>
      <Section title="Tarifa y red">
        <Facts rows={[
          [supplyPresentation(project.rates).kind === 'utility' ? 'Distribuidora / tarifa' : 'Suministro actual', supplySummaryText(project.rates, utility)],
          ['Precio de la energía', `US$ ${project.rates.energyCostPerKWh.toLocaleString('es-DO', { maximumFractionDigits: 4 })} /kWh`],
          ['Medición neta', NET_METERING_REGIME_LABELS[assumptions.netMeteringRegime]],
          ['Inyección cero', yesNo(!!project.rates.isZeroExport)],
          ['Cobertura objetivo', pct(assumptions.targetCoveragePct)],
          ['Inflación de la energía', pct(assumptions.annualEnergyInflationPct)],
        ]} />
      </Section>
      <Section title="Equipos">
        <DevicesTable project={project} />
        <Facts rows={[['Pérdidas del sistema', pct(assumptions.systemLossesPct)], ['Degradación anual', pct(assumptions.annualDegradationPct)]]} />
      </Section>
      <Section title="Financiero">
        <Facts rows={[
          ['Modo de precio', pricingModeLabel(project)],
          ['Tasa del dólar', `RD$ ${assumptions.dopExchangeRate.toLocaleString('es-DO', { maximumFractionDigits: 2 })}`],
          ['Exoneración de ITBIS', yesNo(project.financials.applyITBISExemption)],
          ['Crédito Ley 57-07', yesNo(project.financials.applyLey5707)],
          ['Tasa de descuento', pct(assumptions.discountRatePct)],
          ['Vida del proyecto', `${assumptions.projectLifespanYears} años`],
          ['Ítems extra', String(project.financials.customItems?.length ?? 0)],
          ['Descuentos', String(project.financials.customDiscounts?.length ?? 0)],
        ]} />
      </Section>
    </>
  );
};

const PAGE_WIDTH = 850;

/** Páginas del documento de la propuesta, a escala del panel y desplazables; modo `view`, sin acciones de edición. */
const DocumentTab: React.FC<{ project: ProjectSimulation; summary: FinancialSummaryResult }> = ({ project, summary }) => {
  const company = useSimulationStore((s) => s.companies.find((c) => c.id === project.companyProfileId));
  const area = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState<number | null>(null);
  // Solo estado local de la vista: escala según el ancho del panel y alto real de las páginas.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const width = area.current?.clientWidth ?? 0;
      if (width > 0) setScale(Math.min(1, Math.max(0.25, (width - 2) / PAGE_WIDTH)));
      if (inner.current) setHeight(inner.current.offsetHeight);
    });
    if (area.current) observer.observe(area.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);
  const layout = documentLayoutView(project);
  const order = normalizeSectionOrder(project.customization?.sectionOrder);
  const { pageNumbers, footerTotalPages, tocItems } = buildPdfLayout(order, layout.visibility, project.customization?.extraTocItems || [], project.customization?.attachedPdfs || []);
  const currentDateStr = formatProposalDate(project.client?.quoteDate || project.customization?.quoteDate);
  const annexes = (project.customization?.attachedPdfs ?? []).filter((a) => a.enabled).length;
  return (
    <>
      <p className="qe-field-hint pv-doc-hint">
        Vista de solo lectura del documento{annexes ? `; ${annexes === 1 ? 'su anexo se añade' : `sus ${annexes} anexos se añaden`} al exportarlo desde la propuesta` : ''}.
      </p>
      <div ref={area} className="pv-doc-area">
        <div className="pv-doc-frame" style={{ width: PAGE_WIDTH * scale, height: height === null ? undefined : height * scale }}>
          <div ref={inner} className="pv-doc-pages" style={{ width: PAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <DocumentEditorProvider project={project} summary={summary} currentDateStr={currentDateStr} company={company} mode="view" writable={false}>
              {order.map((id) => (layout.visibility[id]
                ? renderProposalSection(id, { project, summary, activeTheme: layout.theme, showHeadersFooters: layout.showHeadersFooters, currentDateStr, pageNumbers, totalPages: footerTotalPages, tocItems })
                : null))}
            </DocumentEditorProvider>
          </div>
        </div>
      </div>
    </>
  );
};

export interface ProposalViewerProps {
  project: ProjectSimulation;
  tab: ProposalViewerTab;
  onTabChange: (tab: ProposalViewerTab) => void;
  onClose: () => void;
  /** «Abrir propuesta»: la abre completa (la cotización queda para volver). */
  onOpenProposal: () => void;
}

export const ProposalViewer: React.FC<ProposalViewerProps> = ({ project, tab, onTabChange, onClose, onOpenProposal }) => {
  const mode = useEnergyCalculationMode();
  const summary = useMemo(() => calculateProjectFinancialSummary(project, mode), [project, mode]);
  const meta = [DOCUMENT_STATUS_LABELS[project.status] ?? project.status, project.client.projectId?.trim() || null].filter(Boolean).join(' · ');
  const focusTab = (next: ProposalViewerTab) => {
    onTabChange(next);
    document.getElementById(`pv-tab-${next}`)?.focus();
  };
  return (
    <section
      className="pv"
      aria-labelledby="pv-title"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="pv-head">
        <div className="pv-identity">
          <span className="pv-eyebrow"><Eye className="h-3.5 w-3.5" aria-hidden="true" />Propuesta de origen · solo lectura</span>
          <h2 id="pv-title">{proposalName(project)}</h2>
          {meta && <span className="qe-muted pv-meta">{meta}</span>}
        </div>
        <div className="pv-head-actions">
          <InfoTip label="Qué muestra el visor" text="La propuesta tal como está guardada, sin poder cambiarla: mirarla aquí no la abre ni la modifica. «Abrir propuesta» la abre completa y deja «Volver a la cotización» para regresar aquí." />
          <button type="button" className="qe-btn qe-btn-sm" onClick={onOpenProposal}>Abrir propuesta<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className="qe-icon-btn" aria-label="Cerrar el visor de la propuesta" title="Cerrar (Esc)" onClick={onClose}><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </header>
      <div className="pv-tabs" role="tablist" aria-label="Modos del visor">
        {PROPOSAL_VIEWER_TABS.map(({ id, label, icon: Icon }, index) => (
          <button key={id} type="button" role="tab" id={`pv-tab-${id}`} aria-controls="pv-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => onTabChange(id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              focusTab(PROPOSAL_VIEWER_TABS[(index + (event.key === 'ArrowRight' ? 1 : PROPOSAL_VIEWER_TABS.length - 1)) % PROPOSAL_VIEWER_TABS.length].id);
            }}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <div className="pv-body" role="tabpanel" id="pv-panel" aria-labelledby={`pv-tab-${tab}`} tabIndex={0}>
        {tab === 'summary' && <SummaryTab project={project} summary={summary} />}
        {tab === 'document' && <DocumentTab project={project} summary={summary} />}
        {tab === 'parameters' && <ParametersTab project={project} />}
      </div>
    </section>
  );
};
