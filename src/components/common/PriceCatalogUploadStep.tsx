import React from "react";
import { Sparkles, UploadCloud, FileText, Building2, RefreshCw } from "lucide-react";

interface PriceCatalogUploadStepProps {
  isDark: boolean;
  existingSupplierNames: string[];
  manualSupplierName: string;
  setManualSupplierName: React.Dispatch<React.SetStateAction<string>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  selectedFile: File | null;
  fileBase64: string | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleStartScan: () => void;
  isProcessing: boolean;
  progressStatus: string;
}

/** Step 1 of the price-list scanner: supplier name, file drop zone and scan button. */
export const PriceCatalogUploadStep: React.FC<PriceCatalogUploadStepProps> = ({
  isDark,
  existingSupplierNames,
  manualSupplierName,
  setManualSupplierName,
  fileInputRef,
  selectedFile,
  fileBase64,
  handleFileChange,
  handleStartScan,
  isProcessing,
  progressStatus,
}) => (
    /* PASO 1: SUBIR ARCHIVO Y ESPECIFICAR PROVEEDOR */
    <div className="space-y-4">
      {/* Selector / Input de Proveedor */}
      <div
        className={`p-4 rounded-xl border space-y-3 bg-slate-50 border-slate-200 dark:bg-[#1e1e2c] dark:border-[#323246]`}
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
            className={`flex-1 border rounded-lg px-3 py-2 text-xs font-semibold bg-white border-slate-300 text-slate-900 dark:bg-[#14141c] dark:border-[#38384a] dark:text-white`}
          />
          {existingSupplierNames.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value)
                  setManualSupplierName(e.target.value);
              }}
              className={`border rounded-lg px-3 py-2 text-xs font-semibold bg-white border-slate-300 text-slate-700 dark:bg-[#14141c] dark:border-[#38384a] dark:text-zinc-300`}
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
        <p
          className={`text-[11px] text-slate-500 dark:text-zinc-400`}
        >
          * Si lo dejas vacío, la IA intentará detectarlo
          automáticamente en el membrete del documento.
        </p>
      </div>

      {/* Dropzone de Archivo */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center gap-3 ${
          selectedFile
            ? "border-purple-500/50 bg-purple-500/5"
            : isDark
              ? "border-zinc-700 hover:border-purple-500/50 bg-[#14141c] hover:bg-[#181824]"
              : "border-slate-300 hover:border-purple-500/50 bg-slate-50 hover:bg-purple-50/20"
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
              <p className="font-extrabold text-sm text-purple-400">
                {selectedFile.name}
              </p>
              <p
                className={`text-[11px] mt-0.5 text-slate-500 dark:text-zinc-400`}
              >
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Clic
                para cambiar archivo
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
                Arrastra tu archivo PDF o Imagen de cotización / lista
                de precios
              </p>
              <p
                className={`text-[11px] mt-1 text-slate-500 dark:text-zinc-400`}
              >
                Soporta listas de distribuidores en PDF, capturas de
                pantalla o facturas proforma (hasta 20MB)
              </p>
            </div>
          </>
        )}
      </div>

      {/* Botón de Escanear */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={!selectedFile || !fileBase64 || isProcessing}
          onClick={handleStartScan}
          className="px-5 py-2.5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{progressStatus || "Analizando con IA..."}</span>
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
);
