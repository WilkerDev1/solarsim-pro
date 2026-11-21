import assert from "node:assert/strict";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { serializeSimulationStore } from "../store/persistence/serializeSimulationStore";
import { hydrateSimulationStore } from "../store/persistence/hydrateSimulationStore";
import { captureWorkspace } from "../store/sync/organizationWorkspace";
import { featureScope } from "../../shared/applicationFeatures";
import { SyncService } from "../services/syncService";
import type { SimulationStore } from "../store/types";
import type { SyncSettings } from "../types";

// El espacio activo vive en el store; archivarlo además en organizationWorkspaces duplicaba media persistencia
// (y validateSession lo hacía en cada arranque). Solo se archivan los espacios de otras organizaciones.
const serverUrl = "https://active-archive.invalid";
const user = (organizationId: string, id = "owner") => ({
  id,
  name: id,
  email: `${id}@example.test`,
  role: "ADMIN" as const,
  organizationId,
});
const session = (organizationId: string, id = "owner"): SyncSettings => ({
  serverUrl,
  authToken: "synthetic-token",
  autoSyncEnabled: false,
  lastSyncTimestamp: null,
  currentUser: user(organizationId, id),
});
const scopeA = featureScope(serverUrl, "org-a");
const scopeB = featureScope(serverUrl, "org-b");

async function run() {
  const original = SyncService.getSessionIdentity;
  try {
    store.getState().setSyncSettings(session("org-a"));
    assert.equal(store.getState().workspaceScope, scopeA);
    assert.ok(!(scopeA in store.getState().organizationWorkspaces), "El espacio activo no se archiva al entrar");
    store.getState().createNewProject({ name: "Cliente A" });
    const projectA = store.getState().activeProjectId;

    // validateSession en cada arranque: mismo alcance, sin archivo duplicado.
    SyncService.getSessionIdentity = async () => ({ success: true, user: user("org-a") });
    assert.equal((await store.getState().validateSession()).valid, true);
    assert.ok(!(scopeA in store.getState().organizationWorkspaces), "validateSession no archiva el espacio activo");
    assert.ok(!(scopeA in serializeSimulationStore(store.getState()).organizationWorkspaces), "Ni se persiste");
    store.getState().setSyncSettings({ autoSyncEnabled: false });
    assert.ok(!(scopeA in store.getState().organizationWorkspaces), "Un cambio de ajustes en el mismo alcance tampoco");

    // Cambiar de organización archiva el espacio que se deja y restaura el del regreso.
    store.getState().setSyncSettings(session("org-b"));
    assert.equal(store.getState().workspaceScope, scopeB);
    assert.ok(store.getState().organizationWorkspaces[scopeA].projects.some((p) => p.id === projectA));
    assert.ok(!(scopeB in store.getState().organizationWorkspaces));
    store.getState().createNewProject({ name: "Cliente B" });
    const projectB = store.getState().activeProjectId;
    store.getState().setSyncSettings(session("org-a"));
    assert.ok(store.getState().projects.some((p) => p.id === projectA), "Regresar restaura los proyectos de A");
    assert.ok(!store.getState().projects.some((p) => p.id === projectB));
    assert.equal(store.getState().activeProjectId, projectA);
    assert.ok(!(scopeA in store.getState().organizationWorkspaces), "Al volver, A deja de estar archivado");
    assert.ok(store.getState().organizationWorkspaces[scopeB].projects.some((p) => p.id === projectB));

    // Una carpeta privada de otro usuario del mismo alcance se conserva oculta (único motivo para archivar el activo).
    const privateFolder = store.getState().createFolder("Privada", "#10b981", "", false, "private")!;
    store.getState().setSyncSettings(session("org-a", "member"));
    assert.ok(!store.getState().folders.some((f) => f.id === privateFolder.id));
    store.getState().setSyncSettings(session("org-a", "owner"));
    assert.ok(store.getState().folders.some((f) => f.id === privateFolder.id), "La carpeta privada vuelve con su dueño");
    assert.ok(!(scopeA in store.getState().organizationWorkspaces), "Sin carpetas ocultas no queda archivo del activo");

    // Datos guardados por 2.8.2 (con el duplicado del espacio activo): al hidratar se descarta.
    const legacy = {
      ...store.getState(),
      organizationWorkspaces: { ...store.getState().organizationWorkspaces, [scopeA]: captureWorkspace(store.getState()) },
      syncSettings: { ...store.getState().syncSettings },
    } as SimulationStore;
    hydrateSimulationStore(legacy);
    assert.ok(!(scopeA in legacy.organizationWorkspaces), "El duplicado heredado se descarta al hidratar");
    assert.ok(legacy.organizationWorkspaces[scopeB], "Los archivos de otras organizaciones se conservan");
    assert.ok(legacy.projects.some((p) => p.id === projectA));

    // Si el archivo heredado guarda carpetas privadas de otro usuario, se conserva.
    const withHidden = {
      ...legacy,
      organizationWorkspaces: {
        ...legacy.organizationWorkspaces,
        [scopeA]: { ...captureWorkspace(legacy), folders: [{ id: "ajena", name: "Ajena", visibility: "private" as const, createdById: "member", createdAt: "2026-01-01" }] },
      },
    } as SimulationStore;
    hydrateSimulationStore(withHidden);
    assert.ok(withHidden.organizationWorkspaces[scopeA]?.folders.some((f) => f.id === "ajena"), "Las carpetas ocultas no se pierden");
  } finally {
    SyncService.getSessionIdentity = original;
  }
  console.log("El espacio activo no se archiva ni se persiste dos veces; los cambios de organización siguen aislados.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
