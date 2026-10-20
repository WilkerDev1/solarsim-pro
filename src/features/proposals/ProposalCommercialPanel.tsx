import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  PROPOSAL_DECISIONS,
  commercialState,
  type ProposalDecision,
  type ProposalCommercialReport,
} from "../../../shared/proposalCommercial";
import type { ProjectSimulation } from "../../types";
import { useSimulationStore } from "../../store/useSimulationStore";
import { SyncService } from "../../services/syncService";
import { canEditCommercial } from "./commercial";
import { ProposalDecisionField } from "./ProposalDecisionField";
import "./proposal-commercial.css";
import { confirmAction } from "../../components/common/confirmAction";

export function ProposalCommercialPanel({
  project,
}: {
  project: ProjectSimulation;
}) {
  const state = useSimulationStore(),
    current = commercialState(project);
  const [editing, setEditing] = useState(false),
    [note, setNote] = useState("");
  const [status, setStatus] = useState<ProposalDecision>(current.status);
  const [ownerId, setOwnerId] = useState(current.ownerId || "");
  const [promote, setPromote] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const editable = canEditCommercial(project, state.syncSettings);
  useEffect(() => {
    let alive = true;
    const generation = state.sessionGeneration;
    setMembers([]);
    if (
      state.syncSettings.authToken &&
      state.syncSettings.currentUser?.role === "ADMIN"
    )
      void SyncService.getCompanyUsers(
        state.syncSettings.serverUrl,
        state.syncSettings.authToken,
      ).then((result) => {
        if (
          alive &&
          generation === useSimulationStore.getState().sessionGeneration &&
          result.success
        )
          setMembers(result.users.filter((user) => user.isActive !== false));
      });
    return () => {
      alive = false;
    };
  }, [
    state.sessionGeneration,
    state.syncSettings.currentUser?.id,
    state.syncSettings.serverUrl,
  ]);
  const candidates = new Map<string, string>();
  state.projects.forEach((project) => {
    if (project.authorId && project.authorName)
      candidates.set(project.authorId, project.authorName);
  });
  members.forEach((member) => candidates.set(member.id, member.name));
  if (state.syncSettings.currentUser)
    candidates.set(
      state.syncSettings.currentUser.id,
      state.syncSettings.currentUser.name,
    );
  if (current.ownerId)
    candidates.set(
      current.ownerId,
      current.ownerName || "Responsable guardado",
    );
  const reports: ProposalCommercialReport[] = [...(current.reports || [])];
  if (!reports.length && current.note.trim())
    reports.push({
      id: `legacy-${project.id}`,
      projectId: project.id,
      status: current.status,
      note: current.note,
      ownerId: current.ownerId,
      ownerName: current.ownerName,
      createdAt: current.updatedAt || project.updatedAt,
      createdByName: current.updatedByName,
    });
  reports
    .reverse()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const begin = () => {
    setEditing(true);
    setNote("");
    setStatus(current.status);
    setOwnerId(current.ownerId || "");
    setPromote(true);
    setFeedback("");
  };
  const reportBody = (report: ProposalCommercialReport) => (
    <div className="commercial-report-body">
      <p className="commercial-report-note">{report.note}</p>
      <dl>
        <div>
          <dt>Responsable</dt>
          <dd>{report.ownerName || "Sin responsable"}</dd>
        </div>
        <div>
          <dt>Registrado por</dt>
          <dd>{report.createdByName || "Consultor"}</dd>
        </div>
      </dl>
      <small title={report.id}>ID del reporte: {report.id}</small>
    </div>
  );
  return (
    <section
      className="proposal-commercial-panel commercial-timeline"
      aria-labelledby={`commercial-title-${project.id}`}
    >
      <header>
        <h3 id={`commercial-title-${project.id}`}>Seguimiento comercial</h3>
        <p>Estado actual e historial de decisiones del cliente.</p>
      </header>
      <div className="commercial-current">
        <span>Estado actual de la propuesta</span>
        <ProposalDecisionField project={project} />
        <p>
          Los reportes anteriores conservan el estado que tenían al registrarse.
        </p>
      </div>
      <div className="commercial-report-heading">
        <h4>
          Reportes <span>{reports.length}</span>
        </h4>
        {!editing && (
          <button
            className="commercial-add"
            disabled={!editable || reports.length >= 500}
            onClick={begin}
          >
            <Plus size={15} />
            Nuevo reporte
          </button>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true);
            const result = state.addProposalCommercialReport(
              project.id,
              {
                status,
                note,
                ownerId: ownerId || undefined,
                ownerName: candidates.get(ownerId),
              },
              promote,
            );
            setSaving(false);
            if (result.success) {
              setEditing(false);
              setNote("");
              setFeedback(
                "Reporte guardado en este equipo. Se enviará al sincronizar.",
              );
            } else
              setFeedback(result.error || "No se pudo guardar el reporte.");
          }}
        >
          <div className="commercial-form-title">
            <h4>Nuevo reporte</h4>
            <button
              type="button"
              aria-label="Cancelar nuevo reporte"
              onClick={async () => {
                if (
                  !note.trim() ||
                  (await confirmAction({ title: "Descartar reporte", message: "¿Descartar este reporte sin guardar?", confirmLabel: "Descartar", tone: "danger" }))
                )
                  setEditing(false);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <label>
            Estado del reporte
            <select
              value={status}
              disabled={!editable}
              onChange={(event) =>
                setStatus(event.target.value as ProposalDecision)
              }
            >
              {Object.entries(PROPOSAL_DECISIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Responsable del reporte
            <select
              value={ownerId}
              disabled={!editable}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Sin responsable</option>
              {[...candidates].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nota del reporte
            <textarea
              required
              rows={4}
              maxLength={4000}
              disabled={!editable}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Qué ocurrió, decisión del cliente y próximo paso"
            />
          </label>
          <label className="commercial-promote">
            <input
              type="checkbox"
              checked={promote}
              disabled={!editable}
              onChange={(event) => setPromote(event.target.checked)}
            />
            <span>
              Actualizar el estado actual y responsable con este reporte
            </span>
          </label>
          <p className="commercial-help">
            La fecha y el identificador se asignan automáticamente. Un reporte
            guardado conserva su contenido.
          </p>
          <div className="commercial-actions">
            <button
              type="button"
              onClick={async () => {
                if (
                  !note.trim() ||
                  (await confirmAction({ title: "Descartar reporte", message: "¿Descartar este reporte sin guardar?", confirmLabel: "Descartar", tone: "danger" }))
                )
                  setEditing(false);
              }}
            >
              Cancelar
            </button>
            <button
              className="commercial-save"
              disabled={!editable || saving || !note.trim()}
            >
              Guardar reporte
            </button>
          </div>
        </form>
      )}
      {feedback && (
        <p role="status" className="commercial-help">
          {feedback}
        </p>
      )}
      {!reports.length && !editing && (
        <p className="commercial-no-reports">
          Aún no hay reportes. Registra una conversación o una decisión para
          conservar el seguimiento.
        </p>
      )}
      {reports.map((report, index) =>
        index === 0 ? (
          <article
            className="commercial-report commercial-latest"
            key={report.id}
          >
            <header>
              <h4>{PROPOSAL_DECISIONS[report.status]}</h4>
              <time dateTime={report.createdAt}>
                {new Date(report.createdAt).toLocaleString("es-DO")}
              </time>
            </header>
            {reportBody(report)}
          </article>
        ) : (
          <details className="commercial-report" key={report.id}>
            <summary>
              <strong>{PROPOSAL_DECISIONS[report.status]}</strong>
              <time dateTime={report.createdAt}>
                {new Date(report.createdAt).toLocaleString("es-DO")}
              </time>
            </summary>
            {reportBody(report)}
          </details>
        ),
      )}
      {!editable && (
        <p className="commercial-help">
          Solo lectura. Revisa permisos, papelera o conflictos antes de editar.
        </p>
      )}
    </section>
  );
}
