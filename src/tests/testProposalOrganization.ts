import assert from "node:assert/strict";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { BENCHMARK_PROJECT } from "../engine/referenceCase";
import {
  orderProposalFamilies,
  proposalFamily,
  unlinkableDrag,
  unlinkOnQuickDrop,
  startProposalDrag,
  stopProposalDrag,
  currentProposalDrag,
  onProposalDragStop,
} from "../features/proposals/proposalGroups";
import { projectDifferences } from "../store/sync/projectDifferences";
import { serializeSimulationStore } from "../store/persistence/serializeSimulationStore";
import { reconcilePulledProjects } from "../store/sync/projectReconciliation";
import {
  commercialState,
  isProposalCommercial,
} from "../../shared/proposalCommercial";
const user = {
  id: "qa",
  name: "QA",
  email: "qa@example.invalid",
  role: "EDITOR" as const,
  organizationId: "qa-org",
};
const session = {
  serverUrl: "https://organization.invalid",
  currentUser: user,
  authToken: null,
  autoSyncEnabled: false,
  lastSyncTimestamp: null,
};
const make = (id: string) => ({
  ...structuredClone(BENCHMARK_PROJECT),
  id,
  organizationId: user.organizationId,
  syncServerUrl: session.serverUrl,
  syncStatus: "synced" as const,
  version: 2,
  baseVersion: 2,
  authorId: user.id,
  authorName: user.name,
});
const initial = store.getState();
try {
  store.setState({
    projects: [make("root"), make("child"), make("other")],
    syncSettings: session,
    snapshotsByProject: {},
  });
  assert.equal(store.getState().linkProposals("child", "root").success, true);
  assert.equal(
    store.getState().linkProposals("root", "child").success,
    false,
    "Cycles rejected",
  );
  assert.equal(
    store.getState().setProposalGroupColor("child", "#2563b8").success,
    true,
  );
  let all = store.getState().projects;
  assert.equal(proposalFamily(all[1], all).color, "#2563b8");
  assert.deepEqual(
    orderProposalFamilies([all[1], all[2], all[0]], all).map((p) => p.id),
    ["root", "child", "other"],
  );
  assert.deepEqual(
    orderProposalFamilies([all[1]], all).map((p) => p.id),
    ["child"],
    "Filtered children remain visible without injecting excluded parents",
  );
  assert.ok(
    projectDifferences(make("child"), all[1]).some(
      (diff) => diff.section === "Grupo de propuestas",
    ),
  );
  assert.equal(all[1].baseVersion, 2);
  assert.equal(all[1].syncStatus, "pending");
  store
    .getState()
    .setProposalCommercialState("root", {
      status: "pending",
      note: "Primera conversación",
    });
  assert.equal(
    store
      .getState()
      .addProposalCommercialReport(
        "root",
        {
          status: "approved",
          note: "Cliente aprobó el alcance",
          ownerId: user.id,
          ownerName: user.name,
        },
        true,
      ).success,
    true,
  );
  let project = store.getState().projects.find((p) => p.id === "root")!;
  assert.equal(project.commercial?.status, "approved");
  assert.equal(project.commercial?.reports?.length, 2);
  const before = structuredClone(project.commercial!.reports!);
  assert.equal(
    store
      .getState()
      .addProposalCommercialReport(
        "root",
        { status: "pending", note: "Confirmación del presupuesto anterior" },
        false,
      ).success,
    true,
  );
  project = store.getState().projects.find((p) => p.id === "root")!;
  assert.equal(
    project.commercial?.status,
    "approved",
    "A historical report does not change global state unless selected",
  );
  assert.deepEqual(project.commercial!.reports!.slice(0, 2), before);
  assert.equal(
    new Set(project.commercial!.reports!.map((report) => report.id)).size,
    3,
  );
  assert.ok(
    project.commercial!.reports!.every(
      (report) =>
        report.projectId === "root" &&
        Number.isFinite(Date.parse(report.createdAt)),
    ),
  );
  store.getState().setProposalCommercialState("root", { status: "rejected" });
  assert.equal(
    store.getState().projects.find((p) => p.id === "root")!.commercial?.reports
      ?.length,
    3,
    "Quick state changes preserve all reports",
  );
  const serialized = JSON.parse(
    JSON.stringify(serializeSimulationStore(store.getState())),
  );
  assert.equal(
    serialized.projects.find((p: any) => p.id === "root").commercial.reports
      .length,
    3,
  );
  assert.equal(
    serialized.projects.find((p: any) => p.id === "child").proposalLink
      .parentId,
    "root",
  );
  const local = store.getState().projects.find((p) => p.id === "root")!;
  const canonical = {
    ...local,
    version: 3,
    baseVersion: 3,
    commercial: {
      ...local.commercial!,
      reports: local.commercial!.reports!.map((report) => ({
        ...report,
        createdById: "verified",
        createdByName: "Verified",
      })),
    },
  };
  assert.equal(
    reconcilePulledProjects(
      [local],
      [canonical],
      [],
      new Set(),
      session.serverUrl,
      user.organizationId,
    )[0].syncStatus,
    "synced",
    "Verified attribution is not a lost ACK conflict",
  );
  assert.equal(
    isProposalCommercial({
      ...commercialState(local),
      reports: [{ id: "broken" }],
    }),
    false,
  );
  store.getState().duplicateProject("root");
  const copy = store
    .getState()
    .projects.find((p) => !["root", "child", "other"].includes(p.id))!;
  assert.equal(copy.proposalLink?.parentId, "root");
  assert.equal(
    copy.commercial?.reports,
    undefined,
    "Copies do not duplicate report history",
  );
  assert.equal(store.getState().linkProposals("child", null).success, true);
  assert.equal(
    store.getState().projects.find((p) => p.id === "child")!.proposalLink
      ?.parentId,
    null,
  );
  const foreign = {
    ...make("foreign-proposal"),
    organizationId: "other-org",
    syncServerUrl: "https://other.invalid",
    proposalLink: { parentId: "external-parent", color: "#2563b8" },
    commercial: {
      status: "approved" as const,
      note: "Foreign decision",
      ownerId: "foreign-owner",
      ownerName: "Foreign owner",
      reports: [{
        id: "foreign-report", projectId: "foreign-proposal",
        status: "approved" as const, note: "Foreign report",
        createdAt: "2026-10-01T00:00:00.000Z", ownerId: "foreign-owner",
      }],
    },
  };
  for (const payload of [foreign, { project: foreign }, [foreign], { projects: [foreign] }]) {
    store.setState({ projects: [], pendingImportConflict: null });
    assert.equal(store.getState().importProjectsFromJSON(payload).success, true);
    const imported = store.getState().projects[0];
    assert.equal(imported.organizationId, user.organizationId);
    assert.equal(imported.syncServerUrl, session.serverUrl);
    assert.equal(imported.baseVersion, 0);
    assert.equal(imported.proposalLink, undefined, "Imported copies never link to external proposals");
    assert.deepEqual(imported.commercial, {
      status: "pending", note: "", ownerId: user.id, ownerName: user.name,
    }, "Direct and wrapped copies reset decisions, history and foreign ownership");
  }
  // A multi-project backup bypasses the single-proposal conflict dialog.
  store.setState({ projects: [make(foreign.id)], pendingImportConflict: null });
  assert.equal(store.getState().importProjectsFromJSON({ projects: [foreign, {
    ...foreign, id: "foreign-test", commercial: { ...foreign.commercial, status: "test" },
  }] }).success, true);
  const importedBackup = store.getState().projects.slice(0, 2);
  assert.notEqual(importedBackup[0].id, foreign.id);
  assert.equal(importedBackup[0].commercial?.reports, undefined, "Reidentified copies cannot retain reports for the previous ID");
  assert.equal(importedBackup[1].commercial?.status, "test", "Test copies remain test proposals");
  assert.ok(importedBackup.every(p => !p.proposalLink && p.commercial?.ownerId === user.id));
  store.setState({ projects: [], syncSettings: { ...session, currentUser: null } });
  assert.equal(store.getState().importProjectsFromJSON(foreign).success, true);
  assert.equal(store.getState().projects[0].commercial?.ownerId, undefined);
  assert.equal(store.getState().projects[0].syncStatus, "local_only");
  const destination = {
    ...make("destination"),
    proposalLink: { parentId: "local-parent", color: "#8852b5" },
    commercial: { status: "rejected" as const, note: "Local decision", reports: [{
      ...foreign.commercial.reports[0], id: "local-report", projectId: "destination", ownerId: user.id,
    }] },
  };
  store.setState({ projects: [destination], syncSettings: session, pendingImportConflict: null });
  assert.equal(store.getState().importProjectsFromJSON(foreign).success, true);
  assert.ok(store.getState().pendingImportConflict);
  store.getState().resolveImportConflict("overwrite");
  const overwritten = store.getState().projects[0];
  assert.equal(overwritten.id, destination.id);
  assert.deepEqual(overwritten.commercial, destination.commercial, "Technical overwrite preserves destination reports and decision");
  assert.deepEqual(overwritten.proposalLink, destination.proposalLink, "Technical overwrite preserves destination relationships");
  assert.equal(overwritten.baseVersion, destination.baseVersion);
  store.setState({ projects: all, syncSettings: session });
  store.setState({
    syncSettings: { ...session, currentUser: { ...user, role: "VIEWER" } },
  });
  assert.equal(store.getState().linkProposals("child", "root").success, false);
  assert.equal(
    store.getState().setProposalGroupColor("root", "#8852b5").success,
    false,
  );
  assert.equal(
    store
      .getState()
      .addProposalCommercialReport(
        "root",
        { status: "test", note: "No permitido" },
        true,
      ).success,
    false,
  );
} finally {
  store.setState(initial, true);
}
console.log(
  "✓ Proposal families, cycle prevention, ordering/filtering, local persistence, report chronology/identity, CAS and permissions.",
);

