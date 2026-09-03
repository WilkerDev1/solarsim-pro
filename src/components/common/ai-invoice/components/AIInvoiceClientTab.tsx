import React from 'react';
import { Bot } from 'lucide-react';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { RD_PROVINCES } from '../../../../data/rdProvinces';

interface AIInvoiceClientTabProps {
  isDark: boolean;
  extractedData: ExtractedInvoiceData;
  setExtractedData: React.Dispatch<React.SetStateAction<ExtractedInvoiceData | null>>;
}

export const AIInvoiceClientTab: React.FC<AIInvoiceClientTabProps> = ({
  isDark,
  extractedData,
  setExtractedData,
}) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Nombre del Titular / Razón Social
          </label>
          <input
            type="text"
            value={extractedData.clientName}
            onChange={(e) => setExtractedData({ ...extractedData, clientName: e.target.value })}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            NIC (No. Contrato)
          </label>
          <input
            type="text"
            value={extractedData.nic || ''}
            onChange={(e) => setExtractedData({ ...extractedData, nic: e.target.value })}
            placeholder="Ej. 7333529"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40]' : 'bg-white border-slate-300 text-emerald-800'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            NIS / Suministro
          </label>
          <input
            type="text"
            value={extractedData.nis || ''}
            onChange={(e) => setExtractedData({ ...extractedData, nis: e.target.value })}
            placeholder="Ej. 4115260"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            RNC / Cédula
          </label>
          <input
            type="text"
            value={extractedData.rnc || ''}
            onChange={(e) => setExtractedData({ ...extractedData, rnc: e.target.value })}
            placeholder="Ej. 130549682"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            No. Medidor / Contador
          </label>
          <input
            type="text"
            value={extractedData.meterNumber || ''}
            onChange={(e) => setExtractedData({ ...extractedData, meterNumber: e.target.value })}
            placeholder="Ej. 21002764"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Circuito Eléctrico
          </label>
          <input
            type="text"
            value={extractedData.circuit || ''}
            onChange={(e) => setExtractedData({ ...extractedData, circuit: e.target.value })}
            placeholder="Ej. INVI03"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Distribuidora Eléctrica
          </label>
          <select
            value={extractedData.distributor}
            onChange={(e) => setExtractedData({ ...extractedData, distributor: e.target.value as any })}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-emerald-400' : 'bg-white border-slate-300 text-emerald-800'
            }`}
          >
            <option value="EDEESTE">EDEESTE</option>
            <option value="EDESUR">EDESUR</option>
            <option value="EDENORTE">EDENORTE</option>
            <option value="CEPM">CEPM</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Tarifa Eléctrica
          </label>
          <input
            type="text"
            value={extractedData.tariffCode}
            onChange={(e) => setExtractedData({ ...extractedData, tariffCode: e.target.value })}
            placeholder="Ej. BTD, BTS1, BTS2, MTD"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Voltaje / Fases
          </label>
          <input
            type="text"
            value={extractedData.voltagePhase || ''}
            onChange={(e) => setExtractedData({ ...extractedData, voltagePhase: e.target.value })}
            placeholder="Ej. Baja 120/208 Trifásica"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Comprobante e-NCF
          </label>
          <input
            type="text"
            value={extractedData.eNCF || ''}
            onChange={(e) => setExtractedData({ ...extractedData, eNCF: e.target.value })}
            placeholder="Ej. E310000696268"
            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Provincia (Irradiación Solar)
          </label>
          <select
            value={extractedData.province || 'Distrito Nacional'}
            onChange={(e) => setExtractedData({ ...extractedData, province: e.target.value })}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {RD_PROVINCES.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.avgHSP} HSP)
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-bold uppercase text-zinc-400">
            Dirección de Suministro
          </label>
          <input
            type="text"
            value={extractedData.address || ''}
            onChange={(e) => setExtractedData({ ...extractedData, address: e.target.value })}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 ${
              isDark ? 'bg-[#181822] border-[#2e2e40] text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>
      </div>

      {extractedData.aiNotes && (
        <div
          className={`p-3 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2 ${
            isDark ? 'bg-[#191924] border-[#2e2e40] text-zinc-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}
        >
          <Bot className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Análisis de la IA: </span>
            {extractedData.aiNotes}
          </div>
        </div>
      )}
    </div>
  );
};
