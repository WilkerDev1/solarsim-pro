/** Isolated actual App. Synthetic projects only; all network requests are denied. */
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import { useSimulationStore } from "../../../src/store/useSimulationStore";
import { BENCHMARK_PROJECT } from "../../../src/engine/referenceCase";
import { DEFAULT_LOCAL_COMPANY } from "../../../src/types";
import "../../../src/index.css";
const params = new URLSearchParams(location.search);
const dark = params.get("theme") === "dark";
const user = {
  id: "qa-ana",
  name: "Ana · QA",
  email: "ana@example.invalid",
  role: params.has("reader") ? ("VIEWER" as const) : ("EDITOR" as const),
  organizationId: "qa-org",
};
const names = [
  "Oficina Solar · QA",
  "Comercio del Norte · QA",
  "Residencia del Este · QA",
  "Proyecto piloto · QA",
  "Taller Central · QA",
];
const statuses = [
  "pending",
  "approved",
  "rejected",
  "test",
  "approved",
] as const;
const projects = names.map((name, index) => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id: `qa-proposal-${index}`,
  client: {
    ...BENCHMARK_PROJECT.client,
    name,
    company: "Empresa de prueba",
    email: "qa@example.invalid",
    phone: "",
    projectId: `SP-QA-${index + 1}`,
    quoteNumber: `C-QA-${index + 1}`,
  },
  proposalLink: params.has("linked") && index===1 ? {parentId:"qa-proposal-0"} : undefined,
  authorId: index % 2 ? "qa-bruno" : "qa-ana",
  authorName: index % 2 ? "Bruno · QA" : "Ana · QA",
  organizationId: "qa-org",
  syncServerUrl: "https://summary-qa.invalid",
  syncStatus: "synced" as const,
  baseVersion: 1,
  version: 1,
  commercial: {
    status: statuses[index],
    note: index === 2 ? "El cliente pospuso la inversión." : "",
    ownerId: index % 2 ? "qa-bruno" : "qa-ana",
    ownerName: index % 2 ? "Bruno · QA" : "Ana · QA",
  },
}));
window.fetch = async () => {
  throw new Error("Network forbidden in proposal summary QA");
};
useSimulationStore.setState({
  projects,
  activeProjectId: projects[0].id,
  activeView: params.get("view") === "dashboard" ? "dashboard" : "project-hub",
  workspaceScope: "https://summary-qa.invalid|qa-org",
  organizationWorkspaces: {},
  sidebarTheme: dark ? "dark" : "light",
  isSettingsModalOpen: false,
  searchQuery: "",
  folders: [],
  projectConflicts: {},
  projectDeletionQueue: [],
  snapshotsByProject: {},
  dashboardViewMode: params.get("layout") === "list" ? "list" : "cards",
  companies: [DEFAULT_LOCAL_COMPANY],
  activeCompanyId: DEFAULT_LOCAL_COMPANY.id,
  appAssistantEnabled: false,
  syncSettings: {
    serverUrl: "https://summary-qa.invalid",
    authToken: null,
    currentUser: user,
    autoSyncEnabled: false,
    lastSyncTimestamp: null,
  },
});
createRoot(document.getElementById("root")!).render(<App />);
