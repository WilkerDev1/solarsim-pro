import React from 'react';
import { ProjectSimulation } from '../../../types';
import { calculateDCCapacityKWp } from '../../../engine/solarEngine';
import { Sun, Cpu, Battery, Wrench, Shield, CheckCircle } from 'lucide-react';

interface HubEquipmentSpecsTabProps {
  project: ProjectSimulation;
}

export const HubEquipmentSpecsTab: React.FC<HubEquipmentSpecsTabProps> = ({ project }) => {
  const dcKWp = calculateDCCapacityKWp(project.specs.panelPowerW, project.specs.panelCount);

  return (
    <div className="flex flex-col gap-6 select-none animate-in fade-in duration-200">
      {/* ☀️ 1. Generador Fotovoltaico (Paneles) */}
      <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sun className="w-4 h-4 text-amber-400" />
            <span>Módulos Fotovoltaicos (Paneles Solares)</span>
          </h3>
          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-400">
            {dcKWp.toFixed(2)} kWp DC Total
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs">
          <div>
            <span className="text-zinc-500 block">Modelo de Módulo:</span>
            <span className="font-bold text-white truncate block">
              {project.specs.panelBrandModel || 'Canadian Solar TOPBiHiKu6'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Potencia Unitaria:</span>
            <span className="font-bold text-amber-400 font-mono">{project.specs.panelPowerW} Wp</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Cantidad Total:</span>
            <span className="font-bold text-white font-mono">{project.specs.panelCount} módulos</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Degradación Anual:</span>
            <span className="font-bold text-zinc-300 font-mono">
              {project.specs.annualDegradation || 0.4}% / año
            </span>
          </div>
        </div>
      </div>

      {/* ⚡ 2. Inversores y Electrónica de Potencia */}
      <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <span>Inversores y Conversión AC</span>
          </h3>
          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-blue-500/15 text-blue-400">
            {(project.specs.inverterPowerKW * (project.specs.inverterCount || 1)).toFixed(1)} kW AC Total
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs">
          <div>
            <span className="text-zinc-500 block">Modelo de Inversor:</span>
            <span className="font-bold text-white truncate block">
              {project.specs.inverterBrandModel || 'LuxpowerTek LXP-LB-US Split Phase'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Potencia Nominal por Unidad:</span>
            <span className="font-bold text-blue-400 font-mono">{project.specs.inverterPowerKW} kW</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Unidades en Paralelo:</span>
            <span className="font-bold text-white font-mono">{project.specs.inverterCount || 1} inversor(es)</span>
          </div>
        </div>
      </div>

      {/* 🔋 3. Sistema de Almacenamiento BESS (Baterías) */}
      <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Battery className="w-4 h-4 text-emerald-400" />
            <span>Almacenamiento de Energía BESS (Baterías Litio)</span>
          </h3>
          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400">
            {project.specs.hasBattery
              ? `${(project.specs.batteryCapacityKWh * (project.specs.batteryCount || 1)).toFixed(1)} kWh Capacidad`
              : 'Sin Almacenamiento'}
          </span>
        </div>

        {project.specs.hasBattery ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs">
            <div>
              <span className="text-zinc-500 block">Modelo / Química:</span>
              <span className="font-bold text-white">
                {project.specs.batteryBrandModel || 'HinaESS PowerGem Max (LiFePO4)'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Capacidad Unitaria:</span>
              <span className="font-bold text-emerald-400 font-mono">{project.specs.batteryCapacityKWh} kWh</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Profundidad de Descarga (DoD):</span>
              <span className="font-bold text-white font-mono">{project.specs.batteryDOD || 90}%</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Unidades BESS:</span>
              <span className="font-bold text-white font-mono">{project.specs.batteryCount || 1} módulo(s)</span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs text-zinc-400">
            Este proyecto está configurado como sistema conectado a red sin banco de baterías (Grid-Tied Net Metering).
          </div>
        )}
      </div>

      {/* 🛠️ 4. Servicios y Alcance de Instalación */}
      <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Wrench className="w-4 h-4 text-zinc-400" />
          <span>Estructura, Protecciones y Alcance Llave en Mano</span>
        </h3>

        <div className="p-4 rounded-xl bg-[#0d1117] border border-[#21262d] flex flex-col gap-2 text-xs text-zinc-300">
          <p>
            {project.specs.installationServicesDesc ||
              'Suministro e instalación completa bajo estándar llave en mano: estructuras de aluminio anodizado certificadas contra vientos huracanados, cableado fotovoltaico solar resistente a UV, protecciones contra sobretensiones (SPD Clase II), breaker AC/DC, puesta a tierra e interconexión y tramitación completa ante la distribuidora.'}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-[#21262d] text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> Tramitación Medición Neta
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> Planos Eléctricos Sellados
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> Certificación de Estructura
            </span>
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" /> Puesta en Marcha Oficial
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
