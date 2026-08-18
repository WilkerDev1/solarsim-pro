import React, { useState, useEffect } from 'react';
import { useSimulationStore, generateNextProjectSequence, findDuplicateProjectInfo } from '../../store/useSimulationStore';
import { RD_PROVINCES } from '../../data/rdProvinces';
import { fetchSolarRadiationByCoordinates } from '../../services/solarRadiationApi';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Check,
  Package,
  FileText,
  Save,
  Clock,
  Sparkles,
  ChevronDown,
  User,
  Receipt,
  Sun,
  DollarSign,
  Landmark,
  Lock,
  Unlock,
  AlertTriangle,
  Hash,
} from 'lucide-react';

export const SimulatorView: React.FC = () => {
  const {
    projects,
    getActiveProject,
    getFinancialSummary,
    updateClient,
    updateSpecs,
    updateRates,
    updateFinancials,
    updateMonthlyConsumption,
    saveActiveProject,
    openAIInvoiceModal,
    sidebarTheme,
    sidebarWidth,
    setSidebarWidth,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const [isDragging, setIsDragging] = useState(false);
  const [isIdUnlocked, setIsIdUnlocked] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = Math.max(280, Math.min(650, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, setSidebarWidth]);

  const project = getActiveProject();
  const summary = getFinancialSummary();

  const [activeMainTab, setActiveMainTab] = useState<'energia' | 'cotizacion' | 'retorno'>('energia');
  const [isFetchingSolar, setIsFetchingSolar] = useState<boolean>(false);
  const [solarApiStatus, setSolarApiStatus] = useState<string | null>(null);

  // Accordion state for sidebar parameter categories (default: all collapsed)
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    client: false,
    rates: false,
    equipment: false,
    costs: false,
    financials: false,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const allSectionsOpen = Object.values(openSections).every(Boolean);
  const toggleAllSections = () => {
    const nextState = !allSectionsOpen;
    setOpenSections({
      client: nextState,
      rates: nextState,
      equipment: nextState,
      costs: nextState,
      financials: nextState,
    });
  };

  // Auto-calculate panels logic when autoCalculatePanels is ON
  useEffect(() => {
    if (project.specs.autoCalculatePanels) {
      const annualConsumption = project.monthlyConsumption.reduce((a, b) => a + b, 0);
      const targetCoverage = project.rates.targetCoveragePct || 95;
      const targetAnnualKWh = annualConsumption * (targetCoverage / 100);
      
      const provinceObj = RD_PROVINCES.find(p => p.name === project.client.province) || RD_PROVINCES[0];
      const avgHsp = provinceObj.avgHSP || 4.91;
      const annualOutputPerWatt = avgHsp * 365 * (1 - (project.specs.systemLosses / 100));
      const neededTotalW = targetAnnualKWh / (annualOutputPerWatt / 1000);
      const calculatedPanels = Math.max(1, Math.ceil(neededTotalW / (project.specs.panelPowerW || 450)));

      if (calculatedPanels !== project.specs.panelCount) {
        updateSpecs({ panelCount: calculatedPanels });
      }
    }
  }, [
    project.specs.autoCalculatePanels,
    project.specs.panelPowerW,
    project.specs.systemLosses,
    project.rates.targetCoveragePct,
    project.client.province,
    project.monthlyConsumption,
  ]);

  // Handler to fetch real-time solar radiation from GPS coordinates via API
  const handleFetchSolarApi = async () => {
    const coords = project.client.coordinates || '18.4861, -69.9312';
    const parts = coords.split(',').map((s) => parseFloat(s.trim()));
    
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      setSolarApiStatus('Error: Ingresa coordenadas válidas ej: 18.4861, -69.9312');
      return;
    }

    setIsFetchingSolar(true);
    setSolarApiStatus(null);

    const res = await fetchSolarRadiationByCoordinates(parts[0], parts[1]);
    setIsFetchingSolar(false);

    if (res.success) {
      setSolarApiStatus(` Radiación solar obtenida vía API NASA/GPS (${res.avgHSP} kWh/m²/día promedio)`);
      updateClient({ customMonthlyHSP: res.monthlyHSP });
    } else {
      setSolarApiStatus(`⚠️ ${res.error}`);
    }
  };

  // Averages for Resumen de Ahorro Anual table
  const cf25 = summary.cashFlow25Years;
  const year1Savings = cf25[0]?.savingsUSD || 0;
  const avg5Savings = cf25.slice(0, 5).reduce((s, c) => s + c.savingsUSD, 0) / 5;
  const avg10Savings = cf25.slice(0, 10).reduce((s, c) => s + c.savingsUSD, 0) / 10;
  const avg25Savings = cf25.reduce((s, c) => s + c.savingsUSD, 0) / 25;

  const year1Tax = cf25[0]?.taxCreditUSD || 0;
  const avg5Tax = cf25.slice(0, 5).reduce((s, c) => s + c.taxCreditUSD, 0) / 5;
  const avg10Tax = cf25.slice(0, 10).reduce((s, c) => s + c.taxCreditUSD, 0) / 10;
  const avg25Tax = cf25.reduce((s, c) => s + c.taxCreditUSD, 0) / 25;

  // Prepare data for Beneficio Acumulado chart (including Year 0)
  const cumulativeChartData = [
    { yearLabel: '0', year: 0, cumulative: -summary.grossInvestmentUSD },
    ...cf25.map((c) => ({
      yearLabel: `${c.year}`,
      year: c.year,
      cumulative: c.cumulativeCashFlowUSD,
    })),
  ];

  // Totals for monthly energy table
  const totalConsumptionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.consumptionKWh, 0);
  const totalProductionKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.productionKWh, 0);
  const totalSavingsKWh = summary.monthlyBreakdown.reduce((sum, m) => sum + m.solarSelfConsumedKWh, 0);
  const avgCoveragePct = summary.energyCoveragePct;

  const currentDateStr = new Date().toLocaleDateString('es-DO', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex-1 flex overflow-hidden w-full h-full min-h-0 bg-slate-100 font-sans">
      {/* Left Sidebar: Parameters (Modo Oscuro Neutral / Claro dinámico) */}
      <aside
        style={{ width: `${sidebarWidth || 350}px` }}
        className={`flex flex-col shrink-0 h-full overflow-y-auto z-10 transition-[background-color,border-color,color] duration-200 ${
          isDark
            ? 'bg-[#18181b] border-r border-[#27272a] text-zinc-100 shadow-xl'
            : 'bg-white border-r border-slate-200 text-slate-800 shadow-sm'
        }`}
      >
        <div
          className={`p-4 border-b flex justify-between items-center transition-colors ${
            isDark ? 'border-[#27272a] bg-[#121214]' : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div>
            <h2 className={`font-bold text-sm uppercase tracking-wider ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
              Parámetros
            </h2>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Configurar restricciones del sistema
            </p>
          </div>
          <button
            onClick={saveActiveProject}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 ${
              isDark
                ? 'border-emerald-700/80 bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300'
                : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
            }`}
            title="Guardar cambios de la simulación"
          >
            <Save className="w-3.5 h-3.5 text-emerald-500" />
            <span>Guardar</span>
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Barra de control rápido: Expandir / Colapsar Todo */}
          <div className="flex justify-between items-center px-1 pb-0.5">
            <span className={`text-[11px] font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Categorías de Configuración
            </span>
            <button
              type="button"
              onClick={toggleAllSections}
              className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                isDark ? 'text-emerald-400 hover:bg-[#27272a]' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {allSectionsOpen ? 'Colapsar Todo' : 'Expandir Todo'}
            </button>
          </div>

          {/* 1. SECCIÓN: Proyecto y Cliente */}
          <div
            className={`rounded-xl border overflow-hidden transition-all ${
              isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection('client')}
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
                  openSections.client ? 'rotate-180 text-emerald-500' : ''
                }`}
              />
            </button>

            {openSections.client && (
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
                      onClick={handleFetchSolarApi}
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

          {/* 2. SECCIÓN: Tarifas y Distribuidora */}
          <div
            className={`rounded-xl border overflow-hidden transition-all ${
              isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection('rates')}
              className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
                isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>2. Tarifas y Distribuidora</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                  openSections.rates ? 'rotate-180 text-emerald-500' : ''
                }`}
              />
            </button>

            {openSections.rates && (
              <div
                className={`p-3.5 pt-2 space-y-3 border-t ${
                  isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
                }`}
              >
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Precio por kWh ($ USD)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={project.rates.energyCostPerKWh}
                    onChange={(e) => updateRates({ energyCostPerKWh: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Empresa Distribuidora
                  </label>
                  <select
                    value={project.rates.distributor || 'EDESUR'}
                    onChange={(e) => updateRates({ distributor: e.target.value as any })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  >
                    <option value="EDEESTE">EDEESTE</option>
                    <option value="EDESUR">EDESUR</option>
                    <option value="EDENORTE">EDENORTE</option>
                    <option value="CEPM">CEPM</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Cobertura Objetivo (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={project.rates.targetCoveragePct ?? 95}
                    onChange={(e) => updateRates({ targetCoveragePct: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Tipo de Tarifa
                  </label>
                  <select
                    value={project.rates.tariffCode || 'BTS2'}
                    onChange={(e) => updateRates({ tariffCode: e.target.value as any })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  >
                    <option value="BTS1">BTS1 (Residencial Monómica &lt;10kW)</option>
                    <option value="BTS2">BTS2 (Comercial Simple Monómica &lt;10kW)</option>
                    <option value="BTD">BTD (Baja Tensión con Demanda &gt;10kW)</option>
                    <option value="MTD">MTD (Media Tensión con Demanda)</option>
                  </select>
                </div>

                {/* Casilla Inyección Cero / Antivertido (Zero-Export) */}
                <div
                  className={`flex items-center justify-between p-2.5 rounded-lg border ${
                    isDark ? 'bg-amber-950/30 border-amber-800/50' : 'bg-amber-50/60 border-amber-200'
                  }`}
                >
                  <div className="pr-2">
                    <span className={`text-xs font-bold block ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                      Inyección Cero / Antivertido (Zero-Export)
                    </span>
                    <span className={`text-[10px] block leading-tight ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Limita la generación al consumo local, evitando inyección a la red y anulando cargos de exportación.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!project.rates.isZeroExport}
                    onChange={(e) => updateRates({ isZeroExport: e.target.checked })}
                    className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer h-4 w-4 shrink-0"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className={`block text-xs font-medium ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                      Cargo Exportación Red (%) (SIE-007-2026-REG)
                    </label>
                    {(!project.rates.tariffCode || project.rates.tariffCode === 'BTS1' || project.rates.tariffCode === 'BTS2') && !project.rates.isZeroExport ? (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isDark ? 'bg-amber-950/70 text-amber-300 border border-amber-800/50' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                        Monómica (~25%)
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isDark ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                        0% (Exento / 1:1)
                      </span>
                    )}
                  </div>

                  <input
                    type="number"
                    step="1"
                    disabled={project.rates.isZeroExport || (project.rates.tariffCode !== 'BTS1' && project.rates.tariffCode !== 'BTS2' && project.rates.tariffCode !== undefined)}
                    value={
                      project.rates.isZeroExport || (project.rates.tariffCode !== 'BTS1' && project.rates.tariffCode !== 'BTS2' && project.rates.tariffCode !== undefined)
                        ? 0
                        : project.rates.gridExportFeePct
                    }
                    onChange={(e) => updateRates({ gridExportFeePct: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />

                  {/* Nota explicativa regulatoria debajo del parámetro */}
                  <div className="mt-1.5">
                    {project.rates.isZeroExport ? (
                      <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                        <span>⚡</span>
                        <span>
                          <strong>Inyección Cero activa:</strong> El sistema no vuelca excedentes a la red pública; por lo tanto, no aplica cargo de uso de red.
                        </span>
                      </p>
                    ) : (project.rates.tariffCode === 'BTD' || project.rates.tariffCode === 'MTD') ? (
                      <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        <span>⚡</span>
                        <span>
                          <strong>Tarifa Binómica ({project.rates.tariffCode}):</strong> Compensación 1:1 de energía neta. No aplica cargo por exportación ya que la red se cubre mediante el cargo fijo por potencia/demanda.
                        </span>
                      </p>
                    ) : (
                      <p className={`text-[10.5px] leading-tight flex items-start gap-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        <span>⚡</span>
                        <span>
                          <strong>Tarifa Monómica ({project.rates.tariffCode || 'BTS2'}):</strong> Aplica retención por derecho de uso de red bajo Res. SIE-007-2026-REG sobre los kWh excedentes exportados a la red.
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. SECCIÓN: Equipamiento y Sistema */}
          <div
            className={`rounded-xl border overflow-hidden transition-all ${
              isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection('equipment')}
              className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
                isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>3. Equipamiento y Sistema</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                  openSections.equipment ? 'rotate-180 text-emerald-500' : ''
                }`}
              />
            </button>

            {openSections.equipment && (
              <div
                className={`p-3.5 pt-2 space-y-3 border-t ${
                  isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
                }`}
              >
                {/* Selector de modo Simple / Detallado */}
                <div
                  className={`flex rounded-lg p-1 mb-2 border ${
                    isDark ? 'bg-[#121214] border-[#27272a]' : 'bg-slate-200/80 border-slate-300/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateSpecs({ isDetailed: false })}
                    className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center cursor-pointer ${
                      !project.specs.isDetailed
                        ? isDark
                          ? 'bg-[#27272a] shadow-xs text-white font-bold'
                          : 'bg-white shadow-xs text-slate-900 font-bold'
                        : isDark
                        ? 'text-zinc-400 hover:text-zinc-200 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSpecs({ isDetailed: true })}
                    className={`flex-1 rounded-md py-1.5 text-[12px] transition-all text-center cursor-pointer ${
                      project.specs.isDetailed
                        ? isDark
                          ? 'bg-[#27272a] shadow-xs text-white font-bold'
                          : 'bg-white shadow-xs text-slate-900 font-bold'
                        : isDark
                        ? 'text-zinc-400 hover:text-zinc-200 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 font-semibold'
                    }`}
                  >
                    Detallado
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Modelo / Marca Módulos
                  </label>
                  <input
                    type="text"
                    value={project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}
                    onChange={(e) => updateSpecs({ panelBrandModel: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Potencia del Panel (W)
                  </label>
                  <input
                    type="number"
                    step="5"
                    value={project.specs.panelPowerW}
                    onChange={(e) => updateSpecs({ panelPowerW: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                {/* Toggle Auto-Calcular Paneles */}
                <div
                  className={`flex items-center justify-between p-2.5 rounded-lg border ${
                    isDark ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-emerald-50/60 border-emerald-200/80'
                  }`}
                >
                  <span className={`text-xs font-semibold ${isDark ? 'text-emerald-300' : 'text-emerald-950'}`}>
                    Auto-Calcular Paneles
                  </span>
                  <input
                    type="checkbox"
                    checked={!!project.specs.autoCalculatePanels}
                    onChange={(e) => updateSpecs({ autoCalculatePanels: e.target.checked })}
                    className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Cantidad de Paneles
                  </label>
                  <input
                    type="number"
                    step="1"
                    disabled={project.specs.autoCalculatePanels}
                    value={project.specs.panelCount}
                    onChange={(e) => updateSpecs({ panelCount: parseInt(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Modelo / Marca Inversor
                  </label>
                  <input
                    type="text"
                    value={project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
                    onChange={(e) => updateSpecs({ inverterBrandModel: e.target.value })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>

                {/* CAMPOS MODO DETALLADO */}
                {project.specs.isDetailed && (
                  <div
                    className={`space-y-3 p-3 rounded-lg border mt-3 ${
                      isDark ? 'bg-[#202024] border-[#2e2e34]' : 'bg-emerald-50/50 border-emerald-200'
                    }`}
                  >
                    <h4
                      className={`text-[11px] font-bold uppercase tracking-wider border-b pb-1 flex items-center gap-1.5 ${
                        isDark ? 'text-emerald-400 border-[#2e2e34]' : 'text-emerald-900 border-emerald-200'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">tune</span> Parámetros Técnicos Avanzados
                    </h4>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Potencia Inversor (kW)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={project.specs.inverterPowerKW}
                          onChange={(e) => updateSpecs({ inverterPowerKW: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Cantidad Inversores
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={project.specs.inverterCount || 1}
                          onChange={(e) => updateSpecs({ inverterCount: parseInt(e.target.value) || 1 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-bold ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Eficiencia Panel (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={project.specs.panelEfficiency}
                          onChange={(e) => updateSpecs({ panelEfficiency: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Coef. Temp (%/°C)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={project.specs.tempCoeff}
                          onChange={(e) => updateSpecs({ tempCoeff: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Pérdidas Sistema (%)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={project.specs.systemLosses}
                          onChange={(e) => updateSpecs({ systemLosses: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                          Degradación Anual (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={project.specs.annualDegradation}
                          onChange={(e) => updateSpecs({ annualDegradation: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Almacenamiento (Batería) Toggle & Campos */}
                <div className={`pt-2 border-t space-y-3 ${isDark ? 'border-[#27272a]' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-semibold ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}>
                      Almacenamiento (Batería)
                    </label>
                    <input
                      type="checkbox"
                      checked={project.specs.hasBattery}
                      onChange={(e) => updateSpecs({ hasBattery: e.target.checked })}
                      className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                    />
                  </div>

                  {project.specs.hasBattery && (
                    <div
                      className={`space-y-3 p-3 rounded-lg border ${
                        isDark ? 'bg-[#202024] border-[#2e2e34]' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                          Modelo / Marca Batería
                        </label>
                        <input
                          type="text"
                          value={project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}
                          onChange={(e) => updateSpecs({ batteryBrandModel: e.target.value })}
                          className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                          Cantidad de Baterías
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={project.specs.batteryCount || 1}
                          onChange={(e) => updateSpecs({ batteryCount: parseInt(e.target.value) || 1 })}
                          className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                          Precio Unitario Batería (USD)
                        </label>
                        <input
                          type="number"
                          step="50"
                          value={project.specs.batteryUnitPriceUSD !== undefined ? project.specs.batteryUnitPriceUSD : 1990.0}
                          onChange={(e) => updateSpecs({ batteryUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-amber-300' : 'bg-white border-slate-300 text-emerald-800'
                          }`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                          Capacidad Total Batería (kWh)
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={project.specs.batteryCapacityKWh}
                          onChange={(e) => updateSpecs({ batteryCapacityKWh: parseFloat(e.target.value) || 0 })}
                          className={`w-full border rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                            isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        />
                      </div>

                      {/* Parámetros Detallados de Batería */}
                      <div className={`pt-2 border-t space-y-2 ${isDark ? 'border-[#2e2e34]' : 'border-slate-200'}`}>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                              DoD Descarga (%)
                            </label>
                            <input
                              type="number"
                              step="5"
                              value={project.specs.batteryDOD || 80}
                              onChange={(e) => updateSpecs({ batteryDOD: parseFloat(e.target.value) || 80 })}
                              className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold ${
                                isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                              }`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                              Eficiencia Carga (%)
                            </label>
                            <input
                              type="number"
                              step="1"
                              value={project.specs.batteryEfficiencyPct || 92}
                              onChange={(e) => updateSpecs({ batteryEfficiencyPct: parseFloat(e.target.value) || 92 })}
                              className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold ${
                                isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                              }`}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-[10px] font-semibold mb-0.5 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                            Costo Reemplazo Año 10 (USD)
                          </label>
                          <input
                            type="number"
                            step="500"
                            value={project.specs.batteryReplacementCostUSD || 0}
                            onChange={(e) => updateSpecs({ batteryReplacementCostUSD: parseFloat(e.target.value) || 0 })}
                            placeholder="Ej. $3,500 USD"
                            className={`w-full border rounded-lg px-2 py-1 text-xs font-semibold ${
                              isDark ? 'bg-[#18181b] border-[#3f3f46] text-zinc-100' : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                        </div>

                        <div
                          className={`rounded-lg p-2 text-[10px] font-bold space-y-0.5 mt-1 border ${
                            isDark
                              ? 'bg-emerald-950/80 border-emerald-800/80 text-emerald-300'
                              : 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                          }`}
                        >
                          <div className="flex justify-between">
                            <span>Energía Útil Batería:</span>
                            <span className={`font-extrabold ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>
                              {summary.batteryUsableKWh} kWh
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Autonomía Anti-Apagones:</span>
                            <span className={`font-extrabold ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>
                              ~{summary.batteryBackupAutonomyHours} Horas
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 4. SECCIÓN: Costos y Margen de Venta */}
          <div
            className={`rounded-xl border overflow-hidden transition-all ${
              isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection('costs')}
              className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
                isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>4. Costos y Margen de Venta</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                  openSections.costs ? 'rotate-180 text-emerald-500' : ''
                }`}
              />
            </button>

            {openSections.costs && (
              <div
                className={`p-3.5 pt-2 space-y-3 border-t ${
                  isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
                }`}
              >
                <div
                  className={`space-y-3 p-3 rounded-lg border ${
                    isDark ? 'bg-[#27201c] border-amber-900/40' : 'bg-amber-50/50 border-amber-200'
                  }`}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-amber-400' : 'text-red-700'}`}>
                        Tasa Cambio DOP/USD
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={project.specs.dopExchangeRate !== undefined ? project.specs.dopExchangeRate : 60.0}
                        onChange={(e) => updateSpecs({ dopExchangeRate: parseFloat(e.target.value) || 0 })}
                        className={`w-full border rounded-lg px-2.5 py-1 text-xs font-extrabold transition-all ${
                          isDark
                            ? 'bg-[#18181b] border-amber-800/60 text-amber-300 focus:ring-1 focus:ring-amber-500'
                            : 'bg-white border-red-300 text-red-700 focus:ring-1 focus:ring-red-600'
                        }`}
                      />
                    </div>

                    <div>
                      <label className={`block text-[11px] font-bold mb-1 ${isDark ? 'text-amber-400' : 'text-red-700'}`}>
                        Factor / Margen Venta
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={project.specs.saleMarginMultiplier !== undefined ? project.specs.saleMarginMultiplier : 1.25}
                        onChange={(e) => updateSpecs({ saleMarginMultiplier: parseFloat(e.target.value) || 0 })}
                        className={`w-full border rounded-lg px-2.5 py-1 text-xs font-extrabold transition-all ${
                          isDark
                            ? 'bg-[#18181b] border-amber-800/60 text-amber-300 focus:ring-1 focus:ring-amber-500'
                            : 'bg-white border-red-300 text-red-700 focus:ring-1 focus:ring-red-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Precio Unit. Panel (USD)
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={project.specs.panelUnitPriceUSD !== undefined ? project.specs.panelUnitPriceUSD : 103.32}
                      onChange={(e) => updateSpecs({ panelUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        isDark
                          ? 'bg-[#18181b] border-[#3f3f46] text-amber-300'
                          : 'bg-white border-slate-300 text-red-600'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Precio Unit. Inversor (USD)
                    </label>
                    <input
                      type="number"
                      step="10"
                      value={project.specs.inverterUnitPriceUSD !== undefined ? project.specs.inverterUnitPriceUSD : 2300.0}
                      onChange={(e) => updateSpecs({ inverterUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        isDark
                          ? 'bg-[#18181b] border-[#3f3f46] text-amber-300'
                          : 'bg-white border-slate-300 text-red-600'
                      }`}
                    />
                  </div>

                  {project.specs.hasBattery && (
                    <div>
                      <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                        Precio Unit. Batería (USD)
                      </label>
                      <input
                        type="number"
                        step="10"
                        value={project.specs.batteryUnitPriceUSD !== undefined ? project.specs.batteryUnitPriceUSD : 1990.0}
                        onChange={(e) => updateSpecs({ batteryUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                        className={`w-full border rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                          isDark
                            ? 'bg-[#18181b] border-[#3f3f46] text-amber-300'
                            : 'bg-white border-slate-300 text-red-600'
                        }`}
                      />
                    </div>
                  )}

                  <div>
                    <label className={`block text-[11px] font-semibold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                      Mano de Obra / kWp (USD)
                    </label>
                    <input
                      type="number"
                      step="5"
                      value={project.specs.installationUnitPriceUSD !== undefined ? project.specs.installationUnitPriceUSD : 170.0}
                      onChange={(e) => updateSpecs({ installationUnitPriceUSD: parseFloat(e.target.value) || 0 })}
                      className={`w-full border rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        isDark
                          ? 'bg-[#18181b] border-[#3f3f46] text-amber-300'
                          : 'bg-white border-slate-300 text-red-600'
                      }`}
                    />
                  </div>

                  {/* Precio Sistema por Vatio (USD/Wp) con cálculo automático y sincronización */}
                  <div className={`p-2.5 rounded-lg border mt-2 ${isDark ? 'bg-[#1c1917] border-amber-900/50' : 'bg-white border-amber-300/80 shadow-xs'}`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className={`block text-[11px] font-bold ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>
                        Precio Sistema por Vatio (USD/Wp)
                      </label>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60' : 'bg-amber-100 text-amber-900 border border-amber-200'}`} title="Precio por Watt resultante de la suma de equipos, mano de obra e ITBIS con margen">
                        Margen: ${(summary.costMatrix.salePricePerWattUSD || 1.13).toFixed(2)} Wp
                      </span>
                    </div>
                    
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="number"
                        step="0.01"
                        value={project.specs.pricePerWattUSD}
                        onChange={(e) => updateSpecs({ pricePerWattUSD: parseFloat(e.target.value) || 0 })}
                        className={`flex-1 border rounded-lg px-2.5 py-1 text-xs font-black transition-all ${
                          isDark
                            ? 'bg-[#121214] border-[#3f3f46] text-zinc-100 focus:ring-1 focus:ring-amber-500'
                            : 'bg-slate-50 border-slate-300 text-slate-900 focus:ring-1 focus:ring-amber-600'
                        }`}
                      />
                      <button
                        type="button"
                        title="Sincronizar automáticamente con el precio por Watt calculado de la matriz de costos y margen de venta"
                        onClick={() => {
                          const autoWp = Math.round((summary.costMatrix.salePricePerWattUSD || 1.13) * 100) / 100;
                          updateSpecs({ pricePerWattUSD: autoWp });
                        }}
                        className={`px-2.5 py-1 text-[11px] rounded-lg font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                          isDark
                            ? 'bg-amber-900/40 hover:bg-amber-900/60 border-amber-700/60 text-amber-300'
                            : 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900 shadow-xs'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">auto_fix_high</span> Auto
                      </button>
                    </div>
                    <p className={`text-[10px] mt-1.5 leading-tight ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Resultante de equipos + mano de obra × margen ({project.specs.saleMarginMultiplier || 1.25}x).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. SECCIÓN: Finanzas e Incentivos */}
          <div
            className={`rounded-xl border overflow-hidden transition-all ${
              isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleSection('financials')}
              className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
                isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>5. Finanzas e Incentivos (Ley 57-07)</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                  openSections.financials ? 'rotate-180 text-emerald-500' : ''
                }`}
              />
            </button>

            {openSections.financials && (
              <div
                className={`p-3.5 pt-2 space-y-3 border-t ${
                  isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
                }`}
              >
                <label className="flex items-center justify-between cursor-pointer group">
                  <span
                    className={`text-xs font-medium transition-colors ${
                      isDark ? 'text-zinc-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'
                    }`}
                  >
                    Aplicar Ley 57-07 (Crédito ISR 40%)
                  </span>
                  <input
                    type="checkbox"
                    checked={project.financials.applyLey5707}
                    onChange={(e) => updateFinancials({ applyLey5707: e.target.checked })}
                    className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer group">
                  <span
                    className={`text-xs font-medium transition-colors ${
                      isDark ? 'text-zinc-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'
                    }`}
                  >
                    Exoneración ITBIS 100% (18%)
                  </span>
                  <input
                    type="checkbox"
                    checked={project.financials.applyITBISExemption}
                    onChange={(e) => updateFinancials({ applyITBISExemption: e.target.checked })}
                    className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                  />
                </label>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                    Tasa de Descuento (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={project.financials.discountRatePct}
                    onChange={(e) => updateFinancials({ discountRatePct: parseFloat(e.target.value) || 0 })}
                    className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      isDark
                        ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                        : 'bg-slate-50 border-slate-300 text-slate-800'
                    }`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className={`mt-auto p-4 border-t transition-colors ${
            isDark ? 'border-[#27272a] bg-[#121214]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <button
            onClick={() => {
              useSimulationStore.setState({ activeProjectId: project.id });
            }}
            className={`w-full border transition-colors py-2 rounded-lg text-xs flex items-center justify-center gap-2 font-semibold shadow-xs cursor-pointer ${
              isDark
                ? 'bg-[#18181b] border-[#27272a] text-emerald-400 hover:bg-[#27272a]'
                : 'bg-white border-emerald-600 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Actualizar Simulación
          </button>
        </div>
      </aside>

      {/* Vertical Drag Handle for Sidebar Resizing */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1.5 hover:w-2 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-all z-20 relative group select-none ${
          isDragging ? 'bg-emerald-500 w-2' : isDark ? 'bg-[#27272a]' : 'bg-slate-200'
        }`}
        title="Arrastra para cambiar el ancho de la barra de parámetros"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize" />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-slate-100">
        {/* Top Fixed View Selector Tabs (SIN problemas de superposición ni salto al scrolear) */}
        <div className="bg-white border-b border-slate-200 px-6 pt-3 pb-0 shrink-0 z-20 shadow-xs flex justify-between items-center">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveMainTab('energia')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'energia'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Análisis de Energía
            </button>

            <button
              onClick={() => setActiveMainTab('cotizacion')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'cotizacion'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cotización y Equipos
            </button>

            <button
              onClick={() => setActiveMainTab('retorno')}
              className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
                activeMainTab === 'retorno'
                  ? 'text-emerald-800 font-extrabold border-b-2 border-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Retorno de Inversión
            </button>
          </div>

          <div className="pb-3 text-xs text-slate-500 flex items-center gap-2 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Simulador Interactivo Pro</span>
          </div>
        </div>

        {/* Scrollable Container for Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6 gap-6 flex flex-col min-h-0">
          {/* ---------------------------------------------------- */}
          {/* VISTA 1: ANÁLISIS DE ENERGÍA */}
          {/* ---------------------------------------------------- */}
          {activeMainTab === 'energia' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
                {/* Card 1: CAPACIDAD INSTALADA */}
                <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    CAPACIDAD INSTALADA
                  </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-800">{summary.systemCapacityKWp}</span>
                  <span className="text-xs text-slate-500 font-semibold">kWp</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
                </span>
              </div>

              {/* Card 2: GENERACIÓN ANUAL */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  GENERACIÓN ANUAL
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-slate-900">{summary.annualProductionKWh.toLocaleString()}</span>
                  <span className="text-xs text-slate-500 font-semibold">kWh</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 block mt-0.5">
                  {summary.energyCoveragePct}% Cobertura Solar
                </span>
              </div>

              {/* Card 3: CONSUMO ANUAL */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  CONSUMO ANUAL
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-slate-900">{summary.annualConsumptionKWh.toLocaleString()}</span>
                  <span className="text-xs text-slate-500 font-semibold">kWh</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  Prom: {Math.round(summary.annualConsumptionKWh / 12).toLocaleString()} kWh/mes
                </span>
              </div>

              {/* Card 4: AHORRO ENERGÉTICO ANUAL */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  AHORRO ENERGÉTICO ANUAL
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-700">${summary.year1SavingsUSD.toLocaleString()}</span>
                  <span className="text-xs text-slate-500 font-semibold">USD</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                  Autoconsumo solar en factura
                </span>
              </div>

              {/* Card 5: IMPACTO AMBIENTAL */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  IMPACTO AMBIENTAL
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-800">-{summary.co2AvoidedTonsPerYear}</span>
                  <span className="text-xs text-slate-500 font-semibold">Tons CO₂</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                  🌱 Reducción CO₂ por año
                </span>
              </div>
            </div>

            {/* GRÁFICA DE ENERGÍA */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 shrink-0">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Evolución Mensual de Energía
                </h3>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#14532d]"></span>
                    <span className="text-slate-700">Consumo (kWh)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#22c55e]"></span>
                    <span className="text-slate-700">Producción Solar (kWh)</span>
                  </div>
                </div>
              </div>

              <div className="h-[320px] min-h-[320px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthlyBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b', fontWeight: 'bold' }} />
                    <Tooltip formatter={(val: number) => [`${Math.round(val).toLocaleString()} kWh`, '']} />
                    <Bar dataKey="consumptionKWh" name="Consumo" fill="#14532d" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="productionKWh" name="Producción" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TABLA DE DETALLE MENSUAL EDITABLE */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
              <div className="bg-[#14532d] text-white px-4 py-2.5 font-bold text-xs uppercase tracking-wider flex justify-between items-center">
                <span>Resumen Mensual de Energía</span>
                <button
                  onClick={openAIInvoiceModal}
                  className="bg-white/10 hover:bg-white/20 border border-white/30 text-amber-300 hover:text-amber-200 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                  title="Escanear factura eléctrica EDE con IA para autocompletar consumo y cliente"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-amber-300" />
                  <span>Autocompletar con Factura EDE (IA)</span>
                </button>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">MES</th>
                    <th className="py-2.5 px-4 text-center">CONSUMO KWH/MES</th>
                    <th className="py-2.5 px-4 text-right">PRODUCCIÓN KWH/MES</th>
                    <th className="py-2.5 px-4 text-right">AHORRO ENERG. (KWH)</th>
                    <th className="py-2.5 px-4 text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  {summary.monthlyBreakdown.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-bold text-slate-800">{row.month}</td>
                      <td className="py-2 px-4 text-center">
                        <input
                          type="number"
                          value={project.monthlyConsumption[idx]}
                          onChange={(e) => updateMonthlyConsumption(idx, parseFloat(e.target.value) || 0)}
                          className="w-24 text-center bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:bg-white focus:border-emerald-600 transition-all"
                        />
                      </td>
                      <td className="py-2 px-4 text-right font-semibold">{row.productionKWh.toFixed(1)}</td>
                      <td className="py-2 px-4 text-right font-semibold">{row.solarSelfConsumedKWh.toFixed(1)}</td>
                      <td className="py-2 px-4 text-right text-emerald-700 font-bold">
                        {row.consumptionKWh > 0 ? Math.min(100, (row.productionKWh / row.consumptionKWh) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-emerald-50/80 font-bold text-slate-900 border-t-2 border-emerald-200">
                  <tr>
                    <td className="py-3 px-4 uppercase font-extrabold">TOTAL</td>
                    <td className="py-3 px-4 text-center font-bold">{totalConsumptionKWh.toLocaleString()} kWh</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-800">{totalProductionKWh.toFixed(1)} kWh</td>
                    <td className="py-3 px-4 text-right font-bold">{totalSavingsKWh.toFixed(1)} kWh</td>
                    <td className="py-3 px-4 text-right font-extrabold text-emerald-800">{avgCoveragePct.toFixed(1)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}

        {/* ---------------------------------------------------- */}
        {/* VISTA 2: COTIZACIÓN Y EQUIPOS */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'cotizacion' && (
          <div className="space-y-6 shrink-0">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">N° COTIZACIÓN</span>
                <span className="text-lg font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">POTENCIA FOTOVOLTAICA</span>
                <span className="text-lg font-bold text-emerald-800">{summary.systemCapacityKWp.toFixed(2)} kWp</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">INVERSIÓN NETA (LEY 57-07)</span>
                <span className="text-lg font-bold text-emerald-700">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">VALIDEZ OFERTA</span>
                <span className="text-lg font-bold text-amber-700">{project.client.quoteValidityDays || 7} Días</span>
              </div>
            </div>

            {/* Complete Interactive Invoice Proposal View */}
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden font-sans shrink-0">
              {/* Header Electsun Dark Green Banner */}
              <div className="bg-[#14532d] text-white px-8 py-5 flex justify-between items-center">
                <div>
                  <h2 className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
                    PROPUESTA TÉCNICA Y ECONÓMICA • ID: {project.client.projectId || 'SP-2024-089'}
                  </h2>
                  <h1 className="text-xl font-bold uppercase tracking-tight text-white mt-0.5">
                    {project.client.name} — {summary.systemCapacityKWp.toFixed(2)}kWp
                  </h1>
                  <p className="text-[11px] text-emerald-100/90 mt-0.5">
                    Ubicación: <span className="font-semibold text-white">{project.client.province || project.client.location}</span> | Fecha: <span className="font-semibold text-white">{currentDateStr}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5 justify-end">
                    <span className="w-3.5 h-3.5 bg-emerald-400 rounded-full inline-block"></span> electsun
                  </div>
                  <p className="text-[10px] text-emerald-200 tracking-wider font-semibold">EL SOL A TU FAVOR</p>
                </div>
              </div>

              <div className="bg-[#1e6a3b] text-center text-white py-1.5 font-bold text-xs uppercase tracking-wider">
                COTIZACIÓN DE SISTEMA FOTOVOLTAICO
              </div>

              <div className="p-8 space-y-6 text-xs text-slate-800">
                {/* DATOS DEL CLIENTE */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
                    DATOS DEL CLIENTE :
                  </h3>
                  <div className="grid grid-cols-2 gap-4 px-2 text-[11px]">
                    <div className="space-y-1">
                      <div><span className="font-bold text-slate-600">Cliente:</span> <span className="font-bold text-slate-900">{project.client.name}</span></div>
                      <div><span className="font-bold text-slate-600">Contacto:</span> {project.client.company || project.client.name}</div>
                      <div><span className="font-bold text-slate-600">Teléfono:</span> {project.client.contactPhone || '809-555-0199'}</div>
                      <div><span className="font-bold text-slate-600">Dirección:</span> {project.client.address || 'Calle Marginal Triangulo 26 Alma Rosa 2da, Santo Domingo RD.'}</div>
                    </div>
                    <div className="space-y-1 text-right">
                      <div><span className="font-bold text-slate-600">N° Cotización:</span> <span className="font-bold text-slate-900">{project.client.quoteNumber || 'C-0030'}</span></div>
                      <div><span className="font-bold text-slate-600">Fecha:</span> <span className="font-semibold text-slate-800">{currentDateStr}</span></div>
                      <div><span className="font-bold text-slate-600">Válido por:</span> <span className="font-bold text-emerald-700">{project.client.quoteValidityDays || 7} Días</span></div>
                    </div>
                  </div>
                </div>

                {/* ESPECIFICACIONES DEL SISTEMA */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
                    ESPECIFICACIONES DEL SISTEMA
                  </h3>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
                    <div>
                      <div><span className="font-bold text-slate-700">Potencia (kW-dc):</span> <span className="font-bold text-slate-900">{summary.systemCapacityKWp.toFixed(2)}</span></div>
                      <div><span className="font-bold text-slate-700">Tipo de instalación:</span> Fotovoltaica</div>
                    </div>
                    <div className="text-right">
                      <div><span className="font-bold text-slate-700">Consumo mensual estimado (kWh):</span> <span className="font-bold text-slate-900">{Math.round(summary.annualConsumptionKWh / 12).toLocaleString()}</span></div>
                      <div><span className="font-bold text-slate-700">EDES / Distribuidor:</span> <span className="font-bold text-emerald-800">{project.client.distributor || 'EDEESTE'}</span></div>
                    </div>
                  </div>
                </div>

                {/* EQUIPOS Y MATERIALES */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-2">
                    EQUIPOS Y MATERIALES
                  </h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#14532d] text-white font-bold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-2">DESCRIPCION</th>
                          <th className="px-3 py-2 text-center w-20">CANT.</th>
                          <th className="px-3 py-2 text-center w-20">UNIDAD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800 font-semibold">
                        <tr className="bg-white">
                          <td className="px-3 py-2">{project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}</td>
                          <td className="px-3 py-2 text-center font-bold">{project.specs.panelCount}</td>
                          <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="px-3 py-2">{project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}</td>
                          <td className="px-3 py-2 text-center font-bold">{project.specs.inverterCount || 2}</td>
                          <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                        </tr>
                        {project.specs.hasBattery && (
                          <tr className="bg-white">
                            <td className="px-3 py-2">{project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}</td>
                            <td className="px-3 py-2 text-center font-bold">{project.specs.batteryCount || 3}</td>
                            <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                          </tr>
                        )}
                        <tr className="bg-slate-50/60">
                          <td className="px-3 py-2">{project.specs.installationServicesDesc || 'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).'}</td>
                          <td className="px-3 py-2 text-center font-bold">1</td>
                          <td className="px-3 py-2 text-center text-slate-500 font-normal">UD</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* DESGLOSE FINANCIERO */}
                <div className="flex justify-end">
                  <div className="w-[380px] bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between text-slate-700">
                      <span className="font-semibold">SUB-TOTAL (USD) SIN ITBIS :</span>
                      <span className="font-bold">${(summary.costMatrix?.precioNetoUSD || (summary.grossInvestmentUSD - summary.itbisSavedUSD)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-900 bg-slate-200/80 px-2 py-1 rounded font-bold">
                      <span>TOTAL GENERAL (USD) :</span>
                      <span>${(summary.grossInvestmentUSD + (project.financials.applyITBISExemption ? summary.itbisSavedUSD : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-emerald-800 font-semibold">
                      <span>ITBIS A DESCONTAR POR LEY 57-07 US$ :</span>
                      <span className="font-bold">${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between bg-[#14532d] text-white px-2 py-1 rounded font-bold">
                      <span>TOTAL GENERAL (USD) SI CALIFICA LEY 57-07 :</span>
                      <span>${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-800 pt-1 border-t border-slate-300">
                      <span className="font-bold">PRECIO POR WATT (USD/W):</span>
                      <span className="font-bold text-emerald-800">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD || (summary.solarInvestmentUSD / (summary.systemCapacityKWp * 1000)) || 1.13).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* INCENTIVOS DE LEY 57-07 */}
                <div>
                  <h3 className="bg-slate-100 px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase border-l-4 border-emerald-800 mb-1">
                    INCENTIVOS DE LEY 57-07
                  </h3>
                  <p className="text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-900 px-3 py-1 rounded mb-2">
                    (Descuento de 40% para equipos energía renovables: Paneles solares, inversores y baterías)
                  </p>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-[#14532d] text-white font-bold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-1.5">CONCEPTO</th>
                          <th className="px-3 py-1.5 text-right">VALOR US $</th>
                          <th className="px-3 py-1.5 text-right w-20">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[11px] text-slate-800 font-semibold">
                        <tr className="bg-white font-bold">
                          <td className="px-3 py-1.5">TOTAL EQUIPOS ENERGIAS RENOVABLES (PANELES-INVERSORES-BATERIAS)</td>
                          <td className="px-3 py-1.5 text-right">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-1.5 text-right">100%</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 1ER AÑO</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">13.33%</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 2DO AÑO</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">13.33%</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="px-3 py-1.5">MONTO A DESCONTAR POR LA LEY 57-07 - DGII 3ER AÑO</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">${(summary.ley5707CreditUSD / 3).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-700">13.33%</td>
                        </tr>
                        <tr className="bg-emerald-50 text-emerald-900 font-bold">
                          <td className="px-3 py-1.5">TOTAL A DESCONTAR POR LA LEY 57-07 (40% DEL TOTAL)</td>
                          <td className="px-3 py-1.5 text-right text-emerald-800">${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-800">40.00%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* GARANTÍAS Y NOS ENCARGAMOS DE GESTIONAR GRID */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-[11px]">
                    <h4 className="font-bold text-emerald-900 border-b border-slate-200 pb-1 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> GARANTÍAS
                    </h4>
                    <div>• <span className="font-bold">Paneles Solares:</span> 25 años (80.7% potencia mínima garantizada)</div>
                    <div>• <span className="font-bold">Inversor:</span> 5 años</div>
                    <div>• <span className="font-bold">Estructura de montaje:</span> 10 años</div>
                    <div>• <span className="font-bold">Batería:</span> 10 años</div>
                    <div>• <span className="font-bold">Mano de obra:</span> 1 año</div>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3 space-y-1 text-[11px]">
                    <h4 className="font-bold text-emerald-900 border-b border-emerald-200 pb-1 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> NOS ENCARGAMOS DE GESTIONAR
                    </h4>
                    <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" /> <span>Instalación del contador bidireccional en las EDES</span></div>
                    <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" /> <span>Aprobación de crédito fiscal (CNE) y el Ministerio de Hacienda</span></div>
                    <div className="flex items-start gap-1"><Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" /> <span>Trámites completos ante organismos reguladores</span></div>
                  </div>
                </div>

                {/* LEGAL SUBTEXT BETWEEN ASTERISKS */}
                <div className="text-center text-[10px] text-slate-500 font-semibold italic pt-1">
                  * Equipos según disponibilidad de inventario | * Propuesta válida por {project.client.quoteValidityDays || 7} días | * Precios en USD *
                </div>
              </div>

              {/* Footer Electsun */}
              <div className="px-8 py-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-600 font-semibold">
                <div>Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do</div>
                <div className="font-bold text-slate-800">Propuesta Cotización Electsun</div>
              </div>
            </div>

            {/* TABLA DE COSTOS E INGRESOS INTERNOS (REPLICANDO HOJA DE CÁLCULO EXCEL) */}
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xl overflow-hidden font-sans shrink-0">
              {/* Header Orange Banner matching Excel */}
              <div className="bg-amber-600 text-white px-6 py-3.5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h3 className="font-extrabold text-sm uppercase tracking-wider text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">table_chart</span>
                    CLIENTE: {project.client.name} — Costos proyectos
                  </h3>
                  <span className="bg-amber-700/80 text-amber-100 text-[10px] px-2.5 py-0.5 rounded font-bold uppercase tracking-wider border border-amber-500/50">
                    Uso Interno Confidencial
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs font-bold text-amber-100">
                  <div>
                    Tasa USD: <span className="text-white font-extrabold">{summary.costMatrix.dopExchangeRate} DOP</span>
                  </div>
                  <div>
                    Porcentaje Venta: <span className="text-white font-extrabold">{summary.costMatrix.saleMarginMultiplier}</span>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Table matching Excel columns */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200 uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Productos</th>
                        <th className="py-2.5 px-3 text-center text-red-600">kilos / Cap.</th>
                        <th className="py-2.5 px-3 text-center text-red-600">Cantidad</th>
                        <th className="py-2.5 px-3 text-right text-red-600">Precio Unit. USD</th>
                        <th className="py-2.5 px-3 text-right">Precio Unit. RD</th>
                        <th className="py-2.5 px-3 text-right font-bold">Precio Total RD</th>
                        <th className="py-2.5 px-3 text-right font-bold">Precio Total USD</th>
                        <th className="py-2.5 px-3 text-right text-red-600">ITBIS RD</th>
                        <th className="py-2.5 px-3 text-right text-red-600">ITBIS USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800 font-semibold text-xs">
                      {summary.costMatrix.items.map((item, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{item.name}</td>
                          <td className="py-2.5 px-3 text-center text-red-600 font-bold">{item.kilos}</td>
                          <td className="py-2.5 px-3 text-center text-red-600 font-bold">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-red-600 font-bold">${item.unitPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right">${item.unitPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-bold">${item.totalPriceDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right font-bold">${item.totalPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2.5 px-3 text-right text-slate-500">{item.itbisDOP > 0 ? `$${item.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                          <td className="py-2.5 px-3 text-right text-slate-500">{item.itbisUSD > 0 ? `$${item.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary Totals Box matching bottom right of Excel */}
                <div className="flex justify-end pt-2">
                  <div className="w-[460px] bg-slate-50 border border-slate-300 rounded-xl p-4 space-y-1.5 text-xs font-semibold">
                    <div className="flex justify-between text-slate-700">
                      <span>Precio Neto :</span>
                      <span>RD$ {summary.costMatrix.precioNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-slate-900">${summary.costMatrix.precioNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="flex justify-between text-slate-700">
                      <span>ITBIS Total :</span>
                      <span>RD$ {summary.costMatrix.itbisDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-slate-900">${summary.costMatrix.itbisUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold bg-slate-200/80 px-2.5 py-1 rounded">
                      <span>Total Neto (Costo Total) :</span>
                      <span>RD$ {summary.costMatrix.totalNetoDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong>${summary.costMatrix.totalNetoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="flex justify-between text-red-600 font-extrabold bg-red-50 border border-red-200 px-2.5 py-1 rounded">
                      <span>Porcentaje venta ({summary.costMatrix.saleMarginMultiplier}) :</span>
                      <span>RD$ {summary.costMatrix.porcentajeVentaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong>${summary.costMatrix.porcentajeVentaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                    <div className="flex justify-between text-slate-800">
                      <span>Precio kilos costo :</span>
                      <span>RD$ {summary.costMatrix.precioKilosCostoDOP.toFixed(2)} &nbsp;|&nbsp; <strong className="text-slate-900">${summary.costMatrix.precioKilosCostoUSD.toFixed(2)} USD/kWp (${summary.costMatrix.costPerWattUSD.toFixed(2)} USD/W)</strong></span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold">
                      <span>Precio kilos ventas :</span>
                      <span>RD$ {summary.costMatrix.precioKilosVentasDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-emerald-800">${summary.costMatrix.precioKilosVentasUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/kWp (${summary.costMatrix.salePricePerWattUSD.toFixed(2)} USD/W)</strong></span>
                    </div>
                    <div className="flex justify-between text-emerald-950 font-black bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-lg text-sm mt-1">
                      <span>Ganancia Proyectada :</span>
                      <span>RD$ {summary.costMatrix.gananciaDOP.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &nbsp;|&nbsp; <strong className="text-emerald-800">${summary.costMatrix.gananciaUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* VISTA 3: RETORNO DE INVERSIÓN */}
        {/* ---------------------------------------------------- */}
        {activeMainTab === 'retorno' && (
          <div className="space-y-6 shrink-0">
            {/* Indicadores Financieros Principales */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  PERÍODO DE RETORNO (PAYBACK)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-800">{summary.paybackYears}</span>
                  <span className="text-xs text-slate-600 font-bold">Años</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                  Recuperación de inversión neta
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  TASA INTERNA DE RETORNO (TIR)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-700">{summary.irrPct}%</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                  Rentabilidad anualizada (IRR)
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  VALOR ACTUAL NETO (VAN)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-slate-900">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
                  Tasa de descuento: 10%
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  AHORRO ACUMULADO 25 AÑOS
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-emerald-800">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                  Beneficio neto proyectado
                </span>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  RETORNO DE INVERSIÓN (ROI)
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-800">{summary.roi25YrPct}%</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">
                  ROI a 25 años
                </span>
              </div>
            </div>

            {/* TABLA 1: Inversión Inicial e Incentivos */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Cálculo de Ahorro y Retorno de Inversión
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[60%]">CONCEPTO FINANCIERO</th>
                    <th className="py-2.5 px-4 text-right w-[40%]">VALOR (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Inversión Bruta Sistema (USD)</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                  </tr>
                  {summary.itbisSavedUSD > 0 && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-800">Exoneración 18% ITBIS (Ley 57-07) (USD)</td>
                      <td className="py-2.5 px-4 font-bold text-emerald-700">-${summary.itbisSavedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                    </tr>
                  )}
                  {summary.ley5707CreditUSD > 0 && (
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-800">Crédito Fiscal 40% DGII (Ley 57-07) (USD)</td>
                      <td className="py-2.5 px-4 font-bold text-emerald-700">-${summary.ley5707CreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                    </tr>
                  )}
                  <tr className="hover:bg-slate-50 bg-emerald-50/50 font-bold">
                    <td className="py-2.5 px-4 text-slate-900">Inversión Neta Final (USD)</td>
                    <td className="py-2.5 px-4 text-emerald-800 text-sm">${summary.netInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLA 2: Resumen de Ahorro Anual y Retorno de Inversión */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Resumen de Ahorro Anual y Retorno de Inversión
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">AÑO</th>
                    <th className="py-2.5 px-4 text-right">AHORRO ENERGÉTICO (USD)</th>
                    <th className="py-2.5 px-4 text-right">INCENTIVO FISCAL (USD)</th>
                    <th className="py-2.5 px-4 text-right">AHORRO TOTAL ANUAL (USD)</th>
                    <th className="py-2.5 px-4 text-right font-bold">BENEFICIO ACUMULADO (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Año 1</td>
                    <td className="py-2.5 px-4 text-right">${year1Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${year1Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">${(year1Savings + year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-red-600">-${((summary.grossInvestmentUSD - summary.itbisSavedUSD) - year1Savings - year1Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>

                  <tr className="hover:bg-slate-50 bg-emerald-50/60 font-bold">
                    <td className="py-2.5 px-4 text-emerald-900">Año {Math.ceil(summary.paybackYears)} (Retorno Payback)</td>
                    <td className="py-2.5 px-4 text-right">${(cf25[Math.ceil(summary.paybackYears) - 1]?.savingsUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${(cf25[Math.ceil(summary.paybackYears) - 1]?.taxCreditUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right">${((cf25[Math.ceil(summary.paybackYears) - 1]?.savingsUSD || 0) + (cf25[Math.ceil(summary.paybackYears) - 1]?.taxCreditUSD || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-800">${(cf25[Math.ceil(summary.paybackYears) - 1]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>

                  <tr className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">Año 10</td>
                    <td className="py-2.5 px-4 text-right">${avg10Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${avg10Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-semibold">${(avg10Savings + avg10Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(cf25[9]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>

                  <tr className="hover:bg-slate-50 font-bold bg-slate-50">
                    <td className="py-2.5 px-4 text-slate-900">Año 25 (Final de Vida Útil)</td>
                    <td className="py-2.5 px-4 text-right">${avg25Savings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-700">${avg25Tax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">${(avg25Savings + avg25Tax).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-800">${(cf25[cf25.length - 1]?.cumulativeCashFlowUSD || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* GRÁFICA DE BENEFICIO ACUMULADO (25 AÑOS) */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3 shrink-0">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Beneficio Acumulado (25 Años)
                </h3>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-red-500"></span>
                    <span className="text-slate-700">Inversión Neta Negativa</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-600"></span>
                    <span className="text-slate-700">Beneficio Acumulado Positivo</span>
                  </div>
                </div>
              </div>

              <div className="h-[320px] min-h-[320px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cumulativeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="yearLabel" tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }}
                      tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip formatter={(val: number) => [`$${val.toLocaleString()} USD`, 'Beneficio Acumulado']} />
                    <Bar dataKey="cumulative" radius={[2, 2, 0, 0]}>
                      {cumulativeChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.cumulative < 0 ? '#ef4444' : '#16a34a'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TABLA 3: Flujo de Caja y Beneficios Acumulados (25 AÑOS) */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Flujo de Caja y Beneficios Acumulados (25 Años)
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[8%] text-center">Año</th>
                    <th className="py-2.5 px-4 text-right w-[16%]">Energía Generada (kWh)</th>
                    <th className="py-2.5 px-4 text-right w-[16%]">Ahorro Energía (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Incentivo Fiscal (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Ahorro Anual Total (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">Cash Flow (USD)</th>
                    <th className="py-2.5 px-4 text-right w-[15%]">CF Beneficio Acumulado (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr className="hover:bg-slate-50 font-bold bg-slate-50/50">
                    <td className="py-2.5 px-4 text-center">0</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-slate-400">-</td>
                    <td className="py-2.5 px-4 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right text-red-600">-${summary.grossInvestmentUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>

                  {cf25.map((row) => {
                    const totalAnnualSavings = row.savingsUSD + row.taxCreditUSD;
                    const isCumulativeNegative = row.cumulativeCashFlowUSD < 0;
                    const isCashFlowNegative = row.netCashFlowUSD < 0;

                    return (
                      <tr key={row.year} className="hover:bg-slate-50">
                        <td className="py-2 px-4 text-center font-bold">{row.year}</td>
                        <td className="py-2 px-4 text-right font-medium">{row.productionKWh.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right font-medium">${row.savingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="py-2 px-4 text-right text-emerald-700 font-semibold">
                          {row.taxCreditUSD > 0 ? `$${row.taxCreditUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00'}
                        </td>
                        <td className="py-2 px-4 text-right font-semibold">${totalAnnualSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className={`py-2 px-4 text-right font-semibold ${isCashFlowNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                          {row.netCashFlowUSD < 0 ? '-' : ''}${Math.abs(row.netCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-2 px-4 text-right font-bold ${isCumulativeNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                          {row.cumulativeCashFlowUSD < 0 ? '-' : ''}${Math.abs(row.cumulativeCashFlowUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* TABLA 4: Indicadores Financieros del Proyecto */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs shrink-0">
              <div className="bg-[#2d5f47] text-white px-4 py-3 font-bold text-xs uppercase tracking-wider">
                Indicadores Financieros del Proyecto
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 w-[40%]">Indicador</th>
                    <th className="py-2.5 px-4 text-right w-[20%]">Valor</th>
                    <th className="py-2.5 px-4 w-[40%]">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Payback (Periodo de Recuperación)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.paybackYears}</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Años hasta recuperar la inversión inicial</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">TIR (Tasa Interna de Retorno)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.irrPct}%</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Rendimiento anual del proyecto</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">VAN a tasa descuento {project.financials.discountRatePct}%</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.npvUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Valor actual neto — positivo = proyecto viable</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Ahorro Total 25 Años</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${summary.total25YearSavingsUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Beneficio acumulado al final del periodo</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">ROI Total del Proyecto</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{summary.roi25YrPct}%</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Retorno sobre inversión total en 25 años</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Reducción CO2 estimada (25 años)</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">{(summary.co2AvoidedTonsPerYear * 25).toFixed(2)} Ton</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Factor emisión red RD: {project.financials.co2FactorKgPerKWh || 0.481} kg CO2/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-slate-800">Precio por Watt instalado</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">${(project.specs.pricePerWattUSD || project.financials.pricePerWattUSD).toFixed(2)} USD/W</td>
                    <td className="py-2.5 px-4 text-slate-500 text-[11px] font-normal">Competitividad vs mercado</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
};