const ancestor=make('ancestor'),hidden={...make('hidden'),proposalLink:{parentId:'ancestor'}},descendant={...make('descendant'),proposalLink:{parentId:'hidden'}};
assert.deepEqual(orderProposalFamilies([descendant,ancestor],[ancestor,hidden,descendant]).map(p=>p.id),['ancestor','descendant'],'Hidden intermediary must not reorder descendants above their visible ancestor');

// Dragging a linked proposal out of its family (onto empty space) unlinks it, like taking it out of a folder.
{
  const root=make('u-root'),child={...make('u-child'),proposalLink:{parentId:'u-root'}},loose=make('u-loose'),gone={...make('u-gone'),isDeleted:true,proposalLink:{parentId:'u-root'}};
  const all=[root,child,loose,gone];
  assert.equal(unlinkableDrag('u-child',all)?.id,'u-child','a linked proposal can be dragged out');
  assert.equal(unlinkableDrag('u-root',all),null,'a principal has nothing to unlink from');
  assert.equal(unlinkableDrag('u-loose',all),null,'an independent proposal has nothing to unlink from');
  assert.equal(unlinkableDrag('u-gone',all),null,'trashed proposals are ignored');
  assert.equal(unlinkableDrag(null,all),null);
  assert.equal(unlinkableDrag('missing',all),null);
}

