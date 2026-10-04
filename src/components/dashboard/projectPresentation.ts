import { ProjectSimulation } from '../../types';

export function projectType(project: ProjectSimulation): string {
  if (project.rates.isZeroExport) return 'Inyección cero';
  return project.specs.hasBattery ? 'Híbrido' : 'Inyección';
}

export function projectSyncLabel(project: ProjectSimulation): string {
  switch (project.syncStatus) {
    case 'synced': return 'Sincronizado';
    case 'pending': return 'Pendiente';
    case 'conflict': return 'En conflicto';
    default: return 'Solo local';
  }
}

export function projectDate(project: ProjectSimulation): string {
  const date = new Date(project.updatedAt || project.createdAt);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' });
}
