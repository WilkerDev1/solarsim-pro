import React, { useState, useEffect, useMemo } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import {
  ShareProposalService,
  SharedProposalRecord,
  DEFAULT_WORKER_URL,
} from '../../../services/shareProposalService';
import { QRCodeSVG } from 'qrcode.react';
import {
  Globe,
  Cloud,
  ExternalLink,
  Copy,
  Check,
  Search,
  Trash2,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  QrCode,
  MessageSquare,
  Calendar,
  AlertTriangle,
  X,
  Download,
  RefreshCw,
  Eye,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const CloudflareProposalsSection: React.FC = () => {
  const {
    projects,
    setActiveProject,
    setActiveView,
    closeSettingsModal,
    sidebarTheme,
  } = useSimulationStore();
  const isDark = sidebarTheme === 'dark';

  // Estado de lista de propuestas
  const [history, setHistory] = useState<SharedProposalRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal de visualización de QR
  const [selectedQRRecord, setSelectedQRRecord] = useState<SharedProposalRecord | null>(null);

  // Configuración del Worker
  const [workerUrlInput, setWorkerUrlInput] = useState<string>(ShareProposalService.getWorkerUrl());
  const [showWorkerConfig, setShowWorkerConfig] = useState(false);
  const [testingWorker, setTestingWorker] = useState(false);
  const [workerTestResult, setWorkerTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Confirmaciones y avisos
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearExpiredConfirm, setShowClearExpiredConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cargar historial
  const loadHistory = () => {
    const list = ShareProposalService.getSharedHistory();
    setHistory(list);
  };

  useEffect(() => {
    loadHistory();

    // Escuchar actualizaciones reactivas si otra parte de la app comparte una propuesta
    const handleStorageUpdate = () => loadHistory();
    window.addEventListener('solarsim_shared_links_updated', handleStorageUpdate);

    // Ticker cada 60s para refrescar los contadores de tiempo restante
    const intervalId = setInterval(() => {
      loadHistory();
    }, 60000);

    return () => {
      window.removeEventListener('solarsim_shared_links_updated', handleStorageUpdate);
      clearInterval(intervalId);
    };
  }, []);

  // Mostrar mensaje toast temporal
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Copiar enlace al portapapeles
  const handleCopyLink = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    showToast('¡Enlace web copiado al portapapeles! 📋');
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Abrir enlace en el navegador
  const handleOpenBrowser = (url: string) => {
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  // Compartir por WhatsApp
  const handleShareWhatsApp = (record: SharedProposalRecord) => {
    const cleanPhone = (record.location || '').replace(/[^0-9]/g, '');
    const clientName = record.clientName || 'Cliente';
    const quoteNumber = record.quoteNumber || 'C-0001';
    const systemKWp = record.systemKWp ? record.systemKWp.toFixed(2) : 'N/A';

    const text = encodeURIComponent(
      `☀️ *Propuesta Solar Fotovoltaica (${systemKWp} kWp)*\n` +
      `Estimado/a ${clientName}, le comparto nuevamente el enlace web interactivo a su propuesta técnica y económica (Cotización #${quoteNumber}):\n\n` +
      `🔗 ${record.shareUrl}\n\n` +
      `_Nota: Enlace web temporal generado mediante Cloudflare Workers._`
    );

    const whatsappUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    handleOpenBrowser(whatsappUrl);
  };

  // Eliminar un registro individual
  const handleDeleteRecord = (id: string) => {
    ShareProposalService.deleteSharedRecord(id);
    setDeleteConfirmId(null);
    loadHistory();
    showToast('Enlace eliminado del historial.');
  };

  // Limpiar todos los expirados
  const handleClearExpired = () => {
    const count = ShareProposalService.clearExpiredRecords();
    setShowClearExpiredConfirm(false);
    loadHistory();
    showToast(`Se eliminaron ${count} enlaces expirados del historial.`);
  };

  // Guardar URL del Worker
  const handleSaveWorkerUrl = () => {
    ShareProposalService.setWorkerUrl(workerUrlInput);
    showToast('URL de Cloudflare Worker actualizada exitosamente.');
    setShowWorkerConfig(false);
  };

  // Probar conexión al Worker
  const handleTestWorker = async () => {
    setTestingWorker(true);
    setWorkerTestResult(null);
    try {
      const res = await ShareProposalService.testWorkerConnection(workerUrlInput);
      setWorkerTestResult({
        tested: true,
        success: res.success,
        message: res.message,
        latencyMs: res.latencyMs,
      });
    } catch (err: any) {
      setWorkerTestResult({
        tested: true,
        success: false,
        message: err?.message || 'Error al conectar con Cloudflare.',
      });
    } finally {
      setTestingWorker(false);
    }
  };

  // Cargar proyecto en el simulador
  const handleOpenProjectInSimulator = (projectId: string) => {
    const found = projects.find((p) => p.id === projectId);
    if (found) {
      setActiveProject(projectId);
      setActiveView('simulator');
      closeSettingsModal();
    } else {
      showToast('El proyecto original no se encuentra en el catálogo local.');
    }
  };

  // Filtrado y estadísticas
  const { activeCount, expiredCount, filteredRecords } = useMemo(() => {
    const now = new Date().getTime();
    let active = 0;
    let expired = 0;

    history.forEach((rec) => {
      const exp = new Date(rec.expiresAt).getTime();
      if (exp > now) {
        active++;
      } else {
        expired++;
      }
    });

    const filtered = history.filter((rec) => {
      const isExp = new Date(rec.expiresAt).getTime() <= now;

      // Filtro de estado
      if (statusFilter === 'active' && isExp) return false;
      if (statusFilter === 'expired' && !isExp) return false;

      // Filtro de búsqueda
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        rec.clientName?.toLowerCase().includes(q) ||
        rec.projectCode?.toLowerCase().includes(q) ||
        rec.quoteNumber?.toLowerCase().includes(q) ||
        rec.companyName?.toLowerCase().includes(q) ||
        rec.shareUrl?.toLowerCase().includes(q) ||
        rec.id?.toLowerCase().includes(q)
      );
    });

    return {
      activeCount: active,
      expiredCount: expired,
      filteredRecords: filtered,
    };
  }, [history, statusFilter, searchQuery]);

  // Descargar código QR como PNG
  const handleDownloadQRPng = () => {
    if (!selectedQRRecord) return;
    const svgElement = document.getElementById('qr-code-svg-element') as SVGSVGElement | null;
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `QR-Propuesta-${selectedQRRecord.quoteNumber || selectedQRRecord.projectCode}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        showToast('Código QR descargado en PNG 📥');
      }
    };

    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  return (
    <section id="sec-cloudflare" className="flex flex-col gap-6 scroll-mt-6">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 🌐 Encabezado de Sección */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-[#27272a]">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400 border border-orange-500/30">
              <Globe className="w-4 h-4" />
            </span>
            <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Propuestas Web (Cloudflare Workers)
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-md font-mono font-bold bg-orange-500/10 text-orange-600 dark:text-orange-300 border border-orange-500/30">
              KV Serverless
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Historial de propuestas web interactivas generadas en Cloudflare KV, control de vigencia y tiempo de actividad restante.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowWorkerConfig(!showWorkerConfig)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showWorkerConfig
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-600 dark:text-orange-300'
                : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Configurar Worker</span>
            {showWorkerConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* 📊 Cuadrícula de Métricas y KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 block mb-1">
            Total Enlaces Creados
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
              {history.length}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">propuestas</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Enlaces Activos (Vigentes)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {activeCount}
            </span>
            <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">en la nube</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-slate-400" />
            Enlaces Expirados
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-600 dark:text-zinc-400 font-mono">
              {expiredCount}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-500">vencidos</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 block mb-1">
            Endpoint Cloudflare
          </span>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-mono font-bold text-orange-600 dark:text-orange-400 truncate max-w-[130px]" title={ShareProposalService.getWorkerUrl()}>
              {ShareProposalService.getWorkerUrl().replace(/^https?:\/\//, '')}
            </span>
            <button
              type="button"
              onClick={handleTestWorker}
              disabled={testingWorker}
              className="p-1 rounded-md text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 transition-colors cursor-pointer"
              title="Probar Conexión"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingWorker ? 'animate-spin text-orange-500' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ⚙️ Cajón de Configuración del Worker (Colapsable) */}
      {showWorkerConfig && (
        <div className="p-5 rounded-2xl border border-orange-500/30 bg-orange-500/5 dark:bg-orange-950/20 shadow-xs flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-orange-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Ajustes de Red & Endpoint de Cloudflare Worker
              </h4>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              Default: {DEFAULT_WORKER_URL}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Globe className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={workerUrlInput}
                onChange={(e) => setWorkerUrlInput(e.target.value)}
                placeholder="https://propuesta.electsun.net"
                className="w-full pl-10 pr-3 py-2 rounded-xl text-xs font-mono border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#121214] text-slate-900 dark:text-zinc-100 outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestWorker}
                disabled={testingWorker}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-orange-500/40 text-orange-600 dark:text-orange-300 hover:bg-orange-500/10 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingWorker ? 'animate-spin' : ''}`} />
                <span>Probar</span>
              </button>

              <button
                type="button"
                onClick={handleSaveWorkerUrl}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-xs cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>

          {workerTestResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border ${
                workerTestResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {workerTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <span>{workerTestResult.message}</span>
              </div>
              {workerTestResult.latencyMs !== undefined && (
                <span className="font-mono text-[10px] opacity-75">
                  Latencia: {workerTestResult.latencyMs}ms
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 🔍 Barra de Búsqueda y Filtros de Estado */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Buscador */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, proyecto, cotización o ID..."
            className="w-full pl-9.5 pr-8 py-2 rounded-xl text-xs border border-slate-200/90 dark:border-[#27272a] bg-white dark:bg-[#18181b] text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtros de Pestañas */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1 rounded-xl bg-slate-100 dark:bg-[#141416] border border-slate-200/80 dark:border-[#27272a] flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-[#222226] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos ({history.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-[#222226] text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Activos ({activeCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('expired')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'expired'
                  ? 'bg-white dark:bg-[#222226] text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Expirados ({expiredCount})</span>
            </button>
          </div>

          {expiredCount > 0 && (
            <button
              type="button"
              onClick={() => setShowClearExpiredConfirm(true)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-900/50 hover:bg-rose-500/5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Eliminar del historial los enlaces ya vencidos"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Limpiar Expirados</span>
            </button>
          )}
        </div>
      </div>

      {/* 📋 Tabla Gráfica de Enlaces Creados */}
      <div className="border border-slate-200/90 dark:border-[#27272a] rounded-2xl bg-white dark:bg-[#18181b] shadow-xs overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400 flex items-center justify-center">
              <Globe className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {searchQuery
                  ? 'No se encontraron enlaces para esta búsqueda'
                  : statusFilter !== 'all'
                  ? `No hay propuestas en estado "${statusFilter}"`
                  : 'Aún no has generado propuestas web en Cloudflare'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md">
                {searchQuery
                  ? 'Prueba modificando el término de búsqueda o limpiando los filtros de estado.'
                  : 'Al pulsar "Compartir" en cualquier propuesta desde el visor PDF o desde las opciones del proyecto, se generará un enlace interactivo con código QR que quedará registrado aquí.'}
              </p>
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Limpiar Búsqueda
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#141416] text-[11px] uppercase tracking-wider font-bold text-slate-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Propuesta / Cliente</th>
                  <th className="py-3 px-4">Enlace Web & Acceso</th>
                  <th className="py-3 px-4">Emisión & Expiración</th>
                  <th className="py-3 px-4">Estado & Tiempo Restante</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#24242a] text-xs">
                {filteredRecords.map((record) => {
                  const timeInfo = ShareProposalService.getRemainingTime(record.createdAt, record.expiresAt);
                  const isCopied = copiedId === record.id;
                  const projectInStore = projects.find((p) => p.id === record.projectId);

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#1f1f24] transition-colors group"
                    >
                      {/* 1. Propuesta / Cliente */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 dark:text-white text-xs truncate max-w-[220px]">
                              {record.clientName || 'Cliente Sin Nombre'}
                            </span>
                            {record.companyName && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                • {record.companyName}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-mono font-bold text-[10px]">
                              {record.projectCode}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono font-semibold text-[10px]">
                              {record.quoteNumber}
                            </span>
                            {record.systemKWp > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-semibold text-[10px]">
                                {record.systemKWp.toFixed(2)} kWp
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Enlace Web & Acceso Rápido */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-orange-600 dark:text-orange-400 underline decoration-orange-500/30 truncate max-w-[180px]" title={record.shareUrl}>
                              /p/{record.id}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(record.shareUrl, record.id)}
                              className={`p-1 rounded-md transition-colors cursor-pointer ${
                                isCopied
                                  ? 'bg-emerald-500 text-white'
                                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
                              }`}
                              title={isCopied ? '¡Copiado!' : 'Copiar URL completa'}
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenBrowser(record.shareUrl)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                              title="Abrir propuesta interactiva en el navegador"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedQRRecord(record)}
                              className="p-1 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                              title="Ver código QR para escanear con móvil"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleShareWhatsApp(record)}
                              className="p-1 rounded-md text-slate-400 hover:text-green-500 hover:bg-green-500/10 transition-colors cursor-pointer"
                              title="Reenviar por WhatsApp con mensaje predeterminado"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* 3. Fechas de Emisión y Expiración */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-zinc-300">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>
                              {new Date(record.createdAt).toLocaleDateString('es-DO', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Expira:{' '}
                            {new Date(record.expiresAt).toLocaleDateString('es-DO', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </div>
                      </td>

                      {/* 4. Estado & Barra de Tiempo Restante */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                timeInfo.isExpired
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  : timeInfo.color === 'rose'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {!timeInfo.isExpired && (
                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                              )}
                              <span>{timeInfo.badgeText}</span>
                            </span>

                            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-zinc-400">
                              {timeInfo.formattedText}
                            </span>
                          </div>

                          {/* Barra de progreso de vigencia */}
                          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                timeInfo.isExpired
                                  ? 'bg-rose-500 w-full'
                                  : timeInfo.color === 'rose'
                                  ? 'bg-rose-500'
                                  : timeInfo.color === 'amber'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${timeInfo.isExpired ? 100 : timeInfo.percentRemaining}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 5. Acciones */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {projectInStore && (
                            <button
                              type="button"
                              onClick={() => handleOpenProjectInSimulator(record.projectId)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                              title="Abrir este proyecto en el Simulador"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(record.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Eliminar este enlace del historial"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 📱 Modal Popover de Código QR */}
      {selectedQRRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] p-6 shadow-2xl flex flex-col items-center text-center gap-4 relative">
            <button
              type="button"
              onClick={() => setSelectedQRRecord(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-2 rounded-2xl bg-orange-500/10 text-orange-500 dark:text-orange-400">
              <QrCode className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                {selectedQRRecord.clientName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {selectedQRRecord.projectCode} • Cotización {selectedQRRecord.quoteNumber}
              </p>
            </div>

            {/* Renderizado de Código QR */}
            <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-100 flex items-center justify-center">
              <QRCodeSVG
                id="qr-code-svg-element"
                value={selectedQRRecord.shareUrl}
                size={180}
                level="M"
                includeMargin={false}
              />
            </div>

            <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed px-4">
              Escanea este código QR con la cámara de cualquier teléfono móvil para abrir la propuesta interactiva web.
            </p>

            <div className="grid grid-cols-2 gap-2 w-full pt-1">
              <button
                type="button"
                onClick={handleDownloadQRPng}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar PNG</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleOpenBrowser(selectedQRRecord.shareUrl);
                  setSelectedQRRecord(null);
                }}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-500 text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Abrir Web</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ Diálogo de Confirmación para Eliminar Registro Individual */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/40 bg-white dark:bg-[#18181b] p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  ¿Eliminar del Historial?
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Esta acción no cancela el enlace en Cloudflare KV si aún está vigente, pero lo removerá de tu lista local.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRecord(deleteConfirmId)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ Diálogo de Confirmación para Limpiar Expirados */}
      {showClearExpiredConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/40 bg-white dark:bg-[#18181b] p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  ¿Limpiar Enlaces Expirados?
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Se removerán del historial todas las propuestas cuya fecha de vigencia haya terminado ({expiredCount} enlaces).
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearExpiredConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClearExpired}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
              >
                Limpiar {expiredCount} Expirados
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
