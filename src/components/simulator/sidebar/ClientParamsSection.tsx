import React from 'react';
import { ProjectSimulation, ClientInfo } from '../../../types';
import { RD_PROVINCES } from '../../../data/rdProvinces';
import { generateNextProjectSequence, findDuplicateProjectInfo } from '../../../store/useSimulationStore';
import { User, ChevronDown, Globe, Loader2, CheckCircle2, Lock, Unlock, AlertTriangle } from 'lucide-react';

interface ClientParamsSectionProps {
  project: ProjectSimulation;
  projects: ProjectSimulation[];
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  isIdUnlocked: boolean;
  setIsIdUnlocked: (val: boolean) => void;
  isFetchingSolar: boolean;
  solarApiStatus: string | null;
  onFetchSolarApi: () => void;
  updateClient: (client: Partial<ClientInfo>) => void;
}

export const ClientParamsSection: React.FC<ClientParamsSectionProps> = ({
  project,
  projects,
  isOpen,
  onToggle,
  isDark,
  isIdUnlocked,
  setIsIdUnlocked,
  isFetchingSolar,
  solarApiStatus,
  onFetchSolarApi,
  updateClient,
}) => {
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
          isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>1. Proyecto y Cliente</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`p-3.5 pt-2 space-y-3 border-t ${
            isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
          }`}
        >
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Nombre del Cliente
            </label>
            <input
              type="text"
              value={project.client.name}
              onChange={(e) => updateClient({ name: e.target.value })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:bg-[#202024] focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'
                  : 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Ubicación (Ciudad / Proyecto)
            </label>
            <input
              type="text"
              value={project.client.location}
              onChange={(e) => updateClient({ location: e.target.value })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:ring-1 focus:ring-emerald-500'
                  : 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-1 focus:ring-emerald-600'
              }`}
            />
          </div>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Dirección del Cliente
            </label>
            <input
              type="text"
              value={project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}
              onChange={(e) => updateClient({ address: e.target.value })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:ring-1 focus:ring-emerald-500'
                  : 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-1 focus:ring-emerald-600'
              }`}
            />
          </div>

          {/* Selector de Fuente de Radiación Solar: Provincia vs GPS Satelital */}
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Fuente de Radiación Solar
            </label>
            <div
              className={`flex rounded-lg p-1 border ${
                isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-200/80 border-slate-300/60'
              }`}
            >
              <button
                type="button"
                onClick={() => updateClient({ solarSourceMode: 'province' })}
                className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  (project.client.solarSourceMode || 'province') === 'province'
                    ? isDark
                      ? 'bg-[#27272a] shadow-xs text-emerald-400 font-bold'
                      : 'bg-white shadow-xs text-emerald-800 font-bold'
                    : isDark
                    ? 'text-zinc-400 hover:text-zinc-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">map</span> Provincia (Offline)
              </button>
              <button
                type="button"
                onClick={() => updateClient({ solarSourceMode: 'gps' })}
                className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  project.client.solarSourceMode === 'gps'
                    ? isDark
                      ? 'bg-[#27272a] shadow-xs text-emerald-400 font-bold'
                      : 'bg-white shadow-xs text-emerald-800 font-bold'
                    : isDark
                    ? 'text-zinc-400 hover:text-zinc-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> GPS Satelital (Online)
              </button>
            </div>
          </div>

          {/* Opción 1: Selección por Provincia */}
          {(project.client.solarSourceMode || 'province') === 'province' && (
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                Seleccionar Provincia
              </label>
              <select
                value={project.client.province}
                onChange={(e) => {
                  updateClient({
                    province: e.target.value,
                    customMonthlyHSP: undefined,
                  });
                }}
                className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                  isDark
                    ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:ring-1 focus:ring-emerald-500'
                    : 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-1 focus:ring-emerald-600'
                }`}
              >
                {RD_PROVINCES.map((prov) => (
                  <option key={prov.code} value={prov.name}>
                    {prov.name} ({prov.avgHSP} HSP)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Opción 2: Obtener por GPS / Coordenadas */}
          {project.client.solarSourceMode === 'gps' && (
            <div
              className={`space-y-2 p-3 rounded-lg border ${
                isDark ? 'bg-[#202024] border-emerald-900/60' : 'bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <label className={`block text-xs font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-900'}`}>
                Coordenadas GPS (Latitud, Longitud)
              </label>
              <input
                type="text"
                value={project.client.coordinates || '18.4861, -69.9312'}
                onChange={(e) => updateClient({ coordinates: e.target.value })}
                placeholder="18.4861, -69.9312"
                className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isDark
                    ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              />
              <button
                type="button"
                onClick={onFetchSolarApi}
                disabled={isFetchingSolar}
                className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                {isFetchingSolar ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Obteniendo de NASA...
                  </>
                ) : (
                  <>
                    <Globe className="w-3.5 h-3.5" /> Obtener Radiación Satelital Online
                  </>
                )}
              </button>
              {solarApiStatus && (
                <p
                  className={`text-[10px] font-medium mt-1 flex items-center gap-1 ${
                    isDark ? 'text-emerald-300' : 'text-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" /> {solarApiStatus}
                </p>
              )}
            </div>
          )}

          {/* ID del Proyecto & N° Cotización con Bloqueo/Auto y Validación */}
          {(() => {
            const duplicateCheck = findDuplicateProjectInfo(
              project.client.projectId,
              project.client.quoteNumber || '',
              project.id,
              projects
            );

            return (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <span>Código & Cotización</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                      isDark ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      Auto
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsIdUnlocked(!isIdUnlocked)}
                    className={`text-[11px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                      isIdUnlocked
                        ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                        : isDark
                        ? 'border-[#3f3f46] text-zinc-400 hover:text-zinc-200 bg-[#24242e]'
                        : 'border-slate-300 text-slate-600 hover:text-slate-900 bg-slate-100'
                    }`}
                    title={isIdUnlocked ? 'Bloquear identificadores automáticos' : 'Desbloquear para editar manualmente el ID o cotización'}
                  >
                    {isIdUnlocked ? <Unlock className="w-3 h-3 text-amber-400" /> : <Lock className="w-3 h-3" />}
                    <span>{isIdUnlocked ? 'Editable' : 'Bloqueado'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                      ID del Proyecto
                    </label>
                    <input
                      type="text"
                      value={project.client.projectId}
                      disabled={!isIdUnlocked}
                      onChange={(e) => updateClient({ projectId: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-1.5 text-xs font-mono font-bold transition-all ${
                        !isIdUnlocked
                          ? 'opacity-80 cursor-not-allowed ' + (isDark ? 'bg-[#18181f] border-[#2f2f3c] text-emerald-400' : 'bg-slate-100 border-slate-200 text-emerald-800')
                          : duplicateCheck.isProjectIdDuplicate
                          ? 'border-red-500 bg-red-500/10 text-red-300 ring-1 ring-red-500'
                          : isDark
                          ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:border-emerald-500'
                          : 'bg-white border-slate-300 text-slate-800 focus:border-emerald-600'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                      N° Cotización
                    </label>
                    <input
                      type="text"
                      value={project.client.quoteNumber || 'C-0030'}
                      disabled={!isIdUnlocked}
                      onChange={(e) => updateClient({ quoteNumber: e.target.value })}
                      className={`w-full border rounded-lg px-3 py-1.5 text-xs font-mono font-bold transition-all ${
                        !isIdUnlocked
                          ? 'opacity-80 cursor-not-allowed ' + (isDark ? 'bg-[#18181f] border-[#2f2f3c] text-emerald-400' : 'bg-slate-100 border-slate-200 text-emerald-800')
                          : duplicateCheck.isQuoteDuplicate
                          ? 'border-red-500 bg-red-500/10 text-red-300 ring-1 ring-red-500'
                          : isDark
                          ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100 focus:border-emerald-500'
                          : 'bg-white border-slate-300 text-slate-800 focus:border-emerald-600'
                      }`}
                    />
                  </div>
                </div>

                {/* Warning if Duplicate */}
                {(duplicateCheck.isProjectIdDuplicate || duplicateCheck.isQuoteDuplicate) && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2 text-red-400 text-[11px] animate-in fade-in">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span>
                        {duplicateCheck.isProjectIdDuplicate && duplicateCheck.isQuoteDuplicate
                          ? `Este ID y cotización ya pertenecen a "${duplicateCheck.duplicateProjectName}".`
                          : duplicateCheck.isProjectIdDuplicate
                          ? `El ID "${project.client.projectId}" ya está registrado en "${duplicateCheck.duplicateProjectName}".`
                          : `La cotización "${project.client.quoteNumber}" ya está en uso por "${duplicateCheck.duplicateProjectName}".`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextSeq = generateNextProjectSequence(projects);
                          updateClient({
                            projectId: nextSeq.projectId,
                            quoteNumber: nextSeq.quoteNumber,
                          });
                        }}
                        className="block text-emerald-400 hover:text-emerald-300 underline font-bold mt-1 cursor-pointer"
                      >
                        🪄 Asignar siguiente código libre automáticamente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
