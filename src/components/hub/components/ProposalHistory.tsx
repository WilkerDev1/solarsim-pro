import { useState } from "react";
import type { ProjectSimulation, ProjectSnapshot } from "../../../types";
import { useSimulationStore } from "../../../store/useSimulationStore";
import { canEditCommercial } from "../../../features/proposals/commercial";
import { projectDifferences } from "../../../store/sync/projectDifferences";
import { CreateSnapshotModal } from "./CreateSnapshotModal";
import { confirmAction } from "../../common/confirmAction";
export function ProposalHistory({ project }: { project: ProjectSimulation }) {
  const { snapshotsByProject, restoreSnapshot, syncSettings } =
    useSimulationStore();
  const [creating, setCreating] = useState(false);
  const [comparing, setComparing] = useState<ProjectSnapshot | null>(null);
  const [feedback, setFeedback] = useState("");
  const snapshots = snapshotsByProject[project.id] || [];
  const canEdit = canEditCommercial(project, syncSettings);
  const differences = comparing
    ? projectDifferences(comparing.data, project)
    : [];
  return (
    <section className="summary-section">
      <header className="summary-section-actions">
        <div>
          <h2>Historial y versiones locales</h2>
          <p>
            Los puntos de guardado permiten revisar y recuperar contenido
            técnico.
          </p>
        </div>
        <button disabled={!canEdit} onClick={() => setCreating(true)}>
          Guardar versión
        </button>
      </header>
      {feedback && <p role="status">{feedback}</p>}
      {!snapshots.length ? (
        <p>No hay versiones guardadas en este equipo.</p>
      ) : (
        <div className="summary-version-list">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id}>
              <div>
                <strong>
                  v{snapshot.versionNumber} · {snapshot.label}
                </strong>
                <p>
                  {snapshot.authorName} ·{" "}
                  {new Date(snapshot.createdAt).toLocaleString("es-DO")}
                </p>
                {snapshot.notes && <p>{snapshot.notes}</p>}
              </div>
              <div className="summary-actions">
                <button onClick={() => setComparing(snapshot)}>
                  Comparar con actual
                </button>
                <button
                  disabled={!canEdit}
                  onClick={async () => {
                    if (
                      await confirmAction({
                        title: "Restaurar versión",
                        message: "¿Restaurar el contenido técnico de esta versión? Se guardará un checkpoint del estado actual. El seguimiento comercial se conserva.",
                        confirmLabel: "Restaurar contenido",
                      })
                    ) {
                      const ok = restoreSnapshot(project.id, snapshot.id);
                      setFeedback(
                        ok
                          ? "Contenido técnico restaurado. Se conservó el seguimiento comercial."
                          : "No se pudo restaurar la versión.",
                      );
                    }
                  }}
                >
                  Restaurar contenido
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {comparing && (
        <div className="summary-comparison">
          <header className="summary-section-actions">
            <h3>v{comparing.versionNumber} frente a la actual</h3>
            <button onClick={() => setComparing(null)}>
              Cerrar comparación
            </button>
          </header>
          {!differences.length ? (
            <p>Sin diferencias de contenido.</p>
          ) : (
            <div className="summary-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Versión guardada</th>
                    <th>Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {differences.map((diff, index) => (
                    <tr key={index}>
                      <td>
                        {diff.section} · {diff.field}
                      </td>
                      <td>{diff.formattedOld}</td>
                      <td>{diff.formattedNew}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <CreateSnapshotModal
        projectId={project.id}
        isOpen={creating && canEdit}
        onClose={() => setCreating(false)}
      />
    </section>
  );
}
