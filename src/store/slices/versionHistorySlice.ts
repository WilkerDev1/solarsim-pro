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

  recordUndoState: (project) => {
    if (!project || !project.id) return;

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
    set({ activeConflict: conflict });
  },

  resolveConflict: (resolution) => {
    const { activeConflict, projects } = get();
    if (!activeConflict) return;

    const { projectId, serverProject } = activeConflict;
    const localProject = projects.find((project) => project.id === projectId) || activeConflict.localProject;

    if (resolution === 'keep_local') {
      // Force next push to increment over server version
      const bumpedLocal = {
        ...localProject,
        version: serverProject.version || 1,
        baseVersion: serverProject.version,
        syncStatus: 'pending' as const,
      };
      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? bumpedLocal : p)),
        activeConflict: null,
      }));
    } else if (resolution === 'accept_server') {
      // Overwrite local with server
      set((state) => ({
        projects: state.projects.map((p) => (p.id === projectId ? { ...serverProject, baseVersion: serverProject.version, syncStatus: 'synced' as const } : p)),
        activeConflict: null,
      }));
    } else if (resolution === 'fork') {
      // Keep server as is, and save local as a new forked project
      const forkedId = `${projectId}-fork-${Date.now().toString(36).substring(2, 6)}`;
      const forkedProject: ProjectSimulation = {
        ...localProject,
        id: forkedId,
        client: {
          ...localProject.client,
          name: `${localProject.client.name} (Bifurcación Copia)`,
          projectId: `${localProject.client.projectId || 'SP'}-FORK`,
        },
        version: 1,
        baseVersion: 0,
        syncStatus: 'pending',
      };
      set((state) => ({
        projects: [
          ...state.projects.map((p) => (p.id === projectId ? { ...serverProject, baseVersion: serverProject.version, syncStatus: 'synced' as const } : p)),
          forkedProject,
        ],
        activeConflict: null,
      }));
    }
    get().triggerAutoSync();
  },
});
