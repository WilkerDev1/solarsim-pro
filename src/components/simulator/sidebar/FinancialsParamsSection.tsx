import React from 'react';
import { ProjectSimulation, FinancialParams } from '../../../types';
import { Landmark, ChevronDown } from 'lucide-react';

interface FinancialsParamsSectionProps {
  project: ProjectSimulation;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  updateFinancials: (financials: Partial<FinancialParams>) => void;
}

export const FinancialsParamsSection: React.FC<FinancialsParamsSectionProps> = ({
  project,
  isOpen,
  onToggle,
  isDark,
  updateFinancials,
}) => {
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        isDark ? 'border-[#27272a] bg-[#1a1a24]' : 'border-slate-200 bg-white shadow-xs'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
          isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>5. Finanzas e Incentivos (Ley 57-07)</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-500' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`p-3.5 pt-2 space-y-3 border-t ${
            isDark ? 'border-[#27272a] bg-[#14141c]/50' : 'border-slate-100 bg-slate-50/50'
          }`}
        >
          <label className="flex items-center justify-between cursor-pointer group">
            <span
              className={`text-xs font-medium transition-colors ${
                isDark ? 'text-zinc-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'
              }`}
            >
              Aplicar Ley 57-07 (Crédito ISR 40%)
            </span>
            <input
              type="checkbox"
              checked={project.financials.applyLey5707}
              onChange={(e) => updateFinancials({ applyLey5707: e.target.checked })}
              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span
              className={`text-xs font-medium transition-colors ${
                isDark ? 'text-zinc-300 group-hover:text-white' : 'text-slate-600 group-hover:text-slate-900'
              }`}
            >
              Exoneración ITBIS 100% (18%)
            </span>
            <input
              type="checkbox"
              checked={project.financials.applyITBISExemption}
              onChange={(e) => updateFinancials({ applyITBISExemption: e.target.checked })}
              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
            />
          </label>

          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-600'}`}>
              Tasa de Descuento (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={project.financials.discountRatePct}
              onChange={(e) => updateFinancials({ discountRatePct: parseFloat(e.target.value) || 0 })}
              className={`w-full border rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-[#27272a] border-[#3f3f46] text-zinc-100'
                  : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );
};
