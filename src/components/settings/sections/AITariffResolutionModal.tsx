import React, { useState, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { GlobalTariffMatrix, UtilityDistributor } from '../../../types/tariffs';
import { getTariffSource, tariffSourceFieldLabel } from '../../../utils/aiTariffContext';
import { GeminiTariffService } from '../../../services/geminiTariffService';
import {
  X,
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cloud,
  Receipt,
} from 'lucide-react';

interface AITariffResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AITariffResolutionModal: React.FC<AITariffResolutionModalProps> = ({ isOpen, onClose }) => {
  const {
    geminiApiKey,
    geminiModel,
    setTariffMatrix,
    syncTariffsWithServer,
    syncSettings,
    tariffMatrix,
    sessionGeneration,
  } = useSimulationStore();

  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('application/pdf');
  const [userNotes, setUserNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [extractedMatrix, setExtractedMatrix] = useState<GlobalTariffMatrix | null>(null);
  const [selectedDistributorTab, setSelectedDistributorTab] = useState<UtilityDistributor>('EDEESTE');
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [appliedSuccess, setAppliedSuccess] = useState<boolean>(false);

  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const draftBasis = useRef<GlobalTariffMatrix | null>(null);
  const operation = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    operation.current++; request.current?.abort(); setIsProcessing(false);
    setIsSyncingCloud(false); setExtractedMatrix(null); setReviewConfirmed(false); setAppliedSuccess(false); draftBasis.current = null;
    return () => { operation.current++; request.current?.abort(); };
  }, [isOpen, sessionGeneration]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    operation.current++;
    request.current?.abort();
    setIsProcessing(false);
    setFileBase64(null);
    setReviewConfirmed(false);
    const fileOperation = operation.current;
    if (selected.size > 20 * 1024 * 1024) { setFile(null); setErrorMessage('El documento no puede superar 20 MB.'); return; }
    setFile(selected);
    setErrorMessage(null);
    setExtractedMatrix(null);
    setAppliedSuccess(false);

    const detectedMime = selected.type || (selected.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    setMimeType(detectedMime);

    const reader = new FileReader();
    reader.onload = () => {
      if (operation.current !== fileOperation) return;
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setFileBase64(base64Data);
    };
    reader.onerror = () => {
      if (operation.current !== fileOperation) return;
      setErrorMessage('Error al leer el archivo seleccionado.');
    };
    reader.readAsDataURL(selected);
  };

  const handleScan = async () => {
    if (!fileBase64) {
      setErrorMessage('Por favor selecciona un archivo PDF o imagen de la resolución tarifaria.');
      return;
    }

    if (!geminiApiKey) {
      setErrorMessage('Por favor configura tu API Key de Google Gemini en la sección "IA & Integraciones".');
      return;
    }

    request.current?.abort();
    request.current = new AbortController();
    const scanOperation = ++operation.current;
    const sessionGeneration = useSimulationStore.getState().sessionGeneration;
    const isCurrent = () => operation.current === scanOperation && sessionGeneration === useSimulationStore.getState().sessionGeneration;
    setReviewConfirmed(false);
    draftBasis.current = tariffMatrix;
    setIsProcessing(true);
    setErrorMessage(null);
    setExtractedMatrix(null);
    setAppliedSuccess(false);

    try {
      const matrix = await GeminiTariffService.extractTariffMatrixFromDocument({
        fileBase64,
        mimeType,
        userPromptNotes: userNotes,
        apiKey: geminiApiKey,
        preferredModel: geminiModel || undefined,
        currentMatrix: tariffMatrix,
        signal: request.current.signal,
      });

      if (isCurrent()) { setExtractedMatrix(matrix); setSelectedDistributorTab(Object.keys(matrix.schedules).find((dist) => Object.values(matrix.schedules[dist as UtilityDistributor].tariffs).some((tariff) => tariff.source?.resolutionCode === matrix.resolutionCode)) as UtilityDistributor || 'EDEESTE'); }
    } catch (err: any) {
      if (isCurrent()) setErrorMessage(err.message || 'Error al procesar el pliego tarifario con Gemini IA.');
    } finally {
      if (isCurrent()) setIsProcessing(false);
    }
  };

  const handleApplyLocal = () => {
    if (!extractedMatrix || !reviewConfirmed) return;
    if (draftBasis.current !== useSimulationStore.getState().tariffMatrix) { setErrorMessage('El pliego cambió desde la extracción. Vuelve a escanear para conservar los cambios recientes.'); return; }
    setTariffMatrix(extractedMatrix);
    draftBasis.current = useSimulationStore.getState().tariffMatrix;
    setAppliedSuccess(true);

  };

  const handleApplyAndSyncCloud = async () => {
    if (!extractedMatrix || !reviewConfirmed) return;
    if (draftBasis.current !== useSimulationStore.getState().tariffMatrix) { setErrorMessage('El pliego cambió desde la extracción. Vuelve a escanear para conservar los cambios recientes.'); return; }
    setTariffMatrix(extractedMatrix);
    draftBasis.current = useSimulationStore.getState().tariffMatrix;
    const cloudOperation = operation.current;
    const cloudGeneration = useSimulationStore.getState().sessionGeneration;
    setIsSyncingCloud(true);

    try {
      const res = await syncTariffsWithServer();
      if (cloudOperation !== operation.current || cloudGeneration !== useSimulationStore.getState().sessionGeneration) return;
      if (res.success) {
        setAppliedSuccess(true);

      } else {
        setErrorMessage(`Aplicado localmente, pero falló la sincronización en la nube: ${res.message}`);
      }
    } finally {
      if (cloudOperation === operation.current) setIsSyncingCloud(false);
    }
  };

  const distributors: UtilityDistributor[] = ['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Escanear Resolución Tarifaria con IA
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 font-semibold uppercase tracking-wider border border-amber-200/50">
                  Admin & Regulaciones
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Extrae un borrador del documento y revisa sus cargos antes de actualizar el pliego.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-6 overflow-y-auto flex flex-col gap-6">
          {/* Alerta de Error */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Alerta de Éxito */}
          {appliedSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-semibold">¡Pliego tarifario aplicado y actualizado exitosamente!</span>
            </div>
          )}

          {/* Sección de Carga de Archivo */}
          {!extractedMatrix && (
            <div className="flex flex-col gap-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  file
                    ? 'border-amber-400 bg-amber-50/20 dark:border-amber-500/40 dark:bg-amber-950/10'
                    : 'border-slate-300 dark:border-[#27272a] hover:border-amber-400 dark:hover:border-amber-500/50 hover:bg-slate-50 dark:hover:bg-[#222226]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                  {file ? <FileText className="w-7 h-7" /> : <Upload className="w-7 h-7" />}
                </div>
                {file ? (
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-zinc-200">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB • Clic para cambiar archivo
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                      Selecciona el PDF o imagen de la resolución
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Resoluciones de la SIE (ej. SIE-079-2026-TF) o tarifarios de CEPM (PDF, JPG, PNG)
                    </p>
                  </div>
                )}
              </div>

              {/* Notas u orientaciones opcionales */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Notas o consideraciones específicas para la IA (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Pliego correspondiente a agosto 2026 para EDESUR y EDEESTE..."
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-xs border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-800 dark:text-zinc-200 focus:outline-hidden"
                />
              </div>

              {/* Botón de Iniciar Escaneo */}
              <button
                onClick={handleScan}
                disabled={!fileBase64 || isProcessing}
                className="w-full py-3.5 px-6 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analizando resolución con Gemini IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extraer Pliego Tarifario con IA</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Visualizador de Matriz Extraída */}
          {extractedMatrix && (
            <div className="flex flex-col gap-5 animate-fadeIn">
              {/* Resumen de la Resolución */}
              <div className="bg-slate-50 dark:bg-[#1f1f23] p-4 rounded-2xl border border-slate-200/80 dark:border-[#2b2b30] flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {extractedMatrix.resolutionCode}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold font-mono">
                      Vigencia: {extractedMatrix.effectiveDate}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    Publicado por: <span className="font-semibold text-slate-700 dark:text-zinc-300">{extractedMatrix.publishedBy}</span>
                  </p>
                  {extractedMatrix.notes && (
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 italic">
                      {extractedMatrix.notes}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setExtractedMatrix(null)}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer self-start md:self-auto"
                >
                  Volver a escanear
                </button>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Solo las tarifas documentadas se actualizan. Las restantes conservan su fuente anterior; la fecha de inicio no garantiza vigencia actual.</div>
              {/* Tabs por Distribuidora */}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#27272a] pb-2">
                {distributors.map((dist) => (
                  <button
                    key={dist}
                    onClick={() => setSelectedDistributorTab(dist)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedDistributorTab === dist
                        ? 'bg-amber-500 text-white shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#27272a]'
                    }`}
                  >
                    {dist}
                  </button>
                ))}
              </div>

              {/* Tabla de Tarifas de la Distribuidora Seleccionada */}
              {extractedMatrix.schedules[selectedDistributorTab] && (
                <div className="border border-slate-200/80 dark:border-[#27272a] rounded-2xl overflow-hidden bg-white dark:bg-[#121214]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-[#1a1a1e] border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-zinc-400 font-semibold">
                      <tr>
                        <th className="p-3">Código & Tipo</th>
                        <th className="p-3">Tarifa Energía</th>
                        <th className="p-3">Cargo Fijo</th>
                        <th className="p-3">Cargo Potencia</th>
                        <th className="p-3">Retención Excedentes</th>
                        <th className="p-3">Fuente de la fila</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#222226] text-slate-700 dark:text-zinc-300">
                      {Object.values(extractedMatrix.schedules[selectedDistributorTab].tariffs).map((tariff) => (
                        <tr key={tariff.code} className="hover:bg-slate-50/60 dark:hover:bg-[#1a1a1e]/60">
                          <td className="p-3 font-semibold">
                            <span className="font-mono text-emerald-600 dark:text-emerald-400">{tariff.code}</span>
                            <span className="block text-[10px] text-slate-400 font-normal">{tariff.name}</span>
                          </td>
                          <td className="p-3 font-mono font-medium">
                            {tariff.currency === 'USD' ? (
                              <span>${tariff.baseEnergyRateUSD?.toFixed(3)} USD/kWh</span>
                            ) : (
                              <span>RD$ {tariff.baseEnergyRateDOP?.toFixed(2)}/kWh</span>
                            )}
                            {tariff.blocks && tariff.blocks.length > 0 && (
                              <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-sans">
                                Escalonada ({tariff.blocks.length} bloques)
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            {tariff.currency === 'USD'
                              ? `$${tariff.fixedChargeUSD?.toFixed(2) || '0.00'} USD`
                              : `RD$ ${tariff.fixedChargeDOP?.toFixed(2) || '0.00'}`}
                          </td>
                          <td className="p-3 font-mono">
                            {tariff.demandChargePerKWDOP
                              ? `RD$ ${tariff.demandChargePerKWDOP.toFixed(2)}/kW`
                              : tariff.demandChargePerKWUSD
                              ? `$${tariff.demandChargePerKWUSD.toFixed(2)} USD/kW`
                              : '—'}
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272a] text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                              {tariff.netMeteringRetentionPct ?? 25}%
                            </span>
                            {tariff.source?.fields && !tariff.source.fields.includes('netMeteringRetentionPct') && <span className="block text-[10px] mt-1">Política conservada; no extraída</span>}
                          </td>
                          <td className="p-3 text-xs">{getTariffSource(extractedMatrix, tariff).resolutionCode}<br />{getTariffSource(extractedMatrix, tariff).effectiveDate}{getTariffSource(extractedMatrix,tariff).fieldSources && <ul className="mt-2 space-y-1">{Object.entries(getTariffSource(extractedMatrix,tariff).fieldSources!).map(([field,source])=><li key={field}>{tariffSourceFieldLabel(field)}: {source.resolutionCode} · {source.effectiveDate}</li>)}</ul>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-zinc-300"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />He contrastado cargos, moneda, bloques y fechas con el documento.</label>
              {/* Botones de Aplicación */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#27272a]">
                <button
                  onClick={handleApplyLocal}
                  disabled={isSyncingCloud || !reviewConfirmed}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-[#3f3f46] text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-all cursor-pointer"
                >
                  Aplicar tarifas revisadas
                </button>
                <button
                  onClick={handleApplyAndSyncCloud}
                  disabled={isSyncingCloud || !reviewConfirmed || !syncSettings.authToken || ['LECTOR', 'VIEWER'].includes(syncSettings.currentUser?.role || '')}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {isSyncingCloud ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sincronizando en la Nube...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Aplicar & Sincronizar en la Nube</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
