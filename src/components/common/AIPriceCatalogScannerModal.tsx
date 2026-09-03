import React, { useState, useMemo, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import {
  GeminiPriceCatalogService,
  ScanPriceCatalogOptions,
} from '../../services/geminiPriceCatalogService';
import {
  ExtractedPriceCatalogResult,
  ExtractedPriceCatalogItem,
  EquipmentType,
  SolarEquipmentItem,
} from '../../types/equipment';
import {
  X,
  Sparkles,
  UploadCloud,
  FileText,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
  Building2,
  RefreshCw,
  Search,
  DollarSign,
  ArrowRight,
  TrendingDown,
  Layers,
  ChevronDown,
  Cpu,
} from 'lucide-react';

export const AIPriceCatalogScannerModal: React.FC = () => {
  const {
    isAIPriceCatalogModalOpen,
    closeAIPriceCatalogModal,
    equipmentCatalog,
    batchUpdateSupplierPrices,
    addEquipmentItem,
    geminiApiKey,
    geminiModel,
    setGeminiModel,
    sidebarTheme,
    getActiveProject,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>('');
  const [manualSupplierName, setManualSupplierName] = useState('');
  const [assignedSupplierName, setAssignedSupplierName] = useState('');
  const [isEditingSupplierName, setIsEditingSupplierName] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ExtractedPriceCatalogResult | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lista de proveedores ya existentes en el catálogo para sugerencias rápidas
  const existingSupplierNames = useMemo(() => {
    const setNames = new Set<string>();
    equipmentCatalog.forEach((item) => {
      (item.supplierPrices || []).forEach((sp) => {
        if (sp.supplierName) setNames.add(sp.supplierName);
      });
    });
    return Array.from(setNames).sort();
  }, [equipmentCatalog]);

  const applicableItemsCount = useMemo(() => {
    if (!scanResult) return 0;
    return scanResult.items.filter(
      (item) => selectedItemIds.has(item.id) && item.action !== 'ignore'
    ).length;
  }, [scanResult, selectedItemIds]);

  const newItemsCount = useMemo(() => {
    if (!scanResult) return 0;
    return scanResult.items.filter((item) => !item.matchedEquipmentId).length;
  }, [scanResult]);

  if (!isAIPriceCatalogModalOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Aceptamos PDF, PNG, JPEG, WEBP
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Por favor selecciona un archivo PDF o una imagen (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('El archivo no debe exceder los 20MB.');
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
    setFileMimeType(file.type || 'application/pdf');

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      setFileBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleStartScan = async () => {
    if (!fileBase64 || !selectedFile) {
      setErrorMessage('Selecciona primero un documento de cotización o lista de precios.');
      return;
    }

    if (!geminiApiKey) {
      setErrorMessage('Falta la Clave API de Gemini. Configúrala en Ajustes > Integraciones & IA.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProgressStatus('Iniciando lectura multimodal con Gemini...');

    try {
      const project = getActiveProject();
      const dopRate = project?.rates?.usdExchangeRate || 60.0;

      const result = await GeminiPriceCatalogService.scanAndMatchPriceCatalog({
        fileBase64,
        mimeType: fileMimeType,
        fileName: selectedFile.name,
        apiKey: geminiApiKey,
        customModel: geminiModel,
        manualSupplierName: manualSupplierName.trim() || undefined,
        existingSuppliers: existingSupplierNames,
        currentCatalog: equipmentCatalog,
        dopExchangeRate: dopRate,
        onProgress: setProgressStatus,
      });

      setScanResult(result);

      // Si el usuario especificó un proveedor manual, usarlo.
      // Si no, y hay coincidencia con uno existente (>= 0.70), vincular con el existente automáticamente
      // para evitar duplicar proveedores al subir el mismo documento 2 veces.
      const initialAssigned =
        manualSupplierName.trim() ||
        result.matchedExistingSupplier ||
        result.detectedSupplierName ||
        'Proveedor General';

      setAssignedSupplierName(initialAssigned);
      setIsEditingSupplierName(false);

      // Marcar todos los ítems como seleccionados inicialmente
      const initialIds = new Set(result.items.map((i) => i.id));
      setSelectedItemIds(initialIds);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar la lista de precios.');
    } finally {
      setIsProcessing(false);
      setProgressStatus('');
    }
  };

  const handleToggleSelectAll = () => {
    if (!scanResult) return;
    if (selectedItemIds.size === scanResult.items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(scanResult.items.map((i) => i.id)));
    }
  };

  const handleToggleItemSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleUpdateItemMatch = (itemId: string, targetCatalogId: string) => {
    if (!scanResult) return;
    const targetEq = equipmentCatalog.find((e) => e.id === targetCatalogId);

    setScanResult({
      ...scanResult,
      items: scanResult.items.map((item) => {
        if (item.id === itemId) {
          if (targetCatalogId === '__ignore__') {
            return {
              ...item,
              matchedEquipmentId: undefined,
              matchedDisplayName: undefined,
              matchConfidence: 0,
              action: 'ignore' as const,
            };
          }
          if (targetCatalogId === '__create_new__') {
            return {
              ...item,
              matchedEquipmentId: undefined,
              matchedDisplayName: undefined,
              matchConfidence: 0,
              action: 'create_new' as const,
            };
          }
          return {
            ...item,
            matchedEquipmentId: targetCatalogId,
            matchedDisplayName: targetEq?.displayName || '',
            matchConfidence: 1.0,
            action: 'update_price' as const,
          };
        }
        return item;
      }),
    });

    if (targetCatalogId === '__ignore__') {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    } else {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
    }
  };

  const handleIgnoreAllNew = () => {
    if (!scanResult) return;
    const nextItemIds = new Set(selectedItemIds);
    const updatedItems = scanResult.items.map((item) => {
      if (!item.matchedEquipmentId || item.action === 'create_new') {
        nextItemIds.delete(item.id);
        return {
          ...item,
          action: 'ignore' as const,
        };
      }
      return item;
    });
    setScanResult({ ...scanResult, items: updatedItems });
    setSelectedItemIds(nextItemIds);
  };

  const handleCreateAllNew = () => {
    if (!scanResult) return;
    const nextItemIds = new Set(selectedItemIds);
    const updatedItems = scanResult.items.map((item) => {
      if (!item.matchedEquipmentId || item.action === 'ignore') {
        nextItemIds.add(item.id);
        return {
          ...item,
          action: 'create_new' as const,
        };
      }
      return item;
    });
    setScanResult({ ...scanResult, items: updatedItems });
    setSelectedItemIds(nextItemIds);
  };

  const handleApplyPricesToCatalog = () => {
    if (!scanResult) return;

    const supplier =
      assignedSupplierName.trim() ||
      manualSupplierName.trim() ||
      scanResult.detectedSupplierName ||
      'Proveedor General';
    const nowIso = new Date().toISOString();

    const updates: { equipmentId: string; supplierPrice: any }[] = [];

    scanResult.items.forEach((item) => {
      if (!selectedItemIds.has(item.id) || item.action === 'ignore') return;

      if (item.action === 'update_price' && item.matchedEquipmentId) {
        updates.push({
          equipmentId: item.matchedEquipmentId,
          supplierPrice: {
            id: `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            supplierName: supplier,
            priceUSD: item.priceUSD,
            currency: item.originalCurrency || 'USD',
            sku: item.sku,
            notes: item.notes,
            stockStatus: 'in_stock',
            updatedAt: nowIso,
            source: 'ai_scan',
          },
        });
      } else if (item.action === 'create_new') {
        // Si no existía y el usuario eligió crear nuevo equipo con su precio de proveedor inicial
        const newId = `eq-${item.equipmentType}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const newEq: SolarEquipmentItem = {
          id: newId,
          type: item.equipmentType,
          brand: item.brand || 'Fabricante',
          modelSeries: item.extractedModelName,
          displayName: item.extractedModelName,
          category: item.equipmentType === 'panel' ? 'Módulo Solar' : item.equipmentType === 'inverter' ? 'Inversor' : 'Batería',
          isCustom: true,
          supplierPrices: [
            {
              id: `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              supplierName: supplier,
              priceUSD: item.priceUSD,
              currency: item.originalCurrency || 'USD',
              sku: item.sku,
              notes: item.notes,
              stockStatus: 'in_stock',
              updatedAt: nowIso,
              source: 'ai_scan',
            },
          ],
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        addEquipmentItem(newEq);
      }
    });

    if (updates.length > 0) {
      batchUpdateSupplierPrices(updates);
    }

    closeAIPriceCatalogModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
          isDark ? 'bg-[#181822] border-[#2e2e3e] text-zinc-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header */}
        <div
          className={`p-5 border-b flex items-start justify-between gap-3 ${
            isDark ? 'border-[#272736] bg-[#14141c]' : 'border-slate-100 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight flex items-center gap-2">
                Escáner Inteligente de Listas de Precios
                <span className="text-[10.5px] px-2.5 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" />
                  <span>IA: {geminiModel || 'gemini-3.7-flash'}</span>
                </span>
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Extrae modelos y precios de catálogos o cotizaciones de proveedores y compáralos con tu base de datos actual.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAIPriceCatalogModal}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-400' : 'border-slate-200 hover:bg-slate-100 text-slate-500'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!scanResult ? (
            /* PASO 1: SUBIR ARCHIVO Y ESPECIFICAR PROVEEDOR */
            <div className="space-y-4">
              {/* Selector / Input de Proveedor */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isDark ? 'bg-[#1e1e2c] border-[#323246]' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-400" />
                  <label className="text-xs font-bold uppercase tracking-wider">
                    Proveedor o Distribuidor de la Lista
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Escribe el nombre del proveedor (ej: Enersys RD, RAAS Solar, Fersan...)"
                    value={manualSupplierName}
                    onChange={(e) => setManualSupplierName(e.target.value)}
                    className={`flex-1 border rounded-lg px-3 py-2 text-xs font-semibold ${
                      isDark ? 'bg-[#14141c] border-[#38384a] text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  {existingSupplierNames.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) setManualSupplierName(e.target.value);
                      }}
                      className={`border rounded-lg px-3 py-2 text-xs font-semibold ${
                        isDark ? 'bg-[#14141c] border-[#38384a] text-zinc-300' : 'bg-white border-slate-300 text-slate-700'
                      }`}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        O seleccionar existente...
                      </option>
                      {existingSupplierNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  * Si lo dejas vacío, la IA intentará detectarlo automáticamente en el membrete del documento.
                </p>
              </div>

              {/* Selector de Modelo Global de IA */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${
                  isDark ? 'bg-[#181824] border-[#2c2c3e]' : 'bg-purple-50/50 border-purple-200/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold block">
                      Modelo Global Activo: <strong className="text-purple-400">{geminiModel || 'gemini-3.7-flash'}</strong>
                    </span>
                    <span className={`text-[10.5px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                      Se utilizará para extraer y comparar los precios de compra.
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center">
                  {[
                    { id: 'gemini-3.7-flash', label: '3.7 Flash' },
                    { id: 'gemini-2.5-flash', label: '2.5 Flash' },
                    { id: 'gemini-3.5-flash-lite', label: '3.5 Lite' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setGeminiModel(m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        geminiModel === m.id
                          ? 'bg-purple-600 border-purple-500 text-white shadow-xs'
                          : isDark
                          ? 'bg-[#14141c] border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                          : 'bg-white border-slate-300 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dropzone de Archivo */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-3 ${
                  selectedFile
                    ? 'border-purple-500/50 bg-purple-500/5'
                    : isDark
                    ? 'border-zinc-700 hover:border-purple-500/50 bg-[#14141c] hover:bg-[#181824]'
                    : 'border-slate-300 hover:border-purple-500/50 bg-slate-50 hover:bg-purple-50/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <>
                    <div className="p-3 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-extrabold text-sm text-purple-400">{selectedFile.name}</p>
                      <p className={`text-[11px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Clic para cambiar archivo
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                      <UploadCloud className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-zinc-200">
                        Arrastra tu archivo PDF o Imagen de cotización / lista de precios
                      </p>
                      <p className={`text-[11px] mt-1 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                        Soporta listas de distribuidores en PDF, capturas de pantalla o facturas proforma (hasta 20MB)
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Botón de Escanear */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={!selectedFile || isProcessing}
                  onClick={handleStartScan}
                  className="px-5 py-2.5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{progressStatus || 'Analizando con IA...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analizar Lista y Comparar Catálogo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* PASO 2: RESULTADOS Y CONFIRMACIÓN DE COINCIDENCIAS */
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Card de Identificación y Vinculación del Proveedor */}
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? 'bg-[#1a1a28] border-[#34344c]' : 'bg-white border-purple-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/40 dark:border-[#272736]">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Proveedor de la Lista / Factura
                      </span>
                      {scanResult.matchedExistingSupplier ? (
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Coincide en BD: {Math.round((scanResult.supplierMatchConfidence || 0.95) * 100)}%
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          Nuevo Proveedor
                        </span>
                      )}
                      <span className="text-[10.5px] px-2 py-0.5 rounded-full font-bold bg-zinc-700/30 text-zinc-300 border border-zinc-600/40">
                        {scanResult.items.length} equipos extraídos
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                      <span className={isDark ? 'text-zinc-400' : 'text-slate-500'}>Detectado en documento:</span>
                      <strong className="font-extrabold text-zinc-100 bg-zinc-800/60 px-2 py-0.5 rounded">
                        "{scanResult.detectedSupplierName}"
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-[11px] text-zinc-400 hidden sm:block">
                      <div>Moneda: <strong className="text-zinc-200">{scanResult.currencyDetected}</strong></div>
                      {scanResult.documentDate && <div>Fecha: <strong className="text-zinc-200">{scanResult.documentDate}</strong></div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScanResult(null);
                        setSelectedFile(null);
                      }}
                      className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Escanear otro</span>
                    </button>
                  </div>
                </div>

                {/* Asignación y Selección de Proveedor */}
                <div className={`mt-3 p-3 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isDark ? 'bg-[#12121c] border-[#272738]' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex-1 min-w-0">
                    <label className="text-[11px] font-bold text-zinc-300 block mb-1">
                      Asignar ofertas comerciales a este proveedor en el catálogo:
                    </label>

                    {isEditingSupplierName ? (
                      <div className="flex items-center gap-2 max-w-md">
                        <input
                          type="text"
                          value={assignedSupplierName}
                          onChange={(e) => setAssignedSupplierName(e.target.value)}
                          placeholder="Nombre del proveedor..."
                          className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border outline-none ${
                            isDark
                              ? 'bg-[#181824] border-purple-500/50 text-zinc-100'
                              : 'bg-white border-purple-400 text-slate-800'
                          }`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setIsEditingSupplierName(false)}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shrink-0"
                        >
                          Listo
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={
                            assignedSupplierName === scanResult.matchedExistingSupplier
                              ? '__matched__'
                              : assignedSupplierName === scanResult.detectedSupplierName
                              ? '__detected__'
                              : existingSupplierNames.includes(assignedSupplierName)
                              ? assignedSupplierName
                              : '__custom__'
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__matched__' && scanResult.matchedExistingSupplier) {
                              setAssignedSupplierName(scanResult.matchedExistingSupplier);
                            } else if (val === '__detected__') {
                              setAssignedSupplierName(scanResult.detectedSupplierName);
                            } else if (val === '__custom__') {
                              setIsEditingSupplierName(true);
                            } else {
                              setAssignedSupplierName(val);
                            }
                          }}
                          className={`text-xs font-extrabold rounded-lg px-2.5 py-1.5 border outline-none cursor-pointer max-w-full ${
                            isDark
                              ? 'bg-[#1e1e2c] border-[#38384a] text-zinc-100'
                              : 'bg-white border-slate-300 text-slate-800 shadow-2xs'
                          }`}
                        >
                          {scanResult.matchedExistingSupplier && (
                            <option value="__matched__">
                              ✓ Vincular con coincidencia: "{scanResult.matchedExistingSupplier}"
                            </option>
                          )}
                          <option value="__detected__">
                            {scanResult.matchedExistingSupplier
                              ? `Crear como nuevo proveedor: "${scanResult.detectedSupplierName}"`
                              : `Crear como nuevo proveedor: "${scanResult.detectedSupplierName}"`}
                          </option>
                          {existingSupplierNames.length > 0 && (
                            <optgroup label="Sincronizar con otro proveedor existente...">
                              {existingSupplierNames.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="__custom__">✎ Escribir otro nombre personalizado...</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => setIsEditingSupplierName(true)}
                          className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 underline cursor-pointer"
                        >
                          Editar nombre
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] text-zinc-400">
                    Proveedor asignado activo:{' '}
                    <strong className="text-emerald-400 font-mono font-bold block sm:inline">
                      {assignedSupplierName}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Tabla de Comparación y Coincidencias */}
              <div
                className={`border rounded-xl overflow-hidden ${
                  isDark ? 'border-[#2e2e40] bg-[#14141c]' : 'border-slate-200 bg-white shadow-xs'
                }`}
              >
                <div
                  className={`p-3 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-bold ${
                    isDark ? 'border-[#272736] bg-[#101016]' : 'border-slate-200 bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="cursor-pointer text-zinc-400 hover:text-zinc-200"
                        title="Seleccionar o deseleccionar todos"
                      >
                        {selectedItemIds.size === scanResult.items.length ? (
                          <CheckSquare className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <span>
                        EQUIPO EXTRAÍDO ({applicableItemsCount} de {scanResult.items.length} a aplicar)
                      </span>
                    </div>

                    {newItemsCount > 0 && (
                      <div className="flex items-center gap-1.5 text-[10.5px]">
                        <button
                          type="button"
                          onClick={handleIgnoreAllNew}
                          className={`px-2 py-0.5 rounded font-semibold border transition-all cursor-pointer ${
                            isDark
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-2xs'
                          }`}
                          title="No agregar ningún equipo nuevo al catálogo (solo actualizar los existentes)"
                        >
                          🚫 Omitir nuevos ({newItemsCount})
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateAllNew}
                          className="px-2 py-0.5 rounded font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 cursor-pointer"
                          title="Marcar todos los no coincidentes para agregarlos al catálogo"
                        >
                          + Crear nuevos
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-400 font-semibold">VINCULACIÓN CON CATÁLOGO / PRECIO</span>
                </div>

                <div className="divide-y divide-zinc-800/40 dark:divide-[#272736] max-h-[380px] overflow-y-auto">
                  {scanResult.items.map((item) => {
                    const isChecked = selectedItemIds.has(item.id) && item.action !== 'ignore';
                    const isIgnored = item.action === 'ignore';
                    const matchingCatalog = equipmentCatalog.filter((e) => e.type === item.equipmentType);

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-colors ${
                          isIgnored
                            ? isDark
                              ? 'opacity-40 bg-[#101015]'
                              : 'opacity-45 bg-slate-100/70'
                            : isChecked
                            ? isDark
                              ? 'bg-[#181824]'
                              : 'bg-white'
                            : isDark
                            ? 'opacity-50 bg-[#121218]'
                            : 'opacity-50 bg-slate-50'
                        }`}
                      >
                        {/* Checkbox y Nombre en Documento */}
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (isIgnored) {
                                handleUpdateItemMatch(item.id, '__create_new__');
                              } else {
                                handleToggleItemSelect(item.id);
                              }
                            }}
                            className="mt-0.5 cursor-pointer text-zinc-400 hover:text-zinc-200"
                            title={isIgnored ? 'Clic para reactivar este equipo' : 'Seleccionar'}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-extrabold text-xs ${isIgnored ? 'line-through text-zinc-500' : ''}`}>
                                {item.extractedModelName}
                              </span>
                              <span
                                className={`text-[9.5px] px-1.5 py-0.2 rounded uppercase font-mono font-bold ${
                                  item.equipmentType === 'panel'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : item.equipmentType === 'inverter'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                }`}
                              >
                                {item.equipmentType}
                              </span>
                            </div>
                            <div className={`text-[10.5px] mt-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                              {item.brand} {item.sku && `• SKU: ${item.sku}`} {item.notes && `• ${item.notes}`}
                            </div>
                          </div>
                        </div>

                        {/* Coincidencia y Selector de Catálogo */}
                        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1.5">
                              {isIgnored ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-700/30 text-zinc-400 border border-zinc-600/40">
                                  🚫 No agregar (Omitido)
                                </span>
                              ) : item.matchConfidence >= 0.7 && item.matchedEquipmentId ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  {Math.round(item.matchConfidence * 100)}% Coincidencia
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                  + Nuevo en Catálogo
                                </span>
                              )}
                            </div>

                            {/* Dropdown para corregir o cambiar equipo coincidente */}
                            <select
                              value={isIgnored ? '__ignore__' : (item.matchedEquipmentId || '__create_new__')}
                              onChange={(e) => handleUpdateItemMatch(item.id, e.target.value)}
                              className={`mt-1 max-w-[260px] text-xs font-semibold rounded-lg px-2 py-1 border outline-none cursor-pointer ${
                                isIgnored
                                  ? isDark
                                    ? 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                                    : 'bg-slate-200 border-slate-300 text-slate-500'
                                  : isDark
                                  ? 'bg-[#1e1e2c] border-[#38384a] text-zinc-200'
                                  : 'bg-slate-50 border-slate-300 text-slate-800'
                              }`}
                            >
                              <option value="__ignore__">🚫 No agregar al catálogo (Omitir)</option>
                              <option value="__create_new__">+ Crear como nuevo equipo</option>
                              <optgroup label="Vincular con equipo existente en catálogo">
                                {matchingCatalog.map((catItem) => (
                                  <option key={catItem.id} value={catItem.id}>
                                    {catItem.displayName}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>

                          {/* Precio en USD */}
                          <div className="text-right min-w-[90px]">
                            <span className={`text-sm font-extrabold font-mono block ${isIgnored ? 'text-zinc-500' : 'text-emerald-500'}`}>
                              ${item.priceUSD.toFixed(2)}
                            </span>
                            <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                              USD/ud
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botón de Aplicar Precios */}
              <div className="flex items-center justify-between pt-2">
                <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  Se actualizarán las ofertas comerciales para el proveedor{' '}
                  <strong className="text-emerald-400">{assignedSupplierName || manualSupplierName || scanResult.detectedSupplierName}</strong>.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeAIPriceCatalogModal}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={applicableItemsCount === 0}
                    onClick={handleApplyPricesToCatalog}
                    className="px-5 py-2.5 rounded-xl font-extrabold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-md disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Aplicar {applicableItemsCount} Precios al Catálogo</span>
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
