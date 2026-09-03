import React from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { FilePreview } from '../types';

interface AIInvoiceLoadingStateProps {
  isDark: boolean;
  selectedFile: FilePreview | null;
}

export const AIInvoiceLoadingState: React.FC<AIInvoiceLoadingStateProps> = ({
  isDark,
  selectedFile,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
          <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
          <Sparkles className="w-4 h-4" />
        </div>
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h4 className={`font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Smart Proposal Studio en Ejecución...
        </h4>
        <p className="text-xs text-emerald-400 font-semibold font-mono animate-pulse">
          Analizando consumos y emparejando catálogo de equipos...
        </p>
        {selectedFile && (
          <p className={`text-[11px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
            Documento: <span className="font-mono">{selectedFile.name}</span>
          </p>
        )}
      </div>
    </div>
  );
};
