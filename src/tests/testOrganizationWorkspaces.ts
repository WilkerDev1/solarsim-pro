import assert from "node:assert/strict";
import type { SimulationStore } from "../store/types";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { serializeSimulationStore } from "../store/persistence/serializeSimulationStore";
import { initializeWorkspaces } from "../store/sync/organizationWorkspace";
import { normalizeCompanyProfiles } from "../store/persistence/companyProfiles";
import { DEFAULT_LOCAL_COMPANY } from "../types";
import { DEFAULT_EQUIPMENT_CATALOG } from "../data/defaultEquipmentCatalog";
import { BENCHMARK_PROJECT } from "../engine/referenceCase";
import { SyncService } from "../services/syncService";

const settings = (org: string) => ({
  serverUrl: "https://isolated-workspace.invalid",
  authToken: "synthetic-only",
  currentUser: {
    id: "reviewer",
    name: "Review",
    email: "qa@example.test",
    role: "ADMIN" as const,
    organizationId: org,
  },
  autoSyncEnabled: false,
});
async function run() {
  // All requests are synthetic; no production writes or credentials.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Real network forbidden");
  };
  try {
    const api = store.getState();
    api.setSyncSettings(settings("company-a"));
    const companyId = api.addCompany({
      ...DEFAULT_LOCAL_COMPANY,
      id: "a-brand",
      name: "Empresa A",
      rncOrId: "QA-A",
      isDefault: true,
    });
    api.createNewProject({ name: "Cliente aislado A" });
    const document = store.getState().getActiveProject();
    assert.equal(document.customization?.companyName, "Empresa A");
    assert.equal(document.companyProfileId, companyId);
    api.updateCompany(companyId, {
      name: "Empresa A editada",
      id: "forged",
      createdAt: "forged",
    });
    assert.equal(
      store.getState().getActiveProject().customization?.companyName,
      "Empresa A",
    );
    assert.ok(store.getState().companies.some((c) => c.id === companyId));
    const aSnapshot = serializeSimulationStore(store.getState());
    api.setSyncSettings(settings("company-b"));
    assert.equal(store.getState().projects.length, 0);
    assert.ok(
      !store.getState().companies.some((c) => c.name.startsWith("Empresa A")),
    );
    assert.equal(store.getState().projectDeletionQueue.length, 0);
    assert.equal(store.getState().undoStack.length, 0);
    api.createNewProject({ name: "Cliente B" });
    const bId = store.getState().activeProjectId;
    api.setSyncSettings(settings("company-a"));
    assert.ok(store.getState().projects.some((p) => p.id === document.id));
    assert.ok(!store.getState().projects.some((p) => p.id === bId));
    assert.equal(store.getState().projects[0].syncStatus, "pending");
    assert.deepEqual(
      store.getState().equipmentChanges,
      aSnapshot.equipmentChanges,
    );
    api.logoutUser();
    assert.ok(!store.getState().projects.some((p) => p.organizationId));
    api.setSyncSettings(settings("company-b"));
    assert.equal(store.getState().activeProjectId, bId);
    const unknownBefore = store
      .getState()
      .companies.filter((c) => c.isDefault)
      .map((c) => c.id);
    api.updateCompany("unknown", { isDefault: true });
    assert.deepEqual(
      store
        .getState()
        .companies.filter((c) => c.isDefault)
        .map((c) => c.id),
      unknownBefore,
    );
    const extra = api.addCompany({
      ...DEFAULT_LOCAL_COMPANY,
      id: "new-default",
      name: "Nuevo emisor",
      isDefault: true,
    });
    assert.equal(
      store.getState().companies.filter((c) => c.isDefault).length,
      1,
    );
    api.deleteCompany(extra);
    assert.equal(
      store.getState().companies.filter((c) => c.isDefault).length,
      1,
    );
    assert.ok(
      store
        .getState()
        .companies.some((c) => c.id === store.getState().activeCompanyId),
    );

    const migrated: SimulationStore = {
      ...store.getState(),
      workspaceScope: "",
      organizationWorkspaces: {},
      syncSettings: {
        ...store.getState().syncSettings,
        authToken: null,
        currentUser: null,
      },
      projects: [
        { ...BENCHMARK_PROJECT, id: "legacy-local", organizationId: undefined },
        {
          ...BENCHMARK_PROJECT,
          id: "legacy-foreign",
          organizationId: "foreign",
          syncServerUrl: "https://foreign.invalid",
        },
      ],
    };
    migrated.folders = [
      {
        id: "foreign-folder",
        name: "Carpeta privada",
        createdAt: "2026-01-01",
      },
    ];
    migrated.projects[1] = {
      ...migrated.projects[1],
      folderId: "foreign-folder",
    };
    migrated.snapshotsByProject = {
      "legacy-foreign": [
        {
          id: "foreign-history",
          projectId: "legacy-foreign",
          versionNumber: 1,
          label: "Historia",
          type: "manual",
          authorName: "QA",
          createdAt: "2026-01-01",
          systemCapacityKWp: 1,
          netInvestmentUSD: 1,
          panelCount: 1,
          data: migrated.projects[1],
        },
      ],
    };
    migrated.projectDeletionQueue = [
      {
        scope: "https://foreign.invalid|foreign",
        id: "legacy-foreign",
        baseVersion: 1,
        project: migrated.projects[1],
      },
    ];
    migrated.equipmentDeletionQueue = [
      {
        scope: "https://foreign.invalid|foreign",
        id: "queue-only",
        baseVersion: 1,
      },
    ];
    migrated.equipmentChanges = {
      "change-only": {
        scope: "https://foreign.invalid|foreign",
        baseVersion: 0,
        revision: "qa-change",
      },
    };
    migrated.deletedEquipmentIds = ["queue-only"];
    const reference = {
      ...DEFAULT_EQUIPMENT_CATALOG[0],
      organizationId: "org-electsun-default",
      syncServerUrl: "https://foreign.invalid",
      supplierPrices: [
        { id: "private-price", supplierId: "private", priceUSD: 42 },
      ],
    } as any;
    migrated.equipmentCatalog = [reference];
    migrated.equipmentChanges[reference.id] = {
      scope: "https://foreign.invalid|org-electsun-default",
      baseVersion: 1,
      revision: "pending-owner",
    };
    migrated.equipmentConflicts = {
      "conflict-only": {
        reason: "qa",
        serverItem: {
          ...reference,
          id: "conflict-only",
          organizationId: "foreign",
        },
      },
    };
    initializeWorkspaces(migrated);
    assert.equal(
      migrated.organizationWorkspaces[
        "https://foreign.invalid|org-electsun-default"
      ].equipmentCatalog.find((e) => e.id === reference.id)?.supplierPrices
        ?.length,
      1,
    );
    assert.ok(
      migrated.organizationWorkspaces["https://foreign.invalid|foreign"]
        .equipmentConflicts["conflict-only"],
    );
    assert.ok(!migrated.equipmentConflicts["conflict-only"]);
    assert.equal(Object.keys(migrated.snapshotsByProject).length, 0);
    assert.equal(migrated.projectDeletionQueue.length, 0);
    assert.equal(migrated.folders.length, 0);
    const foreignArchive =
      migrated.organizationWorkspaces["https://foreign.invalid|foreign"];
    assert.equal(foreignArchive.snapshotsByProject["legacy-foreign"].length, 1);
    assert.equal(foreignArchive.projectDeletionQueue.length, 1);
    assert.equal(foreignArchive.folders[0].id, "foreign-folder");
    assert.equal(migrated.equipmentDeletionQueue.length, 0);
    assert.equal(foreignArchive.equipmentDeletionQueue[0].id, "queue-only");
    assert.ok(foreignArchive.equipmentChanges["change-only"]);
    assert.ok(foreignArchive.deletedEquipmentIds?.includes("queue-only"));
    assert.deepEqual(
      migrated.projects.map((p) => p.id),
      ["legacy-local"],
    );
    assert.ok(
      Object.values(migrated.organizationWorkspaces).some((w) =>
        w.projects.some((p) => p.id === "legacy-foreign"),
      ),
    );
    const cleaned = normalizeCompanyProfiles(
      [
        {
          ...DEFAULT_LOCAL_COMPANY,
          dataVersion: undefined,
          rncOrId: "1-31-12345-6",
          phone: "809-555-0100",
          email: "real@example.test",
        },
      ],
      true,
    )[0];
    assert.equal(cleaned.rncOrId, "");
    assert.equal(cleaned.phone, "");
    assert.equal(cleaned.email, "real@example.test");

    const before = store.getState().tariffMatrix;
    let resolve!: (value: any) => void;
    SyncService.fetchTariffMatrix = () =>
      new Promise((done) => {
        resolve = done;
      });
    const pending = api.fetchTariffsFromServer();
    api.setSyncSettings(settings("company-a"));
    resolve({
      success: true,
      matrix: { ...before, notes: "FOREIGN-RESPONSE" },
    });
    assert.equal((await pending).success, false);
    assert.notEqual(store.getState().tariffMatrix.notes, "FOREIGN-RESPONSE");
    console.log(
      "✓ Organization workspace isolation, offline preservation, immutable issuer snapshots, profile invariants, conservative migration and stale tariff guard",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
