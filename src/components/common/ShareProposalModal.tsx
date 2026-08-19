import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Clock,
  Settings,
  AlertCircle,
  RefreshCw,
  QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ProjectSimulation, FinancialSummaryResult } from '../../types';
import { ShareProposalService, ShareResult, DEFAULT_WORKER_URL } from '../../services/shareProposalService';
import { useSimulationStore } from '../../store/useSimulationStore';

interface ShareProposalModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  isDark?: boolean;
  project?: ProjectSimulation;
  summary?: FinancialSummaryResult;
}

export const ShareProposalModal: React.FC<ShareProposalModalProps> = (props) => {
  const store = useSimulationStore();
  const isOpen = props.isOpen !== undefined ? props.isOpen : store.isShareModalOpen;
  const onClose = props.onClose || store.closeShareModal;
  const isDark = props.isDark !== undefined ? props.isDark : store.sidebarTheme === 'dark';
  const project = props.project || store.getActiveProject();
  const summary = props.summary || store.getFinancialSummary();

  const [validityDays, setValidityDays] = useState<number>(7);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [workerUrl, setWorkerUrl] = useState<string>(ShareProposalService.getWorkerUrl());

  useEffect(() => {
    if (isOpen) {
      // Check if there is an active cached share link for this project
      const cached = ShareProposalService.getLastSharedInfo(project.id);
      if (cached) {
        setShareResult({
          success: true,
          id: cached.id,
          shareUrl: cached.shareUrl,
          expiresAt: cached.expiresAt,
          validityDays: cached.validityDays,
        });
        setValidityDays(cached.validityDays || 7);
      } else {
        setShareResult(null);
      }
      setWorkerUrl(ShareProposalService.getWorkerUrl());
      setCopied(false);
      setShowSettings(false);
    }
  }, [isOpen, project.id]);

  if (!isOpen) return null;

  const handleGenerateLink = async () => {
    setIsLoading(true);
    setCopied(false);
    try {
      const result = await ShareProposalService.shareProposal(
        project,
        summary,
        validityDays,
        workerUrl
      );
      setShareResult(result);
    } catch (err: any) {
      setShareResult({
        success: false,
        error: err?.message || 'Error inesperado al conectar con el servicio.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareResult?.shareUrl) return;
    navigator.clipboard.writeText(shareResult.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenBrowser = () => {
    if (!shareResult?.shareUrl) return;
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(shareResult.shareUrl);
    } else {
      window.open(shareResult.shareUrl, '_blank');
    }
  };

  const handleSaveWorkerUrl = () => {
    ShareProposalService.setWorkerUrl(workerUrl);
    setShowSettings(false);
  };

  const systemKWp = Number(summary?.systemCapacityKWp || 0).toFixed(2);
  const clientName = project.client?.name || 'Cliente';
  const quoteNumber = project.client?.quoteNumber || 'C-0001';
  const cleanClientPhone = (project.client?.contactPhone || '').replace(/[^0-9]/g, '');

  const whatsappText = encodeURIComponent(
    `☀️ *Propuesta Solar Fotovoltaica (${systemKWp} kWp)*\n` +
    `Estimado/a ${clientName}, le comparto el enlace web interactivo a su propuesta técnica y económica (Cotización #${quoteNumber}):\n\n` +
    `🔗 ${shareResult?.shareUrl || ''}\n\n` +
    `_Nota: Este enlace web interactivo tiene una vigencia temporal de ${validityDays} días._`
  );

  const whatsappUrl = cleanClientPhone
    ? `https://wa.me/${cleanClientPhone}?text=${whatsappText}`
    : `https://wa.me/?text=${whatsappText}`;

  const formattedExpiration = shareResult?.expiresAt
    ? new Date(shareResult.expiresAt).toLocaleDateString('es-DO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden transition-all flex flex-col ${
          isDark
            ? 'bg-[#14141a] border-[#2a2a36] text-zinc-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-[#242432] bg-[#101015]' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-950/40">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
                Compartir Propuesta Web
                <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                  Cloudflare
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {clientName} • {systemKWp} kWp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showSettings
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : isDark
                  ? 'border-[#2e2e3e] text-zinc-400 hover:text-zinc-200 hover:bg-[#20202c]'
                  : 'border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Configurar servidor Cloudflare"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#2e2e3e] text-zinc-400 hover:text-white hover:bg-[#20202c]'
                  : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Settings Collapsible (Worker URL) */}
        {showSettings && (
          <div
            className={`p-4 border-b text-xs space-y-2.5 animate-in slide-in-from-top-2 duration-150 ${
              isDark ? 'bg-[#181822] border-[#2a2a36]' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300">URL del Worker Cloudflare:</span>
              <button
                onClick={() => setWorkerUrl(DEFAULT_WORKER_URL)}
                className="text-[11px] text-emerald-500 hover:underline cursor-pointer"
              >
                Restablecer por defecto
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={workerUrl}
                onChange={(e) => setWorkerUrl(e.target.value)}
                placeholder="https://tu-worker.workers.dev"
                className={`flex-1 px-3 py-2 rounded-xl font-mono text-xs border focus:outline-hidden focus:ring-1 focus:ring-emerald-500 ${
                  isDark
                    ? 'bg-[#101015] border-[#2e2e3e] text-zinc-200'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              />
              <button
                onClick={handleSaveWorkerUrl}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Validity Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Tiempo de Vigencia del Enlace
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[3, 7, 15, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setValidityDays(days)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    validityDays === days
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-950/40 scale-[1.02]'
                      : isDark
                      ? 'bg-[#1a1a24] border-[#2a2a36] text-zinc-400 hover:text-zinc-200 hover:bg-[#222230]'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {days} Días
                  {days === 7 && <span className="block text-[9px] font-normal opacity-80 mt-0.5">Recomendado</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Action to Generate or Result */}
          {!shareResult?.success ? (
            <div className="pt-2">
              {shareResult?.error && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs mb-4 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{shareResult.error}</div>
                </div>
              )}

              <button
                onClick={handleGenerateLink}
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Publicando en Cloudflare Workers...</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Generar Enlace Web y Código QR ({validityDays} Días)</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* QR Code Card */}
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                <div className="p-3 bg-white rounded-2xl shadow-lg shrink-0 flex items-center justify-center">
                  <QRCodeSVG
                    value={shareResult.shareUrl || ''}
                    size={130}
                    level="M"
                    includeMargin={false}
                  />
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                  <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-800/80 text-emerald-400 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Enlace Activo
                  </div>
                  <h4 className="text-sm font-bold text-white">Escaneo Instantáneo</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    El cliente puede escanear este código QR con la cámara de su teléfono móvil para ver la propuesta interactiva.
                  </p>
                  {formattedExpiration && (
                    <p className="text-[11px] text-slate-500 font-mono pt-1">
                      Expira: {formattedExpiration}
                    </p>
                  )}
                </div>
              </div>

              {/* URL Input with Copy Button */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-400">
                  Enlace Público Compartible:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareResult.shareUrl}
                    className={`flex-1 px-3.5 py-2.5 rounded-xl font-mono text-xs border focus:outline-hidden ${
                      isDark
                        ? 'bg-[#101015] border-[#2e2e3e] text-emerald-400'
                        : 'bg-slate-50 border-slate-300 text-emerald-700 font-bold'
                    }`}
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : isDark
                        ? 'bg-[#20202c] border border-[#343444] text-zinc-200 hover:bg-[#282838] hover:text-white'
                        : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* WhatsApp & Browser Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <MessageCircle className="w-4 h-4 fill-current" />
                  <span>Enviar por WhatsApp</span>
                </a>

                <button
                  onClick={handleOpenBrowser}
                  className={`py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                    isDark
                      ? 'bg-[#1c1c26] border-[#303042] text-zinc-200 hover:bg-[#242432] hover:text-white'
                      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <ExternalLink className="w-4 h-4 text-emerald-400" />
                  <span>Abrir en Navegador</span>
                </button>
              </div>

              {/* Regenerate Button */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleGenerateLink}
                  disabled={isLoading}
                  className="text-xs text-slate-500 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Regenerar con nueva vigencia ({validityDays} días)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