// Soltar sin esperar sobre una propuesta de OTRO grupo la saca de su grupo; la lista suele no dejar huecos vacíos.
{
  const root=make('q-root'),child={...make('q-child'),proposalLink:{parentId:'q-root'}},grandchild={...make('q-grand'),proposalLink:{parentId:'q-child'}},
    sibling={...make('q-sibling'),proposalLink:{parentId:'q-root'}},loose=make('q-loose'),otherRoot=make('q-other'),otherChild={...make('q-other-child'),proposalLink:{parentId:'q-other'}};
  const all=[root,child,grandchild,sibling,loose,otherRoot,otherChild];
  assert.equal(unlinkOnQuickDrop('q-child','q-loose',all)?.id,'q-child','quick drop on an ungrouped proposal unlinks');
  assert.equal(unlinkOnQuickDrop('q-child','q-other-child',all)?.id,'q-child','quick drop on another family unlinks');
  assert.equal(unlinkOnQuickDrop('q-child','q-root',all),null,'its own principal is not "outside"');
  assert.equal(unlinkOnQuickDrop('q-child','q-sibling',all),null,'a sibling is not "outside"');
  assert.equal(unlinkOnQuickDrop('q-child','q-grand',all),null,'its own linked proposals are not "outside"');
  assert.equal(unlinkOnQuickDrop('q-root','q-loose',all),null,'a principal has nothing to unlink from');
  assert.equal(unlinkOnQuickDrop('q-child','q-child',all),null);
  assert.equal(unlinkOnQuickDrop(null,'q-loose',all),null);
}

// Si el arrastre termina sin dragend (Wayland, ventana que pierde el foco), el siguiente puntero suelto lo libera.
{
  const listeners=new Map<string,Set<(event:any)=>void>>();
  const fakeWindow={
    addEventListener:(type:string,fn:(event:any)=>void)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type)!.add(fn);},
    removeEventListener:(type:string,fn:(event:any)=>void)=>{listeners.get(type)?.delete(fn);},
    dispatchEvent:(event:{type:string})=>{listeners.get(event.type)?.forEach(fn=>fn(event));return true;},
  };
  const previousWindow=(globalThis as any).window;
  (globalThis as any).window=fakeWindow;
  try{
    const fire=(type:string,event:any={})=>[...(listeners.get(type)||[])].forEach(fn=>fn({type,...event}));
    const data:Record<string,string>={};
    const dragEvent=()=>({dataTransfer:{setData:(k:string,v:string)=>{data[k]=v;},effectAllowed:''}}) as any;
    let stops=0;const unsubscribe=onProposalDragStop(()=>stops++);
    startProposalDrag(dragEvent(),'p-1');
    assert.equal(currentProposalDrag(),'p-1');
    assert.equal(data['text/plain'],'p-1');
    await new Promise(r=>setTimeout(r,0));
    fire('pointermove',{buttons:1});
    assert.equal(currentProposalDrag(),'p-1','a held button means the drag is still going');
    fire('pointermove',{buttons:0});
    assert.equal(currentProposalDrag(),null,'a free pointer means the drag ended without dragend');
    assert.equal(stops,1,'drop targets are told to clear their highlight');
    assert.equal(listeners.get('pointermove')?.size||0,0,'the fallback listeners are released');
    startProposalDrag(dragEvent(),'p-2');
    stopProposalDrag();stopProposalDrag();
    assert.equal(stops,2,'a normal dragend notifies once');
    await new Promise(r=>setTimeout(r,0));
    assert.equal(listeners.get('pointerdown')?.size||0,0,'a stopped drag never arms the fallback');
    unsubscribe();
  }finally{(globalThis as any).window=previousWindow;}
}
console.log("✓ Quick drop outside the family unlinks; a drag that never gets dragend is released.");
