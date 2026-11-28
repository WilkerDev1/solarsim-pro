import { canWrite, isWriterRole } from '../../../shared/permissions';
import { proposalActionBlock, proposalCompleteness } from '../../domain/proposalCompleteness';
import { IncompleteNotice, PENDING_VALUE, ResultsPending } from '../simulator/ProposalStatusHints';
import { useMemo, useState } from "react";
import { ArrowLeft, MapPin, Share2, FileText, FilePlus2 } from "lucide-react";
import { useSimulationStore } from "../../store/useSimulationStore";
import { useShallow } from 'zustand/react/shallow';
import { useEnergyCalculationMode } from "../../features/application/useApplicationFeatures";
import { calculateProjectFinancialSummary } from "../../engine/financeEngine";
import { noSavingsNote, supplyPresentation, supplySummaryText } from "../../../shared/offGridSupply";
import { irrText } from "../../../shared/returnIndicators";
import { ProposalCommercialPanel } from "../../features/proposals/ProposalCommercialPanel";
import { ProposalClientSection } from "../clients/ProposalClientLink";
import {
  calculateTotalBatteryCapacityKWh,
  calculateTotalInverterPowerKW,
} from "../../utils/equipmentSpecsUtils";
import { projectSyncLabel } from "../dashboard/projectPresentation";
import { ProposalDates } from "../dashboard/ProposalDates";
import { LegacyRegimeBadge } from "../../features/proposals/LegacyRegimeBadge";
import { ProposalHistory } from "./components/ProposalHistory";
import { ProposalEnergyOverview } from "./components/ProposalEnergyOverview";
import { useQuotationsFeature } from "../../features/application/quotationsFeature";
import { ConvertProposalDialog } from "../quotations/convert/ConvertProposalDialog";
import { ProposalQuotationsSection } from "../quotations/linked/LinkedQuotationSections";
import { paybackLabel, proposalDevices, savingsPresentation, summaryMoney } from "./proposalSummaryData";
import "./project-summary.css";
import "../quotations/convert/convert-dialog.css";
import "../quotations/linked/linked-quotations.css";
const money = summaryMoney;
export const ProjectHubView = () => {
  const {
    projects,
    activeProjectId,
    setActiveView,
    openShareModal,
    restoreProject,
    syncSettings,
    workspaceScope,
    sessionGeneration,
  } = useSimulationStore(useShallow((s) => ({ projects: s.projects, activeProjectId: s.activeProjectId, setActiveView: s.setActiveView, openShareModal: s.openShareModal, restoreProject: s.restoreProject, syncSettings: s.syncSettings, workspaceScope: s.workspaceScope, sessionGeneration: s.sessionGeneration })));
  const project = projects.find((p) => p.id === activeProjectId);
  const mode = useEnergyCalculationMode();
  const summary = useMemo(
    () => (project ? calculateProjectFinancialSummary(project, mode) : null),
    [project, mode],
  );
  const [section, setSection] = useState<"overview" | "finance" | "history">(
    "overview",
  );
  const quotationsEnabled = useQuotationsFeature();
  const [converting, setConverting] = useState(false);
  // Sistema aislado sin comparación (o generador sin costo): estado explícito en vez de ceros.
  const savings = savingsPresentation(project);
  const { basis: savingsBasis, comparable, noSavingsLabel } = savings;

  if (!project || !summary)
    return (
      <div className="project-summary summary-empty">
        <h2>Selecciona una propuesta</h2>
        <p>Abre una propuesta desde el listado para ver su resumen.</p>
        <button onClick={() => setActiveView("dashboard")}>
          Volver a propuestas
        </button>
      </div>
    );
  const devices = proposalDevices(project);
  // F2b (ADR 0009): incompleta ⇒ cifras vacías con su motivo (nunca en cero) y sin compartir ni convertir a cotización.
  const completeness = proposalCompleteness(project);
  const blockedReason = proposalActionBlock(project).reason;
  const pending = completeness.incomplete;
  const ownerKey = `${workspaceScope}|${sessionGeneration}|${project.id}`;
  return (
    <div className="project-summary">
      <header className="summary-identity">
        <div>
          <button
            className="summary-back"
            onClick={() => setActiveView("dashboard")}
          >
            <ArrowLeft size={15} />
            Propuestas
          </button>
          <div className="summary-title">
            <h1>{project.client.name || "Propuesta sin nombre"}</h1>
            <span>{project.client.projectId || "Sin código"}</span>
            {/* Envuelta: `.summary-title > span` pisaría el color y el tamaño de la insignia. */}
            <div><LegacyRegimeBadge project={project} /></div>
          </div>
          <p>
            <MapPin size={14} />
            {project.client.province ||
              project.client.location ||
              "Sin ubicación"}
            <span>·</span>
            {projectSyncLabel(project)}
            <span>·</span>
            <ProposalDates project={project} />

          </p>
        </div>
        <div className="summary-actions">
          <button onClick={() => setActiveView("pdf-preview")}>
            <FileText size={16} />
            Ver documento
          </button>
          {quotationsEnabled && !project.isDeleted && canWrite(syncSettings.currentUser) && (
            <button onClick={() => setConverting(true)} disabled={pending} title={blockedReason ?? undefined}>
              <FilePlus2 size={16} />
              Crear cotización
            </button>
          )}
          <button
            className="summary-primary"
            disabled={project.isDeleted || !syncSettings.authToken || pending}
            title={blockedReason ?? undefined}
            onClick={openShareModal}
          >
            <Share2 size={16} />
            Compartir propuesta
          </button>
        </div>
      </header>
      {project.isDeleted && (
        <div className="summary-warning" role="status">
          Esta propuesta está en la papelera y es de solo lectura.
          {(!syncSettings.currentUser ||
            isWriterRole(syncSettings.currentUser.role)) && (
            <button onClick={() => restoreProject(project.id)}>
              Restaurar propuesta
            </button>
          )}
        </div>
      )}
      {pending && <IncompleteNotice completeness={completeness} />}
      <div className="summary-metrics">
        <div>
          <span>Potencia instalada</span>
          <strong>
            {pending ? PENDING_VALUE : <>{summary.systemCapacityKWp.toFixed(2)} <small>kWp</small></>}
          </strong>
        </div>
        <div>
          <span>Precio de la propuesta</span>
          <strong>
            {pending ? PENDING_VALUE : <>{money(summary.contractPriceUSD)} <small>USD</small></>}
          </strong>
        </div>
        <div>
          <span>Ahorro estimado · año 1</span>
          <strong data-savings-state={comparable ? undefined : savingsBasis} title={comparable ? undefined : noSavingsNote(savingsBasis)}>
            {pending ? PENDING_VALUE : comparable ? <>{money(summary.year1SavingsUSD)} <small>USD</small></> : noSavingsLabel}
          </strong>
        </div>
        <div>
          <span>Retorno simple estimado</span>
          <strong>
            {pending ? PENDING_VALUE : paybackLabel(summary, savings)}
          </strong>
        </div>
      </div>
      <nav className="summary-tabs" aria-label="Secciones del resumen">
        {(
          [
            ["overview", "Vista general"],
            ["finance", "Finanzas"],
            ["history", "Historial y versiones"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            onClick={() => setSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="summary-columns">
        <div className="summary-main">
          {section === "overview" && (
            <>
              <section className="summary-section">
                <header>
                  <h2>Sistema propuesto</h2>
                  <p>Configuración técnica incluida en esta propuesta.</p>
                </header>
                <div className="summary-technical-line">
                  <span>
                    Inversores:{" "}
                    <strong>
                      {calculateTotalInverterPowerKW(project.specs).toFixed(1)}{" "}
                      kW AC
                    </strong>
                  </span>
                  <span>
                    Almacenamiento:{" "}
                    <strong>
                      {calculateTotalBatteryCapacityKWh(project.specs).toFixed(
                        2,
                      )}{" "}
                      kWh
                    </strong>
                  </span>
                </div>
                <div className="summary-table-scroll">
                  <table>
                    <caption className="sr-only">Equipos propuestos</caption>
                    <thead>
                      <tr>
                        <th>Equipo / modelo</th>
                        <th>Cantidad</th>
                        <th>Nominal unitario</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((device) => (
                        <tr key={device.id}>
                          <td>
                            <strong>{device.name}</strong>
                            <span>{device.kind}</span>
                          </td>
                          <td>{device.count}</td>
                          <td>{device.nominal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {pending ? <ResultsPending completeness={completeness} title="Energía pendiente" /> : <ProposalEnergyOverview summary={summary} />}
              <section className="summary-section">
                <header>
                  <h2>Cliente y suministro</h2>
                </header>
                <dl className="summary-facts">
                  {[
                    ["Cliente", project.client.name],
                    ["Empresa", project.client.company || "No registrada"],
                    ["Provincia", project.client.province],
                    // Aislado con generador o sin comparación: no se nombra la distribuidora ni su tarifa.
                    [
                      supplyPresentation(project.rates).kind === "utility" ? "Distribuidora / tarifa" : "Suministro actual",
                      supplySummaryText(project.rates, `${project.rates.distributor} · ${project.rates.tariffCode}`),
                    ],
                    [
                      "Autor de la propuesta",
                      project.authorName || "Sin autor",
                    ],
                    [
                      "Cálculo energético",
                      mode === "legacy"
                        ? "Clásico"
                        : "Proyección de autoconsumo",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || "Sin dato"}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          )}
          {section === "finance" && pending && <ResultsPending completeness={completeness} title="Finanzas pendientes" />}
          {section === "finance" && !pending && (
            <>
              <section className="summary-section">
                <header>
                  <h2>Inversión y beneficios fiscales</h2>
                  <p>
                    El precio pagable y el beneficio fiscal se presentan por
                    separado.
                  </p>
                </header>
                <dl className="summary-financial-rows">
                  {[
                    [
                      "Precio pagable de la propuesta",
                      money(summary.contractPriceUSD),
                    ],
                    ["ITBIS exonerado", money(summary.itbisSavedUSD)],
                    [
                      "Crédito ISR estimado · Ley 57-07",
                      money(summary.ley5707CreditUSD),
                    ],
                    [
                      "Inversión neta tras crédito fiscal",
                      money(summary.netInvestmentUSD),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value} USD</dd>
                    </div>
                  ))}
                </dl>
                <p className="summary-note">
                  Los beneficios fiscales dependen de su aplicabilidad. El
                  crédito ISR proyectado se distribuye en tres ejercicios y no
                  equivale a un descuento cobrado al firmar.
                </p>
              </section>
              <section className="summary-section">
                <header>
                  <h2>Rentabilidad proyectada</h2>
                </header>
                <dl className="summary-facts">
                  {(comparable ? [
                    ["TIR", irrText(summary)],
                    ["VAN", `${money(summary.npvUSD)} USD`],
                    ["ROI a 25 años", `${summary.roi25YrPct.toFixed(1)}%`],
                    [
                      "Ahorro acumulado a 25 años",
                      `${money(summary.total25YearSavingsUSD)} USD`,
                    ],
                  ] : [
                    ["TIR, VAN y ROI", noSavingsLabel],
                  ]).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          )}
          {section === "history" && (
            <ProposalHistory key={ownerKey} project={project} />
          )}
        </div>
        <aside className="summary-side">
          <ProposalClientSection key={`client-${ownerKey}`} project={project} />
          <ProposalCommercialPanel key={ownerKey} project={project} />
          <ProposalQuotationsSection key={`quotations-${ownerKey}`} projectId={project.id} />
        </aside>
      </div>
      {converting && <ConvertProposalDialog initialProjectId={project.id} onClose={() => setConverting(false)} />}
    </div>
  );
};
