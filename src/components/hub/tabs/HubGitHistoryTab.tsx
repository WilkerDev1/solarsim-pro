import React, { useState } from 'react';
import { ProjectSimulation, ProjectSnapshot, DiffFieldChange } from '../../../types';
import { useSimulationStore } from '../../../store/useSimulationStore';
import {
  GitCommit,
  RotateCcw,
  Clock,
  User,
  Plus,
  GitCompare,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { CreateSnapshotModal } from '../components/CreateSnapshotModal';

interface HubGitHistoryTabProps {
  project: ProjectSimulation;
}

export const HubGitHistoryTab: React.FC<HubGitHistoryTabProps> = ({ project }) => {
  const { getProjectSnapshots, restoreSnapshot, compareSnapshots } = useSimulationStore();
  const snapshots = getProjectSnapshots(project.id);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [comparingSnapshot, setComparingSnapshot] = useState<ProjectSnapshot | null>(null);
  const [diffResults, setDiffResults] = useState<DiffFieldChange[] | null>(null);
  const [restoreFeedback, setRestoreFeedback] = useState<string | null>(null);

  const handleRestore = (snap: ProjectSnapshot) => {
    if (
      confirm(
        `¿Seguro que deseas revertir este proyecto a la versión v${snap.versionNumber} ("${snap.label}")?\n\nSe creará un auto-checkpoint del estado actual para que no pierdas ningún dato.`
      )
    ) {
      const ok = restoreSnapshot(project.id, snap.id);
      if (ok) {
        setRestoreFeedback(`¡Proyecto restaurado a v${snap.versionNumber}! ⏪`);
        setTimeout(() => setRestoreFeedback(null), 3000);
      }
    }
  };

  const handleCompare = (snap: ProjectSnapshot) => {
    const currentMockSnap: ProjectSnapshot = {
      id: 'current',
      projectId: project.id,
      versionNumber: project.version || 1,
      label: 'Versión Actual',
      type: 'manual',
      authorName: 'Actual',
      createdAt: new Date().toISOString(),
      systemCapacityKWp: ((project.specs.panelPowerW || 0) * (project.specs.panelCount || 0)) / 1000,
      netInvestmentUSD: 0,
      panelCount: project.specs.panelCount || 0,
      data: project,
    };

    const diffs = compareSnapshots(snap, currentMockSnap);
    setComparingSnapshot(snap);
    setDiffResults(diffs);
  };

  return (
    <div className="flex flex-col gap-6 select-none animate-in fade-in duration-200">
      {/* 🧭 Header Bar */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-[#161b22] border border-[#30363d]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <GitCommit className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Historial de Versiones Estilo Git (Local-First)</h3>
            <p className="text-xs text-zinc-400">
              Cada punto de guardado conserva todos los cálculos, tarifas y especificaciones de forma inmutable.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {restoreFeedback && (
            <span className="text-xs font-semibold px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg animate-in fade-in">
              {restoreFeedback}
            </span>
          )}

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-950/40 cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Punto de Restauración</span>
          </button>
        </div>
      </div>

      {/* 🔍 Visual Diff Modal / Drawer */}
      {comparingSnapshot && diffResults && (
        <div className="p-5 rounded-2xl bg-[#1c2128] border border-purple-500/40 shadow-xl flex flex-col gap-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-[#30363d]">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-bold text-white">
                Comparando: <span className="text-purple-300 font-mono">v{comparingSnapshot.versionNumber} ({comparingSnapshot.label})</span> vs <span className="text-emerald-400 font-mono">Versión Actual</span>
              </h4>
            </div>
            <button
              onClick={() => {
                setComparingSnapshot(null);
                setDiffResults(null);
              }}
              className="text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
            >
              Cerrar Comparación ✕
            </button>
          </div>

          {diffResults.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">
              No se detectaron diferencias en los parámetros clave entre esta versión y el estado actual.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-2">
                <span className="col-span-3">Parámetro</span>
                <span className="col-span-4 text-rose-400">Versión Histórica (v{comparingSnapshot.versionNumber})</span>
                <span className="col-span-1 text-center">→</span>
                <span className="col-span-4 text-emerald-400">Versión Actual</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {diffResults.map((diff, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 text-xs p-2.5 rounded-xl bg-[#0d1117] border border-[#21262d] items-center"
                  >
                    <span className="col-span-3 font-semibold text-white truncate">{diff.field}</span>
                    <span className="col-span-4 font-mono text-rose-300 truncate bg-rose-950/20 px-2 py-0.5 rounded border border-rose-900/30">
                      {diff.formattedOld}
                    </span>
                    <span className="col-span-1 text-center text-zinc-500">
                      <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                    </span>
                    <span className="col-span-4 font-mono text-emerald-300 truncate bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-900/30">
                      {diff.formattedNew}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 📜 Timeline List */}
      <div className="flex flex-col gap-4">
        {snapshots.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#161b22] border border-dashed border-[#30363d] flex flex-col items-center justify-center gap-3">
            <GitCommit className="w-10 h-10 text-zinc-600" />
            <div className="max-w-md">
              <h4 className="text-sm font-bold text-white">Sin Puntos de Restauración Creados</h4>
              <p className="text-xs text-zinc-400 mt-1">
                Puedes crear checkpoints manuales para guardar versiones aprobadas por clientes, estados de cotización o alternativas técnicas para revertir en cualquier momento.
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer"
            >
              + Crear Primer Hito
            </button>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-[#30363d] flex flex-col gap-6 ml-4">
            {snapshots.map((snap) => {
              const formattedDate = new Date(snap.createdAt).toLocaleString('es-DO', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={snap.id} className="relative flex flex-col gap-2">
                  {/* Dot Icon on the line */}
                  <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-purple-500 border-4 border-[#0d1117] shadow-xs" />

                  {/* Card */}
                  <div className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] hover:border-zinc-500 transition-all flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          v{snap.versionNumber}
                        </span>
                        <h4 className="text-sm font-bold text-white">{snap.label}</h4>
                        {snap.type === 'auto' ? (
                          <span className="text-[10px] text-zinc-500 font-mono">(Auto-checkpoint)</span>
                        ) : (
                          <span className="text-[10px] text-purple-400 font-mono font-semibold">
                            (Hito Manual)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCompare(snap)}
                          className="px-2.5 py-1 rounded-lg border border-[#30363d] hover:bg-[#21262d] text-zinc-300 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                          title="Comparar cambios con la versión actual"
                        >
                          <GitCompare className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Comparar Diff</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRestore(snap)}
                          className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
                          title="Revertir el proyecto activo a este estado"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restaurar Esta Versión</span>
                        </button>
                      </div>
                    </div>

                    {snap.notes && <p className="text-xs text-zinc-300 bg-[#0d1117] p-2.5 rounded-xl border border-[#21262d]">{snap.notes}</p>}

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-[#21262d]">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-zinc-500" />
                          {snap.authorName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-500" />
                          {formattedDate}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        <span>{snap.systemCapacityKWp.toFixed(2)} kWp</span>
                        <span>•</span>
                        <span>{snap.panelCount} módulos</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateSnapshotModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projectId={project.id}
      />
    </div>
  );
};
