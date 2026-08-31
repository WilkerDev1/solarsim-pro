import React, { useState, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { parseDatasheetWithGemini } from '../../services/geminiDatasheetService';
import { ExtractedDatasheetData, ExtractedEquipmentVariant, SolarEquipmentItem } from '../../types/equipment';
import {
  X,
  Upload,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Settings,
  Sun,
  Zap,
  Plus,
  Trash2,
  Layers,
  Database,
  ArrowRight,
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
    openSettingsModal,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const activeProject = getActiveProject();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedDatasheetData | null>(null);
  const [applyToActiveProject, setApplyToActiveProject] = useState(true);
  const [selectedVariantIdForActive, setSelectedVariantIdForActive] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAIDatasheetModalOpen) return null;

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setExtractedData(null);

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Formato no soportado. Por favor sube un archivo PDF o una imagen (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('El archivo excede el límite máximo de 20MB.');
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleScanWithAI = async () => {
    if (!selectedFile) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Convertir a base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      const base64Data = await base64Promise;

      let result: ExtractedDatasheetData;
      if (window.electronAPI?.parseDatasheetWithAI) {
        const electronRes = await window.electronAPI.parseDatasheetWithAI({
          fileBase64: base64Data,
          mimeType: selectedFile.type,
          fileName: selectedFile.name,
          apiKey: geminiApiKey,
          model: geminiModel,
        });
        if (!electronRes.success || !electronRes.data) {
          throw new Error(electronRes.error || 'Error al procesar el datasheet en Electron');
        }
        result = electronRes.data;
      } else {
        result = await parseDatasheetWithGemini(
          base64Data,
          selectedFile.type,
          selectedFile.name,
          geminiApiKey,
          geminiModel
        );
      }

      setExtractedData(result);
      if (result.variants.length > 0) {
        setSelectedVariantIdForActive(result.variants[0].id);
      }
    } catch (err: any) {
      console.error('Error scanning datasheet:', err);
      setErrorMessage(err.message || 'Ocurrió un error inesperado al analizar la ficha técnica.');
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
          // Regenerar displayName si cambió modelCode o potencia
          if (updates.modelCode !== undefined || updates.powerW !== undefined || updates.powerKW !== undefined) {
            if (extractedData.equipmentType === 'panel') {
              updated.displayName = `Módulos ${extractedData.brand.toUpperCase()} ${updated.modelCode} (${updated.powerW}W)`;
            } else if (extractedData.equipmentType === 'inverter') {
              updated.displayName = `Inversor ${extractedData.brand.toUpperCase()} ${updated.modelCode} (${updated.powerKW}Kw)`;
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
      efficiencyPct: v.efficiencyPct,
      tempCoeff: v.tempCoeff,
      category: extractedData.category,
      voltageMPPT: v.voltageMPPT,
      voc: v.voc,
      isc: v.isc,
      vmp: v.vmp,
      imp: v.imp,
      maxAcPowerKW: v.maxAcPowerKW,
      mpptCount: v.mpptCount,
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
            panelEfficiency: activeVariant.efficiencyPct || 21.5,
            tempCoeff: activeVariant.tempCoeff || -0.35,
          });
        } else if (extractedData.equipmentType === 'inverter') {
          updateSpecs({
            inverterBrandModel: activeVariant.displayName,
            inverterPowerKW: activeVariant.powerKW || 5.0,
          });
        }
      }
    }

    closeAIDatasheetModal();
  };

  const selectedCount = extractedData?.variants.filter((v) => v.selected).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
          isDark ? 'bg-[#18181b] border-[#27272a] text-zinc-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header del Modal */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
            isDark ? 'border-[#27272a] bg-[#14141c]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Escáner de Fichas Técnicas con IA
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-mono">
                  Gemini Vision
                </span>
              </h2>
              <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Extrae familias y variantes completas de paneles o inversores para agregarlos al catálogo inteligente.
              </p>
            </div>
          </div>

          <button
            onClick={closeAIDatasheetModal}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              isDark ? 'hover:bg-[#27272a] text-zinc-400' : 'hover:bg-slate-200 text-slate-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido Principal con Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Banner de Aviso de API Key si falta */}
          {!geminiApiKey && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-amber-950/40 border-amber-800/60 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <span className="text-xs">
                  Configura tu API Key gratuita de Google AI Studio en Ajustes para habilitar el escáner multimodal.
                </span>
              </div>
              <button
                onClick={() => {
                  closeAIDatasheetModal();
                  openSettingsModal('ai');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configurar IA</span>
              </button>
            </div>
          )}

          {/* Zona de Carga de Archivo (Si aún no se ha extraído o para re-escanear) */}
          {!extractedData && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragging
                    ? 'border-purple-500 bg-purple-500/10 scale-[0.99]'
                    : isDark
                    ? 'border-[#3f3f46] hover:border-purple-500/70 bg-[#202028]/40 hover:bg-[#202028]'
                    : 'border-slate-300 hover:border-purple-500 bg-slate-50 hover:bg-purple-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-400">
                  <Upload className="w-7 h-7" />
                </div>

                <div>
                  <p className="text-sm font-bold">
                    {selectedFile ? selectedFile.name : 'Haz clic o arrastra la ficha técnica aquí'}
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                    Soporta documentos PDF de fabricantes o imágenes (JPG, PNG, WebP) de hasta 20MB
                  </p>
                </div>

                {selectedFile && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB listo para análisis</span>
                  </div>
                )}
              </div>

              {filePreview && (
                <div className="flex justify-center">
                  <img
                    src={filePreview}
                    alt="Preview"
                    className="max-h-48 rounded-xl border border-slate-700 object-contain shadow-md"
                  />
                </div>
              )}

              {/* Botón de Iniciar Escaneo */}
              {selectedFile && (
                <div className="flex justify-end">
                  <button
                    onClick={handleScanWithAI}
                    disabled={isLoading}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 text-white text-xs font-bold shadow-lg hover:shadow-purple-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analizando ficha técnica con Gemini...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Escanear y Extraer Variantes con IA</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mensaje de Error */}
          {errorMessage && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Vista de Resultados Extraídos */}
          {extractedData && (
            <div className="space-y-5">
              {/* Cabecera del Equipo Extraído */}
              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isDark ? 'bg-[#202028] border-[#3f3f46]' : 'bg-slate-100 border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${
                      extractedData.equipmentType === 'panel'
                        ? 'bg-amber-500'
                        : extractedData.equipmentType === 'inverter'
                        ? 'bg-emerald-600'
                        : 'bg-indigo-600'
                    }`}
                  >
                    {extractedData.equipmentType === 'panel' ? (
                      <Sun className="w-5 h-5" />
                    ) : extractedData.equipmentType === 'inverter' ? (
                      <Zap className="w-5 h-5" />
                    ) : (
                      <Layers className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono uppercase tracking-wider text-purple-400 font-bold">
                        {extractedData.brand}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-zinc-300 font-medium">
                        {extractedData.equipmentType === 'panel'
                          ? 'Módulo Solar'
                          : extractedData.equipmentType === 'inverter'
                          ? 'Inversor'
                          : 'Batería'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {extractedData.variants.length} variantes detectadas
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
                          {extractedData.equipmentType === 'panel' ? (
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
                                  value={variant.efficiencyPct || 21.5}
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
                                  value={variant.tempCoeff || -0.35}
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
                          ) : (
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
                                  {variant.voltageMPPT || '120-550V'}
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
