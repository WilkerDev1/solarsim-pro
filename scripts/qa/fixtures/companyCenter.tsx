import { CompanyService } from "../../../src/services/companyService";
import { SyncService } from "../../../src/services/syncService";
/** Disposable visual fixtures. Never authenticate or transmit company data. */
import { createRoot } from "react-dom/client";
import { CompanyProfileHubView } from "../../../src/components/companies/CompanyProfileHubView";
import { useSimulationStore } from "../../../src/store/useSimulationStore";
import { DEFAULT_LOCAL_COMPANY } from "../../../src/types";
import "../../../src/index.css";
const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const company = {
  ...DEFAULT_LOCAL_COMPANY,
  id: "qa-brand",
  name: "Caribe Solar Ingeniería SRL",
  commercialName: "Caribe Solar",
  rncOrId: "QA-000000",
  phone: "809-000-0000",
  email: "empresa@example.test",
  address: "Dirección de prueba aislada",
  website: "https://example.test",
  isDefault: true,
};
useSimulationStore.setState({
  workspaceScope: "local",
  sidebarTheme: theme,
  companies: [
    company,
    {
      ...company,
      id: "qa-brand-two",
      commercialName: "Proyectos Industriales del Caribe",
      name: "Proyectos Industriales del Caribe SRL",
      isDefault: false,
    },
  ],
  activeCompanyId: company.id,
  projects: [],
  syncSettings: {
    serverUrl: "https://example.invalid",
    authToken: null,
    autoSyncEnabled: false,
    lastSyncTimestamp: null,
    currentUser: null,
  },
});
if (params.has("role")) {
  const user = {
    id: "qa-user",
    name: "Consultora de prueba",
    email: "consultora@example.test",
    role:
      params.get("role") === "lector"
        ? ("LECTOR" as const)
        : ("ADMIN" as const),
    organizationId: "qa-org",
    organizationName: "Caribe Solar Ingeniería",
  };
  useSimulationStore.setState({
    workspaceScope: "https://example.invalid|qa-org",
    syncSettings: {
      ...useSimulationStore.getState().syncSettings,
      authToken: "synthetic-qa-only",
      currentUser: user,
    },
  });
  CompanyService.list = async () => ({
    success: true,
    organizations: [
      {
        id: "qa-org",
        name: user.organizationName,
        rnc: "",
        role: user.role,
        version: 1,
      },
      {
        id: "qa-org-two",
        name: "Proyectos Industriales",
        rnc: "",
        role: "EDITOR",
        version: 1,
      },
    ],
  });
  CompanyService.profile = async () => ({
    success: true,
    profile: company,
    version: 1,
  });
  CompanyService.invitations = async () =>
    params.has("inviteError")
      ? {
          success: false,
          error:
            "No se pudieron consultar las invitaciones. Servidor de prueba sin conexión.",
        }
      : {
          success: true,
          invitations: [
            {
              id: "qa-invite",
              email: "persona@example.test",
              role: "EDITOR",
              expiresAt: "2030-01-01T00:00:00Z",
              acceptedAt: null,
              revokedAt: null,
            },
          ],
        };
  SyncService.getCompanyUsers = async () => ({
    success: true,
    users: [
      { ...user, isActive: true, canEditIdentity: true },
      {
        ...user,
        id: "qa-editor",
        name: "Ingeniero de proyectos",
        email: "ingeniero@example.test",
        role: "EDITOR",
        canEditIdentity: false,
      },
    ],
  });
  SyncService.getMe = async () => user;
}
createRoot(document.getElementById("root")!).render(<CompanyProfileHubView />);
