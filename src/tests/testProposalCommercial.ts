import assert from "node:assert/strict";
import {
  commercialState,
  isProposalCommercial,
  commercialCopy,
} from "../../shared/proposalCommercial";
import { salesPerformance } from "../features/proposals/commercial";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { BENCHMARK_PROJECT } from "../engine/referenceCase";
import { projectDifferences } from "../store/sync/projectDifferences";
import { reconcilePulledProjects } from "../store/sync/projectReconciliation";
import { serializeSimulationStore } from "../store/persistence/serializeSimulationStore";
import { restoreProjectContent } from "../store/sync/projectMutation";
const user = {
  id: "qa",
  name: "Ana",
  email: "qa@example.invalid",
  role: "EDITOR" as const,
  organizationId: "org-qa",
};
const session = {
  serverUrl: "https://commercial.invalid",
  currentUser: user,
  authToken: "synthetic",
  autoSyncEnabled: false,
  lastSyncTimestamp: null,
};
const base = {
  ...structuredClone(BENCHMARK_PROJECT),
  id: "commercial-test",
  organizationId: user.organizationId,
  syncServerUrl: session.serverUrl,
  authorId: user.id,
  authorName: user.name,
  baseVersion: 4,
  version: 4,
  syncStatus: "synced" as const,
};
assert.equal(commercialState(base).status, "pending");
assert.equal(commercialState(base).ownerId, user.id);
assert.equal(isProposalCommercial({ status: "constructor", note: "" }), false);
assert.equal(
  isProposalCommercial({ status: "approved", note: "x".repeat(4001) }),
  false,
);
const initial = store.getState();
try {
  store.getState().setSyncSettings(session);
  store.setState({
    projects: [base],
    snapshotsByProject: {},
    projectDeletionQueue: [],
  });
  assert.equal(
    store
      .getState()
      .setProposalCommercialState(base.id, {
        status: "rejected",
        note: "Presupuesto aplazado",
      }).success,
    true,
  );
  const rejected = store.getState().projects[0];
  assert.equal(rejected.commercial?.note, "Presupuesto aplazado");
  assert.equal(rejected.baseVersion, 4);
  assert.equal(rejected.syncStatus, "pending");
  assert.equal(rejected.commercial?.updatedById, user.id);
  assert.equal(store.getState().snapshotsByProject[base.id].length, 1);
  assert.equal(
    store.getState().setProposalCommercialState(base.id, { status: "approved" })
      .success,
    true,
  );
  assert.equal(
    store.getState().projects[0].commercial?.note,
    "Presupuesto aplazado",
    "Quick change preserves note",
  );
  const current = store.getState().projects[0];
  const restored = restoreProjectContent(current, base, session);
  assert.deepEqual(restored.commercial, current.commercial,
    "Restoring technical content must preserve the current commercial decision and note");
  const saved = serializeSimulationStore(store.getState());
  assert.equal(
    JSON.parse(JSON.stringify(saved)).projects[0].commercial.status,
    "approved",
  );
  assert.ok(
    projectDifferences(base, rejected).some(
      (diff) => diff.section === "Seguimiento comercial",
    ),
  );
  const authoritative = {
    ...rejected,
    version: 5,
    baseVersion: 5,
    commercial: {
      ...rejected.commercial!,
      updatedAt: "2030-01-01",
      updatedByName: "Verified actor",
    },
  };
  assert.equal(
    reconcilePulledProjects(
      [rejected],
      [authoritative],
      [],
      new Set(),
      session.serverUrl,
      user.organizationId,
    )[0].syncStatus,
    "synced",
    "Server audit timestamp is not a content conflict",
  );
  assert.equal(
    reconcilePulledProjects(
      [rejected],
      [
        {
          ...authoritative,
          commercial: { ...authoritative.commercial, note: "Cambio remoto" },
        },
      ],
      [],
      new Set(),
      session.serverUrl,
      user.organizationId,
    )[0].syncStatus,
    "pending",
    "Different commercial notes cannot be acknowledged silently",
  );
  store.getState().duplicateProject(base.id);
  const copy = store.getState().projects.find((p) => p.id !== base.id)!;
  assert.equal(
    copy.commercial?.status,
    "pending",
    "A copied sale is not another approved sale",
  );
  assert.equal(
    commercialCopy({ commercial: { status: "test", note: "Prueba" } }).status,
    "test",
  );
  store.setState({ projects: [{ ...base, isDeleted: true }] });
  assert.equal(
    store.getState().setProposalCommercialState(base.id, { status: "approved" })
      .success,
    false,
  );
  store.setState({ projects: [{ ...base, syncStatus: "conflict" }] });
  assert.equal(
    store.getState().setProposalCommercialState(base.id, { status: "approved" })
      .success,
    false,
  );
  store.setState({
    projects: [base],
    syncSettings: { ...session, currentUser: { ...user, role: "VIEWER" } },
  });
  assert.equal(
    store.getState().setProposalCommercialState(base.id, { status: "approved" })
      .success,
    false,
  );
  store.setState({
    syncSettings: {
      ...session,
      currentUser: { ...user, organizationId: "foreign" },
    },
  });
  assert.equal(
    store.getState().setProposalCommercialState(base.id, { status: "approved" })
      .success,
    false,
  );
  const report = salesPerformance(
    [
      base,
      { ...base, id: "a", commercial: { status: "approved", note: "" } },
      { ...base, id: "b", commercial: { status: "rejected", note: "" } },
      { ...base, id: "c", commercial: { status: "test", note: "" } },
      {
        ...base,
        id: "d",
        isDeleted: true,
        commercial: { status: "approved", note: "" },
      },
    ],
    () => 1000,
  );
  assert.deepEqual(report.counts, {
    pending: 1,
    approved: 1,
    rejected: 1,
    test: 1,
  });
  assert.equal(report.sellers[0].amountUSD, 1000);
  assert.equal(report.sellers[0].approved, 1);
} finally {
  store.setState(initial, true);
}
console.log(
  "✓ Commercial state, notes, attribution, CAS, lost ACK semantics, guards, copies and sales aggregation.",
);
