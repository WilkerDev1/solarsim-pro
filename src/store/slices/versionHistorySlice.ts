import { generateDuplicateProjectIdentifiers } from '../initialData';
import { featureScope } from '../../../shared/applicationFeatures';
import { ownsProject } from '../sync/projectReconciliation';
import { projectDifferences } from '../sync/projectDifferences';
import { SyncService } from '../../services/syncService';
import { calculateProjectFinancialSummary } from '../../engine/financeEngine';
import { effectiveFeatureSettings } from '../../features/application/featurePolicy';
import { energyCalculationMode } from '../../../shared/applicationFeatures';
import { restoreProjectContent } from '../sync/projectMutation';
import { SimulationSlice, VersionHistorySlice } from '../types';
import { ProjectSimulation, ProjectSnapshot, DiffFieldChange, ProjectConflictInfo } from '../../types';

let undoDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastRecordedProjectId: string | null = null;

export const createVersionHistorySlice: SimulationSlice<VersionHistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,
  snapshotsByProject: {},
  activeConflict: null,
  projectConflicts: {},

  recordUndoState: (project) => {
    if (!project || !project.id) return;

    const generation = get().sessionGeneration;
    // Deep clone state to freeze snapshot
    const cloned = JSON.parse(JSON.stringify(project));

    // If switching projects or starting fresh, initialize base immediately
    if (lastRecordedProjectId !== project.id || get().undoStack.length === 0) {
      if (undoDebounceTimer) clearTimeout(undoDebounceTimer);
      lastRecordedProjectId = project.id;
      set({
        undoStack: [cloned],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
      return;
    }

    if (undoDebounceTimer) {
      clearTimeout(undoDebounceTimer);
    }

    undoDebounceTimer = setTimeout(() => {
      if (get().sessionGeneration !== generation) return;
      set((state) => {
        let currentStack = state.undoStack;
        if (lastRecordedProjectId !== project.id) {
          currentStack = [cloned];
          lastRecordedProjectId = project.id;
        }

        const newStack = [...currentStack, cloned].slice(-50); // Keep max 50
        return {
          undoStack: newStack,
          redoStack: [], // Clear redo on new action
          canUndo: newStack.length > 1,
          canRedo: false,
        };
      });
    }, 600);
  },

  undo: () => {
    const { undoStack, redoStack, activeProjectId, projects } = get();
    if (undoStack.length <= 1) return;

    const currentProject = projects.find((p) => p.id === activeProjectId);
    if (!currentProject) return;

    // Pop the current state
    const newUndoStack = [...undoStack];
    const currentState = newUndoStack.pop()!;
    const previousState = newUndoStack[newUndoStack.length - 1];

    if (!previousState) return;

    // Push current to redo
    const newRedoStack = [...redoStack, currentState];

    set((state) => ({
      undoStack: newUndoStack,
      redoStack: newRedoStack,
      canUndo: newUndoStack.length > 1,
      canRedo: true,
      projects: state.projects.map((p) => (p.id === activeProjectId ? restoreProjectContent(p, previousState, get().syncSettings) : p)),
    }));
    get().triggerAutoSync();
  },

  redo: () => {
    const { undoStack, redoStack, activeProjectId } = get();
    if (redoStack.length === 0) return;

    const newRedoStack = [...redoStack];
    const nextState = newRedoStack.pop()!;
    const newUndoStack = [...undoStack, nextState];

    set((state) => ({
      undoStack: newUndoStack,
      redoStack: newRedoStack,
      canUndo: true,
      canRedo: newRedoStack.length > 0,
      projects: state.projects.map((p) => (p.id === activeProjectId ? restoreProjectContent(p, nextState, get().syncSettings) : p)),
    }));
    get().triggerAutoSync();
  },

  createSnapshot: (projectId, label, notes = '', type = 'manual') => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Proyecto ${projectId} no encontrado`);

    const existing = get().snapshotsByProject[projectId] || [];
    const versionNumber = existing.length + 1;
    const author = get().syncSettings.currentUser?.name || get().localUserProfile.name || 'Consultor Local';
    const authorEmail = get().syncSettings.currentUser?.email || get().localUserProfile.email || '';
    const now = new Date().toISOString();

    const summary = calculateProjectFinancialSummary(project, energyCalculationMode(effectiveFeatureSettings(get())));
    const dcKWp = summary.systemCapacityKWp;
    const netInvestment = summary.netInvestmentUSD;

    const snapshot: ProjectSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      projectId,
      versionNumber,
      label: label.trim() || `Versión ${versionNumber}`,
      notes: notes.trim(),
      type,
      authorName: author,
      authorEmail,
      createdAt: now,
      systemCapacityKWp: dcKWp,
      netInvestmentUSD: netInvestment,
      panelCount: project.specs.panelCount || 0,
      data: JSON.parse(JSON.stringify(project)),
    };

    set((state) => ({
      snapshotsByProject: {
        ...state.snapshotsByProject,
        [projectId]: [snapshot, ...(state.snapshotsByProject[projectId] || [])],
      },
    }));

    // Add team notification if connected
    get().addNotification({
      projectId,
      projectCode: project.client.projectId,
      clientName: project.client.name,
      authorName: author,
      action: 'SNAPSHOT',
      title: `Nuevo punto de guardado: v${versionNumber}`,
      message: `${author} guardó el hito "${snapshot.label}" en ${project.client.name}`,
    });

    return snapshot;
  },

  restoreSnapshot: (projectId, snapshotId) => {
    const snapshots = get().snapshotsByProject[projectId] || [];
    const target = snapshots.find((s) => s.id === snapshotId);
    if (!target) return false;

    // Create an auto-checkpoint of current state before restoring
    try {
      get().createSnapshot(
        projectId,
        `Auto-checkpoint antes de restaurar a v${target.versionNumber}`,
        `Creado automáticamente antes de revertir cambios.`,
        'auto'
      );
    } catch {}

    const restoredData = JSON.parse(JSON.stringify(target.data));
    const now = new Date().toISOString();
    restoredData.updatedAt = now;
    restoredData.lastModifiedAt = now;
    restoredData.lastModifiedBy = get().syncSettings.currentUser?.name || get().localUserProfile.name || 'Consultor Local';

    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? restoreProjectContent(p, restoredData, get().syncSettings) : p)),
    }));

    get().triggerAutoSync();
    return true;
  },

  getProjectSnapshots: (projectId) => {
    return get().snapshotsByProject[projectId] || [];
  },

  deleteSnapshot: (projectId, snapshotId) => {
    set((state) => ({
      snapshotsByProject: {
        ...state.snapshotsByProject,
        [projectId]: (state.snapshotsByProject[projectId] || []).filter((s) => s.id !== snapshotId),
      },
    }));
  },

  compareSnapshots: (oldSnap, newSnap) => {
    const diffs: DiffFieldChange[] = [];
    const p1 = oldSnap.data;
    const p2 = newSnap.data;

    // Client changes
    if (p1.client.name !== p2.client.name) {
      diffs.push({
        field: 'Cliente',
        section: 'Cliente',
        oldValue: p1.client.name,
        newValue: p2.client.name,
        formattedOld: p1.client.name,
        formattedNew: p2.client.name,
      });
    }

    // Specs changes
    if (p1.specs.panelCount !== p2.specs.panelCount) {
      diffs.push({
        field: 'Cantidad de Paneles',
        section: 'Equipos',
        oldValue: p1.specs.panelCount,
        newValue: p2.specs.panelCount,
        formattedOld: `${p1.specs.panelCount} módulos`,
        formattedNew: `${p2.specs.panelCount} módulos`,
      });
    }
    if (p1.specs.panelPowerW !== p2.specs.panelPowerW) {
      diffs.push({
        field: 'Potencia de Panel',
        section: 'Equipos',
        oldValue: p1.specs.panelPowerW,
        newValue: p2.specs.panelPowerW,
        formattedOld: `${p1.specs.panelPowerW}W`,
        formattedNew: `${p2.specs.panelPowerW}W`,
      });
    }
    if (p1.specs.inverterPowerKW !== p2.specs.inverterPowerKW) {
      diffs.push({
        field: 'Inversor AC',
        section: 'Equipos',
        oldValue: p1.specs.inverterPowerKW,
        newValue: p2.specs.inverterPowerKW,
        formattedOld: `${p1.specs.inverterPowerKW} kW`,
        formattedNew: `${p2.specs.inverterPowerKW} kW`,
      });
    }
    if (p1.specs.hasBattery !== p2.specs.hasBattery || p1.specs.batteryCapacityKWh !== p2.specs.batteryCapacityKWh) {
      diffs.push({
        field: 'Baterías BESS',
        section: 'Equipos',
        oldValue: p1.specs.hasBattery ? `${p1.specs.batteryCapacityKWh} kWh` : 'Sin Baterías',
        newValue: p2.specs.hasBattery ? `${p2.specs.batteryCapacityKWh} kWh` : 'Sin Baterías',
        formattedOld: p1.specs.hasBattery ? `${p1.specs.batteryCapacityKWh} kWh` : 'Sin Baterías',
        formattedNew: p2.specs.hasBattery ? `${p2.specs.batteryCapacityKWh} kWh` : 'Sin Baterías',
      });
    }

    // Rates changes
    if (p1.rates.distributor !== p2.rates.distributor) {
      diffs.push({
        field: 'Distribuidora',
        section: 'Tarifas',
        oldValue: p1.rates.distributor,
        newValue: p2.rates.distributor,
        formattedOld: p1.rates.distributor,
        formattedNew: p2.rates.distributor,
      });
    }

    return diffs;
  },

  setActiveConflict: (conflict) => {
    if (!conflict) { set({ activeConflict: null }); return; }
    const { serverUrl, currentUser } = get().syncSettings;
    if (!currentUser || !ownsProject(conflict.localProject, serverUrl, currentUser.organizationId)) return;
    const scope = featureScope(serverUrl, currentUser.organizationId);
    const scoped = { ...conflict, scope };
    set(state => ({ activeConflict: scoped, projectConflicts: { ...state.projectConflicts, [scope + '|' + conflict.projectId]: scoped } }));
  },

  openProjectConflict: async (projectId) => {
    const captured = get();
    const { serverUrl, authToken, currentUser } = captured.syncSettings;
    const local = captured.projects.find(project => project.id === projectId);
    if (!authToken || !currentUser || !local || !ownsProject(local, serverUrl, currentUser.organizationId)) return { success: false, error: 'Inicia sesión en la organización de esta propuesta.' };
    const scope = featureScope(serverUrl, currentUser.organizationId);
    const result = await SyncService.pullProjects(serverUrl, authToken);
    const fresh = get();
    if (fresh.sessionGeneration !== captured.sessionGeneration || fresh.syncSettings.serverUrl !== serverUrl || fresh.syncSettings.currentUser?.id !== currentUser.id || fresh.syncSettings.currentUser?.organizationId !== currentUser.organizationId || !fresh.syncSettings.authToken) return { success: false, error: 'La sesión cambió. Vuelve a abrir el conflicto.' };
    const latest = fresh.projects.find(project => project.id === projectId);
    if (!latest || latest.syncStatus !== 'conflict' || !ownsProject(latest, serverUrl, currentUser.organizationId)) return { success: false, error: 'El estado de la propuesta cambió. Actualiza la lista.' };
    const previous = fresh.projectConflicts[scope + '|' + projectId];
    if (!result.success) return { success: false, error: result.error || 'No se pudo consultar la nube. Tu copia local se conserva.' };
    const server = result.projects?.find(project => project.id === projectId);
    const deleted = result.deletedIds?.includes(projectId) || (!server && previous?.reason === 'deleted');
    if (!server && !deleted) return { success: false, error: 'La propuesta ya no está disponible en la nube. Tu copia local se conserva.' };
    get().setActiveConflict({ projectId, scope, reason: deleted ? 'deleted' : undefined, localVersion: latest.baseVersion ?? 0, serverVersion: server?.version ?? 0, localProject: latest, serverProject: server || { ...latest, isDeleted: true },
      lastModifiedByName: !deleted && previous?.serverVersion === server?.version ? previous.lastModifiedByName : '', lastModifiedAt: server?.updatedAt || '', diffs: deleted ? [] : projectDifferences(server!, latest) });
    return { success: true };
  },

  resolveConflict: (resolution) => {
    const { activeConflict: opened, projectConflicts, projects, syncSettings } = get();
    const activeConflict = opened ? projectConflicts[(opened.scope || '') + '|' + opened.projectId] : null;
    if (!activeConflict || !syncSettings.currentUser || !syncSettings.authToken) return;
    const { projectId, serverProject } = activeConflict;
    const localProject = projects.find(project => project.id === projectId);
    const scope = featureScope(syncSettings.serverUrl, syncSettings.currentUser.organizationId);
    if (!localProject || !ownsProject(localProject, syncSettings.serverUrl, syncSettings.currentUser.organizationId) || activeConflict.scope !== scope) return;
    if (!['ADMIN', 'EDITOR'].includes(syncSettings.currentUser.role) && resolution !== 'accept_server') return;
    if (activeConflict.reason === 'deleted' && resolution !== 'fork') return;
    // A local checkpoint keeps discarded content recoverable in the version history.
    get().createSnapshot(projectId, 'Antes de resolver conflicto', undefined, 'manual');
    const canonical: ProjectSimulation = { ...serverProject, organizationId: localProject.organizationId, syncServerUrl: localProject.syncServerUrl, folderId: localProject.folderId, baseVersion: activeConflict.serverVersion, version: activeConflict.serverVersion, syncStatus: 'synced' };
    let next = canonical;
    let copy: ProjectSimulation | undefined;
    if (resolution === 'keep_local') next = { ...localProject, version: activeConflict.serverVersion, baseVersion: activeConflict.serverVersion, syncStatus: 'pending' };
    const identifiers = generateDuplicateProjectIdentifiers(localProject, projects);
    const now = new Date().toISOString();
    if (resolution === 'fork') copy = { ...localProject, id: crypto.randomUUID(), client: { ...localProject.client, name: localProject.client.name + ' (copia)', projectId: identifiers.projectId, quoteNumber: identifiers.quoteNumber }, createdAt: now, updatedAt: now, authorId: syncSettings.currentUser.id, authorName: syncSettings.currentUser.name, authorEmail: syncSettings.currentUser.email, lastModifiedBy: syncSettings.currentUser.name, lastModifiedAt: now, version: 1, baseVersion: 0, pendingCanonicalAck: undefined, syncStatus: 'pending', isDeleted: false, deletedAt: undefined, deletedBy: undefined };
    set(state => {
      const projectConflicts = { ...state.projectConflicts };
      delete projectConflicts[scope + '|' + projectId];
      return { projects: [...(activeConflict.reason === 'deleted' ? state.projects.filter(project => project.id !== projectId) : state.projects.map(project => project.id === projectId ? next : project)), ...(copy ? [copy] : [])], projectConflicts, activeConflict: null };
    });
    get().triggerAutoSync();
  },
});
