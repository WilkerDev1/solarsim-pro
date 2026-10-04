import { useEnergyCalculationMode } from '../../../features/application/useApplicationFeatures';
import React from 'react';
import { ProjectSimulation } from '../../../types';
import { calculateDCCapacityKWp } from '../../../engine/solarEngine';
import { calculateProjectFinancialSummary } from '../../../engine/financeEngine';
import {
  Zap,
  MapPin,
  Calendar,
  Building,
  TrendingUp,
  Battery,
  Shield,
  Layers,
  FileCheck,
} from 'lucide-react';

interface HubOverviewTabProps {
  project: ProjectSimulation;
}

export const HubOverviewTab: React.FC<HubOverviewTabProps> = ({ project }) => {
  const dcKWp = calculateDCCapacityKWp(project.specs.panelPowerW, project.specs.panelCount);
  const calculationMode = useEnergyCalculationMode();
  const financialSummary = calculateProjectFinancialSummary(project, calculationMode);
  const monthlyGen = financialSummary.monthlyBreakdown;
  const annualGenKWh = financialSummary.annualProductionKWh;
  const annualConsKWh = financialSummary.annualConsumptionKWh;
  const coveragePct = financialSummary.energyCoveragePct;

  return (
    <div className="flex flex-col gap-6 select-none animate-in fade-in duration-200">
      {/* 📊 Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Potencia DC</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-white font-mono">
            {dcKWp.toFixed(2)} <span className="text-sm font-semibold text-emerald-400">kWp</span>
          </span>
          <span className="text-[10px] text-zinc-400">
            {project.specs.panelCount} módulos × {project.specs.panelPowerW}W
          </span>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Inversores AC</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-2xl font-black text-white font-mono">
            {(project.specs.inverterPowerKW * (project.specs.inverterCount || 1)).toFixed(1)}{' '}
            <span className="text-sm font-semibold text-blue-400">kW AC</span>
          </span>
          <span className="text-[10px] text-zinc-400">
            {project.specs.inverterCount || 1}x {project.specs.inverterPowerKW} kW híbrido
          </span>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Almacenamiento BESS</span>
            <Battery className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-2xl font-black text-white font-mono">
            {project.specs.hasBattery
              ? `${(project.specs.batteryCapacityKWh * (project.specs.batteryCount || 1)).toFixed(1)} `
              : '0.0 '}
            <span className="text-sm font-semibold text-amber-400">kWh</span>
          </span>
          <span className="text-[10px] text-zinc-400">
            {project.specs.hasBattery ? `${project.specs.batteryCount || 1} unidades LiFePO4` : 'Sin baterías'}
          </span>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Inversión Neta Ley 57-07</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-emerald-400 font-mono">
            ${Math.round(financialSummary.netInvestmentUSD).toLocaleString()}
          </span>
          <span className="text-[10px] text-zinc-400 font-mono">
            Payback: {financialSummary.paybackYears.toFixed(1)} años | TIR: {financialSummary.irrPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 📈 Middle Grid: Balance Energético & Resumen Financiero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Balance Mensual y Parámetros Técnicos */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Energy Breakdown Box */}
          <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Balance Energético Anual</span>
              </h3>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                Cobertura: {coveragePct.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[#0d1117] border border-[#21262d] text-center">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Generación Anual</span>
                <span className="text-base font-extrabold text-amber-400 font-mono">
                  {Math.round(annualGenKWh).toLocaleString()} <span className="text-xs">kWh</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Consumo Anual</span>
                <span className="text-base font-extrabold text-blue-400 font-mono">
                  {Math.round(annualConsKWh).toLocaleString()} <span className="text-xs">kWh</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">CO2 Evitado</span>
                <span className="text-base font-extrabold text-emerald-400 font-mono">
                  {financialSummary.co2AvoidedTonsPerYear.toFixed(1)} <span className="text-xs">Ton/año</span>
                </span>
              </div>
            </div>

            {/* Monthly mini bars */}
            <div className="flex flex-col gap-1.5 pt-2">
              <span className="text-[11px] font-bold text-zinc-400">Generación vs Consumo por Mes:</span>
              <div className="grid grid-cols-12 gap-1 items-end h-28 pt-2 px-1">
                {monthlyGen.map((m, idx) => {
                  const cons = project.monthlyConsumption[idx] || 1;
                  const maxVal = Math.max(m.productionKWh, cons, 100);
                  const genHeightPct = Math.min(100, Math.round((m.productionKWh / maxVal) * 100));
                  const consHeightPct = Math.min(100, Math.round((cons / maxVal) * 100));

                  const monthNames = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

                  return (
                    <div key={idx} className="flex flex-col items-center h-full justify-end gap-1">
                      <div className="w-full flex items-end justify-center gap-0.5 h-20">
                        {/* Gen bar */}
                        <div
                          style={{ height: `${genHeightPct}%` }}
                          className="w-2 bg-amber-400 rounded-t-xs transition-all"
                          title={`Gen ${m.month}: ${Math.round(m.productionKWh)} kWh`}
                        />
                        {/* Cons bar */}
                        <div
                          style={{ height: `${consHeightPct}%` }}
                          className="w-2 bg-blue-500/70 rounded-t-xs transition-all"
                          title={`Cons ${m.month}: ${Math.round(cons)} kWh`}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 font-bold">{monthNames[idx]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 text-[10px] text-zinc-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Generación Solar
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Consumo EDE
                </span>
              </div>
            </div>
          </div>

          {/* Project Details Info */}
          <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <span>Ubicación y Régimen Eléctrico</span>
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-zinc-500 block">Cliente:</span>
                <span className="font-bold text-white">{project.client.name}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Provincia / Región:</span>
                <span className="font-bold text-white flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  {project.client.province}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Distribuidora Eléctrica:</span>
                <span className="font-bold text-amber-400 font-mono">{project.rates.distributor}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Tarifa Aplicada:</span>
                <span className="font-bold text-white font-mono">{project.rates.tariffCode}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Retención SIE-007 (25%):</span>
                <span className="font-bold text-zinc-300">
                  {(project.rates.gridExportFeePct || 0) > 0 ? 'Aplicada (75% valorizado)' : 'Sin retención'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Vigencia de la Cotización:</span>
                <span className="font-bold text-zinc-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  {project.client.quoteValidityDays || 7} días
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 span): Desglose Financiero & Ley 57-07 */}
        <div className="flex flex-col gap-6">
          <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Ingeniería Financiera Ley 57-07</span>
            </h3>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#21262d]">
                <span className="text-zinc-400">Inversión Llave en Mano:</span>
                <span className="font-bold text-white font-mono">
                  ${Math.round(financialSummary.contractPriceUSD).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-[#21262d]">
                <span className="text-zinc-400">Exoneración ITBIS (18%):</span>
                <span className="font-bold text-emerald-400 font-mono">
                  +${Math.round(financialSummary.itbisSavedUSD).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-[#21262d]">
                <span className="text-zinc-400">Crédito ISR Ley 57-07 (40%):</span>
                <span className="font-bold text-emerald-400 font-mono">
                  -${Math.round(financialSummary.ley5707CreditUSD).toLocaleString()}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Desembolso Neto Real
                </span>
                <span className="text-2xl font-black text-emerald-300 font-mono">
                  ${Math.round(financialSummary.netInvestmentUSD).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-2.5 rounded-xl bg-[#0d1117] border border-[#21262d]">
                  <span className="text-[10px] text-zinc-500 block">TIR (IRR)</span>
                  <span className="text-base font-black text-white font-mono">
                    {financialSummary.irrPct.toFixed(1)}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0d1117] border border-[#21262d]">
                  <span className="text-[10px] text-zinc-500 block">Payback</span>
                  <span className="text-base font-black text-white font-mono">
                    {financialSummary.paybackYears.toFixed(1)} a
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0d1117] border border-[#21262d]">
                  <span className="text-[10px] text-zinc-500 block">VAN (NPV)</span>
                  <span className="text-base font-black text-white font-mono">
                    ${Math.round(financialSummary.npvUSD).toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0d1117] border border-[#21262d]">
                  <span className="text-[10px] text-zinc-500 block">Ahorro Año 1</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    ${Math.round(financialSummary.year1SavingsUSD).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Notice Card */}
          <div className="p-4 rounded-2xl bg-[#1c2128] border border-[#30363d] flex items-start gap-3 text-xs text-zinc-300">
            <FileCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Propuesta Lista para Exportar</span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Los parámetros y precios se encuentran listos para emitir la propuesta ejecutiva en PDF o compartir en la web.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
