import React, { useState, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ExtractedDatasheetData, ExtractedEquipmentVariant, SolarEquipmentItem, EquipmentType } from '../../types/equipment';
import { parseDatasheetWithGemini } from '../../services/geminiDatasheetService';
import {
  X,
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Database,
  Trash2,
  Sun,
  Zap,
  BatteryCharging,
  Sliders,
  RefreshCw,
  Plus,
  Layers,
} from 'lucide-react';

export const AIDatasheetScannerModal: React.FC = () => {
  const {
    isAIDatasheetModalOpen,
    closeAIDatasheetModal,
    addEquipmentBatch,
    updateSpecs,
    getActiveProject,
    geminiApiKey,
    geminiModel,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedDatasheetData | null>(null);
  const [applyToActiveProject, setApplyToActiveProject] = useState(true);
  const [selectedVariantIdForActive, setSelectedVariantIdForActive] = useState<string | null>(null);

  if (!isAIDatasheetModalOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Acepta PDF y formatos de imagen
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Formato no soportado. Por favor sube un documento PDF o imagen JPG/PNG/WebP de la ficha técnica.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setErrorMessage('El archivo excede los 25 MB permitidos.');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = () => {
      setFilePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleScanDatasheet = async () => {
    if (!selectedFile || !filePreview) {
      setErrorMessage('Por favor selecciona una ficha técnica antes de escanear.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await parseDatasheetWithGemini(
        filePreview,
        selectedFile.type,
        selectedFile.name,
        geminiApiKey,
        geminiModel
      );

      setExtractedData(data);
      if (data.variants.length > 0) {
        setSelectedVariantIdForActive(data.variants[0].id);
      }
    } catch (err: any) {
      console.error('Error al analizar ficha técnica:', err);
      setErrorMessage(err.message || 'Error desconocido al procesar el datasheet.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelectAll = (select: boolean) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      variants: extractedData.variants.map((v) => ({ ...v, selected: select })),
    });
  };

  const handleToggleVariant = (id: string) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      variants: extractedData.variants.map((v) =>
        v.id === id ? { ...v, selected: !v.selected } : v
      ),
    });
  };

  const handleUpdateVariant = (id: string, updates: Partial<ExtractedEquipmentVariant>) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      variants: extractedData.variants.map((v) => {
        if (v.id === id) {
          const updated = { ...v, ...updates };
          // Regenerar displayName si cambió modelCode o potencia o capacidad
          if (
            updates.modelCode !== undefined ||
            updates.powerW !== undefined ||
            updates.powerKW !== undefined ||
            updates.capacityKWh !== undefined
          ) {
            if (extractedData.equipmentType === 'panel') {
              updated.displayName = `Módulos ${extractedData.brand} ${updated.modelCode} (${updated.powerW}W)`;
            } else if (extractedData.equipmentType === 'inverter') {
              updated.displayName = `Inversor ${extractedData.brand} ${updated.modelCode} (${updated.powerKW}Kw)`;
            } else {
              updated.displayName = `Batería ${extractedData.brand} ${updated.modelCode} (${updated.capacityKWh}kWh)`;
            }
          }
          return updated;
        }
        return v;
      }),
    });
  };

  const handleDeleteVariant = (id: string) => {
    if (!extractedData) return;
    setExtractedData({
      ...extractedData,
      variants: extractedData.variants.filter((v) => v.id !== id),
    });
  };

  const handleSaveToCatalog = () => {
    if (!extractedData) return;
    const selectedVariants = extractedData.variants.filter((v) => v.selected);
    if (selectedVariants.length === 0) {
      setErrorMessage('Debes seleccionar al menos una variante para guardar en el catálogo.');
      return;
    }

    const itemsToSave: SolarEquipmentItem[] = selectedVariants.map((v) => ({
      id: `eq-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: extractedData.equipmentType,
      brand: extractedData.brand,
      modelSeries: extractedData.modelSeries,
      displayName: v.displayName,
      powerW: v.powerW,
      powerKW: v.powerKW,
      capacityKWh: v.capacityKWh,
      capacityAh: v.capacityAh,
      voltageV: v.voltageV,
      dodPct: v.dodPct,
      batteryEfficiencyPct: v.batteryEfficiencyPct,
      cycles: v.cycles,
      chemistry: v.chemistry,
      maxChargeCurrentA: v.maxChargeCurrentA,
      efficiencyPct: v.efficiencyPct,
      tempCoeff: v.tempCoeff,
      annualDegradation: v.annualDegradation,
      category: extractedData.category,
      voltageMPPT: v.voltageMPPT,
      voc: v.voc,
      isc: v.isc,
      vmp: v.vmp,
      imp: v.imp,
      maxAcPowerKW: v.maxAcPowerKW,
      maxPvPowerKW: v.maxPvPowerKW,
      maxEfficiencyPct: v.maxEfficiencyPct,
      mpptCount: v.mpptCount,
      dimensions: v.dimensions,
      weightKg: v.weightKg,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    addEquipmentBatch(itemsToSave);

    // Si se solicitó aplicar al proyecto activo
    if (applyToActiveProject && selectedVariantIdForActive) {
      const activeVariant = selectedVariants.find((v) => v.id === selectedVariantIdForActive) || selectedVariants[0];
      if (activeVariant) {
        if (extractedData.equipmentType === 'panel') {
          updateSpecs({
            panelBrandModel: activeVariant.displayName,
            panelPowerW: activeVariant.powerW || 550,
            panelEfficiency: activeVariant.efficiencyPct || 22.0,
            tempCoeff: activeVariant.tempCoeff || -0.29,
          });
        } else if (extractedData.equipmentType === 'inverter') {
          updateSpecs({
            inverterBrandModel: activeVariant.displayName,
            inverterPowerKW: activeVariant.powerKW || 5.0,
          });
        } else if (extractedData.equipmentType === 'battery') {
          updateSpecs({
            hasBattery: true,
            batteryBrandModel: activeVariant.displayName,
            batteryCapacityKWh: activeVariant.capacityKWh || 16.08,
            batteryDOD: activeVariant.dodPct || 90,
            batteryEfficiencyPct: activeVariant.batteryEfficiencyPct || 95,
          });
        }
      }
    }

    closeAIDatasheetModal();
  };

  const selectedCount = extractedData?.variants.filter((v) => v.selected).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          isDark ? 'bg-[#18181b] border-[#27272a] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Cabecera del Modal */}
        <div
          className={`p-5 border-b flex items-center justify-between ${
            isDark
              ? 'bg-gradient-to-r from-purple-950/40 via-[#18181b] to-indigo-950/40 border-[#27272a]'
              : 'bg-gradient-to-r from-purple-50 via-white to-indigo-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Escáner de Fichas Técnicas (IA)</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  Multivariante & BESS
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Extrae familias de Paneles, Inversores y Baterías por variantes de potencia desde PDF o imágenes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAIDatasheetModal}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isDark ? 'hover:bg-[#27272a] text-zinc-400 hover:text-zinc-200' : 'hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800 text-red-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Estado Inicial: Carga y Procesamiento de Documento */}
          {!extractedData ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 group ${
                  selectedFile
                    ? isDark
                      ? 'border-purple-500/80 bg-purple-950/20'
                      : 'border-purple-500 bg-purple-50/50'
                    : isDark
                    ? 'border-[#3f3f46] hover:border-purple-400 bg-[#121214]/50 hover:bg-[#1c1c24]'
                    : 'border-slate-300 hover:border-purple-500 bg-slate-50/50 hover:bg-purple-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                    selectedFile
                      ? 'bg-purple-600 text-white'
                      : isDark
                      ? 'bg-[#27272a] text-purple-400'
                      : 'bg-purple-100 text-purple-600'
                  }`}
                >
                  {selectedFile ? <FileText className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold">
                    {selectedFile ? selectedFile.name : 'Haz clic o arrastra la ficha técnica aquí'}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    {selectedFile
                      ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Listo para escanear`
                      : 'Admite documentos PDF o imágenes JPG, PNG, WebP de cualquier fabricante'}
                  </p>
                </div>
              </div>

              {/* Botón de Escanear con IA */}
              <button
                type="button"
                onClick={handleScanDatasheet}
                disabled={!selectedFile || isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg hover:shadow-purple-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analizando tabla técnica y variantes con Google Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Escanear y Extraer Variantes con IA</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Estado 2: Revisión, Selección y Edición de Variantes Extraídas */
            <div className="space-y-4">
              {/* Resumen del Documento Extraído */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isDark ? 'bg-[#202028] border-[#2e2e38]' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    {extractedData.equipmentType === 'panel' ? (
                      <Sun className="w-5 h-5" />
                    ) : extractedData.equipmentType === 'battery' ? (
                      <BatteryCharging className="w-5 h-5" />
                    ) : (
                      <Zap className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        {extractedData.brand}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-purple-500/20 text-purple-300">
                        {extractedData.equipmentType === 'panel'
                          ? 'Módulos Fotovoltaicos'
                          : extractedData.equipmentType === 'battery'
                          ? 'Batería / Almacenamiento'
                          : 'Inversores Solares'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold mt-0.5">
                      {extractedData.modelSeries} {extractedData.category ? `(${extractedData.category})` : ''}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setExtractedData(null);
                      setSelectedFile(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                      isDark
                        ? 'border-[#3f3f46] hover:bg-[#27272a] text-zinc-300'
                        : 'border-slate-300 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Subir otro
                  </button>
                </div>
              </div>

              {/* Controles de Selección Masiva */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="text-purple-400 hover:underline font-semibold cursor-pointer"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-zinc-500">•</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(false)}
                    className="text-zinc-400 hover:underline cursor-pointer"
                  >
                    Deseleccionar todas
                  </button>
                </div>
                <span className={`font-semibold ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
                  {selectedCount} de {extractedData.variants.length} variantes seleccionadas
                </span>
              </div>

              {/* Lista / Tabla de Variantes Extraídas */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {extractedData.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      variant.selected
                        ? isDark
                          ? 'bg-[#202028] border-purple-500/40 shadow-sm'
                          : 'bg-purple-50/40 border-purple-300 shadow-sm'
                        : isDark
                        ? 'bg-[#18181b]/60 border-[#27272a] opacity-60'
                        : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={!!variant.selected}
                        onChange={() => handleToggleVariant(variant.id)}
                        className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer h-4 w-4 mt-1"
                      />

                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={variant.displayName}
                            onChange={(e) => handleUpdateVariant(variant.id, { displayName: e.target.value })}
                            className={`flex-1 min-w-[200px] border rounded-lg px-2.5 py-1 text-xs font-bold ${
                              isDark
                                ? 'bg-[#121214] border-[#3f3f46] text-zinc-100'
                                : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                          {variant.selected && applyToActiveProject && (
                            <label className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 cursor-pointer">
                              <input
                                type="radio"
                                name="activeVariant"
                                checked={selectedVariantIdForActive === variant.id}
                                onChange={() => setSelectedVariantIdForActive(variant.id)}
                                className="text-emerald-500 focus:ring-emerald-400"
                              />
                              <span>Usar en proyecto</span>
                            </label>
                          )}
                        </div>

                        {/* Parámetros Técnicos Editables de la Variante */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          {extractedData.equipmentType === 'panel' && (
                            <>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Potencia (W):</span>
                                <input
                                  type="number"
                                  value={variant.powerW || 550}
                                  onChange={(e) => handleUpdateVariant(variant.id, { powerW: parseFloat(e.target.value) || 0 })}
                                  className={`w-full border rounded px-2 py-0.5 text-xs font-bold ${
                                    isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Eficiencia (%):</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={variant.efficiencyPct || 22.0}
                                  onChange={(e) => handleUpdateVariant(variant.id, { efficiencyPct: parseFloat(e.target.value) || 0 })}
                                  className={`w-full border rounded px-2 py-0.5 text-xs font-bold ${
                                    isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Coef. Temp (%/°C):</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={variant.tempCoeff || -0.29}
                                  onChange={(e) => handleUpdateVariant(variant.id, { tempCoeff: parseFloat(e.target.value) || 0 })}
                                  className={`w-full border rounded px-2 py-0.5 text-xs font-bold ${
                                    isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Voc / Isc (V/A):</span>
                                <span className="text-xs font-mono font-bold block pt-1">
                                  {variant.voc || '-'}V / {variant.isc || '-'}A
                                </span>
                              </div>
                            </>
                          )}

                          {extractedData.equipmentType === 'inverter' && (
                            <>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Potencia AC (kW):</span>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={variant.powerKW || 5.0}
                                  onChange={(e) => handleUpdateVariant(variant.id, { powerKW: parseFloat(e.target.value) || 0 })}
                                  className={`w-full border rounded px-2 py-0.5 text-xs font-bold ${
                                    isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Rango MPPT:</span>
                                <span className="text-xs font-mono font-bold block pt-1">
                                  {variant.voltageMPPT || '120-500V'}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Trackers MPPT:</span>
                                <span className="text-xs font-mono font-bold block pt-1">
                                  {variant.mpptCount || 2} MPPT
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Potencia Máx AC:</span>
                                <span className="text-xs font-mono font-bold block pt-1">
                                  {variant.maxAcPowerKW ? `${variant.maxAcPowerKW} kW` : '-'}
                                </span>
                              </div>
                            </>
                          )}

                          {extractedData.equipmentType === 'battery' && (
                            <>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Capacidad (kWh):</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={variant.capacityKWh || 16.08}
                                  onChange={(e) => handleUpdateVariant(variant.id, { capacityKWh: parseFloat(e.target.value) || 0 })}
                                  className={`w-full border rounded px-2 py-0.5 text-xs font-bold ${
                                    isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">DoD Descarga (%):</span>
                                <input
                                  type="number"
                                  step="5"
                                  value={variant.dodPct || 90}
                                  onChange={(e) => handleUpdateVariant(variant.id, { dodPct: parseFloat(e.target.value) || 0 })}
                                  className={`w-full border rounded px-2 py-0.5 text-xs font-bold ${
                                    isDark ? 'bg-[#121214] border-[#3f3f46]' : 'bg-white border-slate-300'
                                  }`}
                                />
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Voltaje / Ah:</span>
                                <span className="text-xs font-mono font-bold block pt-1">
                                  {variant.voltageV || 51.2}V {variant.capacityAh ? `/ ${variant.capacityAh}Ah` : ''}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400 text-[10px] block">Ciclos / Química:</span>
                                <span className="text-xs font-mono font-bold block pt-1">
                                  {variant.cycles || 8000}c • {variant.chemistry || 'LFP'}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteVariant(variant.id)}
                      className={`p-1.5 rounded-lg text-zinc-400 hover:text-red-400 transition-colors cursor-pointer self-end sm:self-center ${
                        isDark ? 'hover:bg-[#27272a]' : 'hover:bg-slate-200'
                      }`}
                      title="Eliminar variante"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Opciones Finales y Botón de Guardado */}
              <div
                className={`pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${
                  isDark ? 'border-[#27272a]' : 'border-slate-200'
                }`}
              >
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToActiveProject}
                    onChange={(e) => setApplyToActiveProject(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>Aplicar variante seleccionada al proyecto activo en el simulador</span>
                </label>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={closeAIDatasheetModal}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                      isDark
                        ? 'border-[#3f3f46] hover:bg-[#27272a] text-zinc-300'
                        : 'border-slate-300 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={handleSaveToCatalog}
                    disabled={selectedCount === 0}
                    className="flex-1 sm:flex-none px-6 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg hover:shadow-emerald-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Database className="w-4 h-4" />
                    <span>Guardar {selectedCount} equipos en Catálogo</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
