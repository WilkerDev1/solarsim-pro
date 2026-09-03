import React from 'react';
import {
  Sparkles,
  Settings,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Upload,
  Trash2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { FilePreview } from '../types';

interface AIInvoiceInitialConfigViewProps {
  isDark: boolean;
  isInsideProject: boolean;
  activeProject?: any;
  geminiApiKey: string;
  openAISettingsModal: () => void;
  selectedFile: FilePreview | null;
  setSelectedFile: (file: FilePreview | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  projectRequirementsPrompt: string;
  setProjectRequirementsPrompt: (val: string) => void;
  processSmartProposal: () => void;
  errorMsg: string | null;
}

export const AIInvoiceInitialConfigView: React.FC<AIInvoiceInitialConfigViewProps> = ({
  isDark,
  isInsideProject,
  geminiApiKey,
  openAISettingsModal,
  selectedFile,
  setSelectedFile,
  fileInputRef,
  handleDragOver,
  handleDrop,
  projectRequirementsPrompt,
  setProjectRequirementsPrompt,
  processSmartProposal,
  errorMsg,
}) => {
  return (
    <div className="flex-1 p-6 flex flex-col items-center justify-center gap-5 max-w-4xl mx-auto w-full">
      {/* Banner de aviso si no hay API Key */}
      {!geminiApiKey && (
        <div className="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-300">
          <Settings className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              Requiere una Google Gemini API Key activa para analizar facturas y hacer grounding de catálogo.
            </span>
            <button
              onClick={openAISettingsModal}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
            >
              <span>Configurar API Key gratuita</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Subtitle / Header banner */}
      <div className="text-center space-y-1 max-w-xl">
        <h3 className={`text-lg font-bold ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>
          {isInsideProject ? 'Completar Proyecto con IA' : 'Configuración de Propuesta Inteligente'}
        </h3>
        <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
          Carga la factura eléctrica y/o define las especificaciones del cliente para dimensionar automáticamente.
        </p>
      </div>

      {/* DUAL INPUT SECTION: Factura (Izquierda) + Requisitos Técnicos (Derecha) */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* TARJETA 1: Factura Eléctrica EDE */}
        <div
          className={`p-5 rounded-2xl border flex flex-col justify-between transition-all min-h-[320px] ${
            isDark ? 'bg-[#181822] border-[#2b2b3c]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              <FileText className="w-4 h-4 text-emerald-500" />
              1. Factura Eléctrica (EDE)
            </span>
            {selectedFile && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Cargada
              </span>
            )}
          </div>

          {!selectedFile ? (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`my-3 p-6 border-2 border-dashed rounded-xl flex-1 flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer transition-all ${
                isDark
                  ? 'border-[#38384c] hover:border-emerald-500 bg-[#121218] hover:bg-[#1b1b24]'
                  : 'border-slate-300 hover:border-emerald-600 bg-slate-50 hover:bg-emerald-50/40'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Upload className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                  Arrastra tu factura aquí
                </p>
                <p className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                  o haz clic para explorar tus archivos
                </p>
              </div>
            </div>
          ) : (
            <div className="my-3 flex-1 flex flex-col justify-between gap-3">
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  isDark ? 'bg-[#121218] border-emerald-500/40' : 'bg-emerald-50/60 border-emerald-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    {selectedFile.type.includes('pdf') ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {selectedFile.name}
                    </p>
                    <p className="text-[10px] font-mono text-emerald-500">
                      {(selectedFile.file.size / 1024).toFixed(1)} KB • Documento cargado
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      isDark ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Cambiar
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="p-1 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Quitar archivo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className={`p-3 rounded-xl border text-[11px] space-y-1.5 ${
                isDark ? 'bg-[#121218] border-zinc-800 text-zinc-400' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <p className="font-semibold text-zinc-300 dark:text-zinc-200 flex items-center gap-1.5 text-xs">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Extracción automática garantizada:
                </p>
                <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px] opacity-90">
                  <li>Historial de 12 meses de consumo (kWh)</li>
                  <li>Distribuidora (EDEESTE, EDESUR, EDENORTE, CEPM)</li>
                  <li>Titular, NIS / NIC, RNC y tarifa oficial SIE</li>
                </ul>
              </div>
            </div>
          )}

          <div className="pt-2.5 border-t border-slate-200 dark:border-[#2b2b3c] flex items-center justify-between text-[11px] text-zinc-500">
            <span>Formatos soportados:</span>
            <span className="font-mono text-zinc-400">PDF, PNG, JPG</span>
          </div>
        </div>

        {/* TARJETA 2: Requisitos y Alcance del Proyecto */}
        <div
          className={`p-5 rounded-2xl border flex flex-col justify-between transition-all min-h-[320px] ${
            isDark ? 'bg-[#181822] border-[#2b2b3c]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
              <FileText className="w-4 h-4 text-amber-500" />
              2. Alcance y Requisitos
            </span>
            {projectRequirementsPrompt.trim() && (
              <button
                type="button"
                onClick={() => setProjectRequirementsPrompt('')}
                className="text-[11px] font-semibold text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="my-3 flex-1 flex flex-col justify-between gap-2.5">
            <textarea
              rows={5}
              value={projectRequirementsPrompt}
              onChange={(e) => setProjectRequirementsPrompt(e.target.value)}
              placeholder={`Cliente: Giovanni Gottardo\n21 paneles Canadian Solar 615W\nInversor 16 kW split-phase\n2 baterías LiFePO4 16 kWh\nMargen de venta: 40%`}
              className={`w-full min-h-[120px] flex-1 p-3 rounded-xl border text-xs font-mono transition-all outline-none resize-none leading-relaxed ${
                isDark
                  ? 'bg-[#101016] border-[#38384c] text-zinc-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50'
                  : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/50'
              }`}
            />

            {/* Quick Example Buttons */}
            <div className="space-y-1">
              <span className={`text-[10px] font-semibold block ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                Plantillas de prueba:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setProjectRequirementsPrompt(
                      `Giovanni Gottardo.\n21 panel canadian solar 615w\n1 inversor lux power de 16 kw\n2 bateria hinaes de 16kw\nVenta 40%`
                    )
                  }
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-medium text-left transition-all cursor-pointer truncate ${
                    isDark
                      ? 'bg-[#14141c] hover:bg-[#1f1f2a] border-zinc-800 text-zinc-300 hover:text-white'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                  title="21 Paneles • Luxpower 16 kW • 2 Baterías • Margen 40%"
                >
                  21 Paneles • 16 kW • 2 Baterías
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setProjectRequirementsPrompt(
                      `Osia Moscoso\n11 kwp paneles Canadian 615w\n2 bateria de 16k weco\n1 weco 8 kw\nPorcentaje de venta 40%\nEquipos según disponibilidad y especificar que el sistema esta diseñado para 40kwh diario.`
                    )
                  }
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-medium text-left transition-all cursor-pointer truncate ${
                    isDark
                      ? 'bg-[#14141c] hover:bg-[#1f1f2a] border-zinc-800 text-zinc-300 hover:text-white'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                  }`}
                  title="11 kWp • Inversor 8 kW • 2 Baterías • 40 kWh/d"
                >
                  11 kWp • 8 kW • 2 Baterías
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-200 dark:border-[#2b2b3c] flex items-center justify-between text-[11px] text-zinc-500">
            <span>Grounding:</span>
            <span className="font-mono text-zinc-400">Catálogo de equipos y precios</span>
          </div>
        </div>
      </div>

      {/* ACTION BUTTON */}
      <div className="w-full max-w-md pt-1">
        <button
          type="button"
          onClick={processSmartProposal}
          disabled={!selectedFile && !projectRequirementsPrompt.trim()}
          className={`w-full py-3 px-6 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${
            !selectedFile && !projectRequirementsPrompt.trim()
              ? 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-500 border border-zinc-700/50'
              : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/30 active:scale-98'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>
            {selectedFile && projectRequirementsPrompt.trim()
              ? 'Generar Propuesta Inteligente ✨'
              : selectedFile
              ? 'Analizar Factura con IA ✨'
              : 'Diseñar Propuesta desde Requisitos ✨'}
          </span>
        </button>
      </div>

      {errorMsg && (
        <div className="mt-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 max-w-md">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
