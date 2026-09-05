import { SimulationSlice, ImportExportSlice } from '../types';
import { ProjectSimulation } from '../../types';
import { BENCHMARK_PROJECT } from '../../engine/referenceCase';
import { generateNextProjectSequence, generateDuplicateProjectIdentifiers } from '../initialData';

export const createImportExportSlice: SimulationSlice<ImportExportSlice> = (set, get) => ({
  pendingImportConflict: null,

  exportProjectAsJSON: (id?: string) => {
    const targetId = id || get().activeProjectId;
    const project = get().projects.find((p) => p.id === targetId) || get().getActiveProject();
    if (!project) return;

    const exportPayload = {
      app: 'SolarSim Pro',
      version: '1.6.0',
      exportedAt: new Date().toISOString(),
      type: 'single_project',
      project,
    };

    const clientNameSanitized = (project.client.name || 'Proyecto')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .substring(0, 40);
    const projId = project.client.projectId || 'SP-2026';
    const filename = `SolarSim_${clientNameSanitized}_${projId}.json`;

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    set({ saveFeedbackMessage: `¡Proyecto "${project.client.name}" exportado como JSON!` });
    setTimeout(() => set({ saveFeedbackMessage: null }), 3500);
  },

  exportAllProjectsAsJSON: () => {
    const { projects } = get();
    const exportPayload = {
      app: 'SolarSim Pro',
      version: '1.6.0',
      exportedAt: new Date().toISOString(),
      type: 'projects_backup',
      totalProjects: projects.length,
      projects,
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `SolarSim_Pro_Backup_Proyectos_${dateStr}.json`;

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    set({ saveFeedbackMessage: `¡Respaldo de ${projects.length} proyectos exportado!` });
    setTimeout(() => set({ saveFeedbackMessage: null }), 3500);
  },

  importProjectsFromJSON: (jsonData: any) => {
    try {
      let importedList: ProjectSimulation[] = [];

      // Case 1: Direct single project object
      if (jsonData && typeof jsonData === 'object' && jsonData.client && jsonData.specs && jsonData.rates) {
        importedList = [jsonData as ProjectSimulation];
      }
      // Case 2: Wrapped single project { project: { ... } }
      else if (jsonData && typeof jsonData === 'object' && jsonData.project && jsonData.project.client) {
        importedList = [jsonData.project as ProjectSimulation];
      }
      // Case 3: Array of projects
      else if (Array.isArray(jsonData)) {
        importedList = jsonData.filter((p) => p && typeof p === 'object' && p.client && p.specs && p.rates);
      }
      // Case 4: Backup object { projects: [ ... ] }
      else if (jsonData && typeof jsonData === 'object' && Array.isArray(jsonData.projects)) {
        importedList = jsonData.projects.filter((p: any) => p && typeof p === 'object' && p.client && p.specs && p.rates);
      }

      if (importedList.length === 0) {
        return {
          success: false,
          message: 'El archivo JSON no contiene una estructura de proyecto válida de SolarSim Pro.',
          count: 0,
        };
      }

      // Sanitize each project to guarantee complete numeric integrity and valid defaults
      importedList = importedList.map((raw) => ({
        ...BENCHMARK_PROJECT,
        ...raw,
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `proj-${Date.now()}`,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: raw.status || 'Draft',
        client: {
          ...BENCHMARK_PROJECT.client,
          ...(raw.client || {}),
          name: typeof raw.client?.name === 'string' ? raw.client.name.trim() : 'Cliente Importado',
          projectId: raw.client?.projectId || 'SP-2026-001',
          quoteNumber: raw.client?.quoteNumber || 'C-0001',
        },
        specs: {
          ...BENCHMARK_PROJECT.specs,
          ...(raw.specs || {}),
          panelCount: typeof raw.specs?.panelCount === 'number' && raw.specs.panelCount > 0 ? raw.specs.panelCount : 10,
          panelPowerW: typeof raw.specs?.panelPowerW === 'number' && raw.specs.panelPowerW > 0 ? raw.specs.panelPowerW : 620,
        },
        rates: {
          ...BENCHMARK_PROJECT.rates,
          ...(raw.rates || {}),
          energyCostPerKWh: typeof raw.rates?.energyCostPerKWh === 'number' && raw.rates.energyCostPerKWh > 0 ? raw.rates.energyCostPerKWh : 0.20,
        },
        financials: {
          ...BENCHMARK_PROJECT.financials,
          ...(raw.financials || {}),
        },
        monthlyConsumption: Array.isArray(raw.monthlyConsumption) && raw.monthlyConsumption.length === 12
          ? raw.monthlyConsumption.map((v: any) => typeof v === 'number' && !isNaN(v) && v >= 0 ? v : 1000)
          : [...BENCHMARK_PROJECT.monthlyConsumption],
        customization: {
          ...BENCHMARK_PROJECT.customization,
          ...(raw.customization || {}),
        },
      }));

      const currentProjects = get().projects;

      // If a SINGLE project is imported, check for ID / quote conflict to offer Option C modal
      if (importedList.length === 1) {
        const incoming = importedList[0];
        const conflicting = currentProjects.find(
          (p) =>
            p.id === incoming.id ||
            (p.client?.projectId && incoming.client?.projectId && p.client.projectId.trim().toLowerCase() === incoming.client.projectId.trim().toLowerCase()) ||
            (p.client?.quoteNumber && incoming.client?.quoteNumber && p.client.quoteNumber.trim().toLowerCase() === incoming.client.quoteNumber.trim().toLowerCase())
        );

        if (conflicting) {
          let reason = '';
          if (conflicting.client?.projectId?.trim().toLowerCase() === incoming.client?.projectId?.trim().toLowerCase()) {
            reason = `El ID de Proyecto "${incoming.client.projectId}" ya está registrado por "${conflicting.client.name}".`;
          } else if (conflicting.client?.quoteNumber?.trim().toLowerCase() === incoming.client?.quoteNumber?.trim().toLowerCase()) {
            reason = `El N° de Cotización "${incoming.client.quoteNumber}" ya está registrado por "${conflicting.client.name}".`;
          } else {
            reason = `El proyecto ya existe en tu catálogo ("${conflicting.client.name}").`;
          }

          set({
            pendingImportConflict: {
              incomingProject: incoming,
              conflictingProject: conflicting,
              reason,
            },
          });

          return {
            success: true,
            message: 'Se detectó un conflicto de ID. Selecciona cómo deseas importarlo.',
            count: 1,
          };
        }
      }

      // If no conflict or multiple projects in backup, process directly with unique IDs
      const existingIds = new Set(currentProjects.map((p) => p.id));
      const processedProjects: ProjectSimulation[] = [];

      for (const proj of importedList) {
        let finalId = proj.id;
        if (!finalId || existingIds.has(finalId)) {
          finalId = `proj-imported-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
        }
        existingIds.add(finalId);

        const currentUser = get().syncSettings?.currentUser;
        processedProjects.push({
          ...proj,
          id: finalId,
          updatedAt: new Date().toISOString(),
          syncStatus: currentUser ? 'pending' : 'local_only',
        });
      }

      const newProjectsList = [...processedProjects, ...currentProjects];
      const firstImportedId = processedProjects[0].id;

      set({
        projects: newProjectsList,
        activeProjectId: firstImportedId,
        activeView: 'simulator',
        saveFeedbackMessage: `¡${processedProjects.length} ${
          processedProjects.length === 1 ? 'proyecto importado' : 'proyectos importados'
        } con éxito!`,
      });

      if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
        get().triggerAutoSync(true);
      }

      setTimeout(() => set({ saveFeedbackMessage: null }), 4000);

      return {
        success: true,
        message: `Se importaron ${processedProjects.length} proyecto(s) correctamente.`,
        count: processedProjects.length,
      };
    } catch (err: any) {
      console.error('Error importing project JSON:', err);
      return {
        success: false,
        message: `Error al procesar el archivo: ${err?.message || 'Formato inválido'}`,
        count: 0,
      };
    }
  },

  resolveImportConflict: (strategy) => {
    const conflict = get().pendingImportConflict;
    if (!conflict) return;

    const { incomingProject, conflictingProject } = conflict;
    const currentProjects = get().projects;
    const currentUser = get().syncSettings?.currentUser;
    let updatedProjects: ProjectSimulation[] = [];
    let targetActiveId = '';
    let toastMsg = '';

    if (strategy === 'next_sequence') {
      const nextSeq = generateNextProjectSequence(currentProjects);
      const newId = `proj-imported-${Date.now()}`;
      const newProj: ProjectSimulation = {
        ...incomingProject,
        id: newId,
        updatedAt: new Date().toISOString(),
        syncStatus: currentUser ? 'pending' : 'local_only',
        client: {
          ...incomingProject.client,
          projectId: nextSeq.projectId,
          quoteNumber: nextSeq.quoteNumber,
        },
      };
      updatedProjects = [newProj, ...currentProjects];
      targetActiveId = newId;
      toastMsg = `¡Proyecto importado con nuevo ID asignado (${nextSeq.projectId})!`;
    } else if (strategy === 'overwrite') {
      const updatedProj: ProjectSimulation = {
        ...incomingProject,
        id: conflictingProject.id,
        updatedAt: new Date().toISOString(),
        syncStatus: currentUser ? 'pending' : 'local_only',
      };
      updatedProjects = currentProjects.map((p) => (p.id === conflictingProject.id ? updatedProj : p));
      targetActiveId = conflictingProject.id;
      toastMsg = `¡Proyecto "${incomingProject.client.name}" sobrescrito con éxito!`;
    } else if (strategy === 'copy_version') {
      const newId = `proj-imported-${Date.now()}`;
      const dupIdentifiers = generateDuplicateProjectIdentifiers(incomingProject, currentProjects);
      const newProj: ProjectSimulation = {
        ...incomingProject,
        id: newId,
        updatedAt: new Date().toISOString(),
        syncStatus: currentUser ? 'pending' : 'local_only',
        client: {
          ...incomingProject.client,
          name: dupIdentifiers.cleanName,
          projectId: dupIdentifiers.projectId,
          quoteNumber: dupIdentifiers.quoteNumber,
        },
      };
      updatedProjects = [newProj, ...currentProjects];
      targetActiveId = newId;
      toastMsg = `¡Proyecto importado como versión (${newProj.client.projectId})!`;
    }

    set({
      projects: updatedProjects,
      activeProjectId: targetActiveId,
      activeView: 'simulator',
      pendingImportConflict: null,
      saveFeedbackMessage: toastMsg,
    });

    if (get().syncSettings.autoSyncEnabled && get().syncSettings.authToken) {
      get().triggerAutoSync(true);
    }

    setTimeout(() => set({ saveFeedbackMessage: null }), 4000);
  },

  cancelImportConflict: () => {
    set({ pendingImportConflict: null });
  },
});
