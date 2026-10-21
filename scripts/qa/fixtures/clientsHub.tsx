/** Disposable visual fixture for the clients directory. Never authenticates or transmits data. */
import { createRoot } from "react-dom/client";
import { ClientsHubView } from "../../../src/components/clients/ClientsHubView";
import { ProjectCard } from "../../../src/components/dashboard/ProjectCard";
import { ProposalClientSection } from "../../../src/components/clients/ProposalClientLink";
import { ConfirmDialog } from "../../../src/components/common/ConfirmDialog";
import { BENCHMARK_PROJECT } from "../../../src/engine/referenceCase";
import { useSimulationStore } from "../../../src/store/useSimulationStore";
import type { ProjectSimulation } from "../../../src/types";
import type { ClientRecord } from "../../../src/types/client";
import type { ProposalDecision } from "../../../shared/proposalCommercial";
import "../../../src/index.css";
import "../../../src/components/hub/project-summary.css";
const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
document.documentElement.classList.toggle("dark", theme === "dark");
const client = (id: string, name: string, extra: Partial<ClientRecord> = {}): ClientRecord => ({
  id, name, kind: "persona", taxId: "", phone: "", email: "", address: "", province: "", notes: "",
  createdAt: "2026-10-01T00:00:00.000Z", baseVersion: 0, ...extra,
});
const clients = params.has("empty")
  ? []
  : [
      client("qa-hotel", "Hotel Las Palmas del Caribe SRL", { kind: "empresa", taxId: "131000000", phone: "809-000-0001", email: "compras@example.test", province: "La Altagracia", address: "Dirección de prueba aislada", notes: "Contacto sintético para QA." }),
      client("qa-hotel-dup", "Hotel las Palmas del Caribe", { kind: "empresa" }),
      client("qa-ana", "Ana Pérez", { phone: "809-000-0002", province: "Santo Domingo" }),
      client("qa-colmado", "Colmado Esperanza", { kind: "empresa", taxId: "00100000001" }),
    ];
const proposal = (id: string, clientId: string | undefined, name: string, status: ProjectSimulation["status"], decision: ProposalDecision): ProjectSimulation => ({
  ...structuredClone(BENCHMARK_PROJECT), id, clientId, status,
  client: { ...BENCHMARK_PROJECT.client, name, projectId: `SP-QA-${id.slice(-2)}` },
  commercial: { status: decision, note: "", ownerName: "Consultora de prueba" },
  syncStatus: "local_only", updatedAt: `2026-10-1${id.slice(-1)}T00:00:00.000Z`,
});
const projects = params.has("empty") ? [] : [
  proposal("qa-p1", "qa-hotel", "Hotel Las Palmas — Cubierta A", "Final", "approved"),
  proposal("qa-p2", "qa-hotel", "Hotel Las Palmas — Parqueo", "Draft", "pending"),
  proposal("qa-p3", "qa-hotel", "Hotel Las Palmas — BESS", "Archived", "rejected"),
  proposal("qa-p4", "qa-ana", "Residencia Pérez", "Draft", "test"),
  proposal("qa-p5", undefined, "Propuesta sin cliente", "Draft", "pending"),
];
useSimulationStore.setState({
  workspaceScope: "local",
  sidebarTheme: theme,
  clients,
  clientChanges: Object.fromEntries(clients.map((c) => [c.id, { revision: "qa", baseVersion: 0 }])),
  clientDeletionQueue: [],
  clientSyncFeedback: params.has("feedback") ? "1 cliente(s) pendientes: hay cambios o permisos distintos. Sincroniza y revisa." : null,
  activeClientId: params.get("client") ?? (params.has("empty") ? null : "qa-hotel"),
  projects,
  activeProjectId: "qa-p1",
  syncSettings: { serverUrl: "https://example.invalid", authToken: null, autoSyncEnabled: false, lastSyncTimestamp: null, currentUser: null },
});
if (params.get("role") === "lector")
  useSimulationStore.setState({
    workspaceScope: "https://example.invalid|qa-org",
    syncSettings: { ...useSimulationStore.getState().syncSettings, authToken: "synthetic-qa-only", currentUser: { id: "qa-reader", name: "Lector de prueba", email: "lector@example.test", role: "LECTOR", organizationId: "qa-org" } },
  });
// Keep the fixture offline: navigation between views only changes local state.
useSimulationStore.setState({ syncClientsWithServer: async () => ({ success: true, message: "QA" }), triggerAutoSync: () => {} });
const view = params.get("view");
function Cards() {
  const live = useSimulationStore((s) => s.projects);
  return <>{live.map((p) => <ProjectCard key={p.id} project={p} />)}</>;
}
function ProposalSection() {
  const live = useSimulationStore((s) => s.projects.find((p) => p.id === "qa-p1"));
  return live ? <ProposalClientSection project={live} /> : null;
}
const root = createRoot(document.getElementById("root")!);
root.render(
  <>
    {view === "cards" ? (
      <div className={`${theme} flex-1 overflow-auto bg-slate-50 p-8 dark:bg-zinc-950`}>
        <div className="grid max-w-5xl grid-cols-3 gap-5">
          <Cards />
        </div>
      </div>
    ) : view === "proposal" ? (
      <div className="project-summary" style={{ maxWidth: 420 }}>
        <ProposalSection />
      </div>
    ) : (
      <ClientsHubView />
    )}
    <ConfirmDialog />
  </>,
);
