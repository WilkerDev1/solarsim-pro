import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface AIInvoiceErrorStateProps {
  isDark: boolean;
  errorMsg: string | null;
  handleResetDocument: () => void;
  openAISettingsModal: () => void;
}

export const AIInvoiceErrorState: React.FC<AIInvoiceErrorStateProps> = ({
  isDark,
  errorMsg,
  handleResetDocument,
  openAISettingsModal,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <div className="space-y-1 max-w-md">
        <h4 className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
          No se pudo procesar la factura
        </h4>
        <p className="text-xs text-rose-400">{errorMsg}</p>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleResetDocument}
          className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
            isDark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-slate-300 hover:bg-slate-100'
          }`}
        >
          Probar con otro archivo
        </button>
        <button
          onClick={openAISettingsModal}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shadow-xs"
        >
          Revisar API Key
        </button>
      </div>
    </div>
  );
};
