import React, { useRef, useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import {
  Database,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  RotateCcw,
} from 'lucide-react';

export const BackupSection: React.FC = () => {
  const { projects, exportAllProjectsAsJSON, importProjectsFromJSON } = useSimulationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExportJSON = () => {
    try {
      exportAllProjectsAsJSON();
      setBackupMsg({ type: 'success', text: `¡Respaldo de ${projects.length} proyectos exportado con éxito!` });
      setTimeout(() => setBackupMsg(null), 3500);
    } catch {
      setBackupMsg({ type: 'error', text: 'Error al exportar los proyectos.' });
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const res = importProjectsFromJSON(parsed);
        if (res.success) {
          setBackupMsg({ type: 'success', text: `¡Proyectos importados con éxito! (${res.count} cargados)` });
        } else {
          setBackupMsg({ type: 'error', text: res.message || 'Formato de archivo inválido.' });
        }
      } catch {
        setBackupMsg({ type: 'error', text: 'Error al procesar el archivo JSON.' });
      }
      setTimeout(() => setBackupMsg(null), 4000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section id="sec-respaldo" className="flex flex-col gap-6 scroll-mt-6">
      <div>
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Respaldo & Exportación</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
          Exporta tu base de datos local en JSON, restaura copias de seguridad o gestiona el almacenamiento local.
        </p>
      </div>

      <div className="bg-white dark:bg-[#18181b] border border-slate-200/80 dark:border-[#27272a] rounded-2xl p-6 shadow-xs flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Exportar JSON */}
          <div className="p-5 rounded-xl border border-slate-200/80 dark:border-[#27272a] bg-slate-50/50 dark:bg-[#121214]/50 flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Exportar Todos los Proyectos</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Descarga un archivo JSON estructurado con los {projects.length} proyectos actuales.
                </p>
              </div>
            </div>
            <button
              onClick={handleExportJSON}
              className="w-full py-2 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Descargar Respaldo JSON</span>
            </button>
          </div>

          {/* Importar JSON */}
          <div className="p-5 rounded-xl border border-slate-200/80 dark:border-[#27272a] bg-slate-50/50 dark:bg-[#121214]/50 flex flex-col justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Importar Copia de Seguridad</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Restaura propuestas desde un archivo JSON local.
                </p>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFile}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-4 rounded-xl text-xs font-bold border border-slate-200 dark:border-[#27272a] hover:bg-slate-100 dark:hover:bg-[#27272a] text-slate-700 dark:text-zinc-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Seleccionar Archivo JSON</span>
            </button>
          </div>
        </div>

        {backupMsg && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              backupMsg.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-800'
            }`}
          >
            {backupMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{backupMsg.text}</span>
          </div>
        )}

        {/* Versión & Sistema */}
        <div className="pt-4 border-t border-slate-100 dark:border-[#27272a] flex flex-wrap items-center justify-between text-xs text-slate-400 dark:text-zinc-500">
          <span>SolarSim Pro v1.6.0 • Motor Financiero Auditado Ley 57-07</span>
          <span>Arquitectura Zustand Slices + PostgreSQL Sync</span>
        </div>
      </div>
    </section>
  );
};
