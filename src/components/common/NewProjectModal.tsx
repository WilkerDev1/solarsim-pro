import React, { useState, useEffect, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { RD_PROVINCES } from '../../data/rdProvinces';
import { X, Sun, Building2, MapPin, Zap, ArrowRight, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';

export const NewProjectModal: React.FC = () => {
  const { isNewProjectModalOpen, closeNewProjectModal, createNewProject, sidebarTheme } = useSimulationStore();
  const isDark = sidebarTheme === 'dark';

  const nameInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [province, setProvince] = useState(RD_PROVINCES[0].name);
  const [distributor, setDistributor] = useState<'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM'>('EDEESTE');
  const [tariffCode, setTariffCode] = useState('BTS2');
  const [address, setAddress] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNewProjectModalOpen) {
      setName('');
      setCompany('');
      setProvince(RD_PROVINCES[0].name);
      setDistributor('EDEESTE');
      setTariffCode('BTS2');
      setAddress('');
      setShowAdvanced(false);
      setError('');

      // Auto focus on next tick to ensure input is ready
      const timer = setTimeout(() => {
        if (nameInputRef.current) {
          nameInputRef.current.focus();
          nameInputRef.current.select();
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isNewProjectModalOpen]);

  // Adjust distributor based on selected province
  const handleProvinceChange = (provName: string) => {
    setProvince(provName);
    if (provName.includes('Punta Cana') || provName.includes('Altagracia')) {
      setDistributor('CEPM');
      setTariffCode('BTS1');
    } else if (
      provName.includes('Santiago') ||
      provName.includes('Puerto Plata') ||
      provName.includes('Vega') ||
      provName.includes('Duarte') ||
      provName.includes('Monte Cristi')
    ) {
      setDistributor('EDENORTE');
      setTariffCode('MTD');
    } else if (provName.includes('Cristóbal') || provName.includes('Barahona') || provName.includes('Sur')) {
      setDistributor('EDESUR');
      setTariffCode('BTS2');
    } else {
      setDistributor('EDEESTE');
      setTariffCode('BTS2');
    }
  };

  if (!isNewProjectModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor, ingresa el nombre del proyecto o cliente.');
      nameInputRef.current?.focus();
      return;
    }

    createNewProject({
      name: name.trim(),
      company: company.trim() || undefined,
      province,
      distributor,
      tariffCode,
      address: address.trim() || `${province}, República Dominicana`,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={closeNewProjectModal}
    >
      <div
        className={`border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200 transition-colors z-50 select-text ${
          isDark
            ? 'bg-[#18181f] border-[#2e2e3a] text-zinc-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className={`px-6 py-4 flex justify-between items-center shrink-0 border-b transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-emerald-950 via-[#1e1e28] to-[#18181f] border-[#2e2e3a] text-white'
              : 'bg-gradient-to-r from-emerald-800 to-emerald-700 border-emerald-800 text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Sun className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight text-white">Nueva Simulación Solar</h3>
              <p className={`text-xs ${isDark ? 'text-zinc-300' : 'text-emerald-100'}`}>
                Ingresa el nombre del proyecto para comenzar
              </p>
            </div>
          </div>
          <button
            onClick={closeNewProjectModal}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div
              className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 border ${
                isDark
                  ? 'bg-red-950/60 border-red-800/80 text-red-300'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Primary Field: Project Name */}
          <div>
            <label
              htmlFor="project-name-input"
              className={`block font-bold mb-1.5 ${isDark ? 'text-zinc-200' : 'text-slate-700'}`}
            >
              Nombre del Proyecto / Cliente <span className="text-red-500 font-black">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="project-name-input"
              type="text"
              autoComplete="off"
              placeholder="Ej. Clínica San Rafael, Res. Las Palmas, etc."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all select-text cursor-text ${
                isDark
                  ? 'bg-[#22222c] border-[#383848] text-white placeholder:text-zinc-500 focus:bg-[#282834] focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 placeholder:text-slate-400 font-semibold'
              }`}
            />
            <p className={`text-[11px] mt-1.5 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
              Los parámetros técnicos, tarifas y equipos se pueden personalizar dentro del simulador.
            </p>
          </div>

          {/* Toggle for Advanced / Detailed Data */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                showAdvanced
                  ? isDark
                    ? 'bg-[#242430] border-emerald-500/60 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : isDark
                  ? 'bg-[#1e1e26] border-[#2e2e3a] text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showAdvanced ? 'Ocultar datos detallados' : 'Configurar datos detallados (Opcional)'}
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Collapsible Advanced Fields */}
          {showAdvanced && (
            <div
              className={`space-y-3.5 p-3.5 rounded-xl border animate-in slide-in-from-top-2 duration-200 ${
                isDark ? 'bg-[#15151a] border-[#2a2a36]' : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block font-bold mb-1 flex items-center gap-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    <Building2 className="w-3.5 h-3.5 text-zinc-400" /> Empresa / Razón Social
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Grupo Ramos SRL"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold transition-all select-text cursor-text ${
                      isDark
                        ? 'bg-[#22222a] border-[#383846] text-white focus:bg-[#282834]'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block font-bold mb-1 flex items-center gap-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    <MapPin className="w-3.5 h-3.5 text-zinc-400" /> Provincia / Región
                  </label>
                  <select
                    value={province}
                    onChange={(e) => handleProvinceChange(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                      isDark
                        ? 'bg-[#22222a] border-[#383846] text-white focus:bg-[#282834]'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    {RD_PROVINCES.map((p) => (
                      <option key={p.code} value={p.name} className={isDark ? 'bg-[#18181f] text-white' : ''}>
                        {p.name} ({p.avgHSP} HSP)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block font-bold mb-1 flex items-center gap-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    <Zap className="w-3.5 h-3.5 text-zinc-400" /> Distribuidora
                  </label>
                  <select
                    value={distributor}
                    onChange={(e) => setDistributor(e.target.value as any)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                      isDark
                        ? 'bg-[#22222a] border-[#383846] text-white focus:bg-[#282834]'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="EDEESTE" className={isDark ? 'bg-[#18181f] text-white' : ''}>EDEESTE</option>
                    <option value="EDESUR" className={isDark ? 'bg-[#18181f] text-white' : ''}>EDESUR</option>
                    <option value="EDENORTE" className={isDark ? 'bg-[#18181f] text-white' : ''}>EDENORTE</option>
                    <option value="CEPM" className={isDark ? 'bg-[#18181f] text-white' : ''}>CEPM (Punta Cana)</option>
                  </select>
                </div>

                <div>
                  <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                    Tarifa Eléctrica
                  </label>
                  <select
                    value={tariffCode}
                    onChange={(e) => setTariffCode(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                      isDark
                        ? 'bg-[#22222a] border-[#383846] text-white focus:bg-[#282834]'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="BTS1" className={isDark ? 'bg-[#18181f] text-white' : ''}>BTS1 (Residencial)</option>
                    <option value="BTS2" className={isDark ? 'bg-[#18181f] text-white' : ''}>BTS2 (Comercial/Demanda)</option>
                    <option value="MTD" className={isDark ? 'bg-[#18181f] text-white' : ''}>MTD (Media Tensión)</option>
                    <option value="BTD" className={isDark ? 'bg-[#18181f] text-white' : ''}>BTD (Baja Tensión)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block font-bold mb-1 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  Dirección del Inmueble
                </label>
                <input
                  type="text"
                  placeholder="Ej. Av. 27 de Febrero esq. Winston Churchill"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2 text-xs font-medium transition-all select-text cursor-text ${
                    isDark
                      ? 'bg-[#22222a] border-[#383846] text-white placeholder:text-zinc-500 focus:bg-[#282834]'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className={`pt-3 border-t flex justify-end gap-2.5 ${isDark ? 'border-[#2e2e3a]' : 'border-slate-200'}`}>
            <button
              type="button"
              onClick={closeNewProjectModal}
              className={`px-4 py-2.5 rounded-xl border font-semibold text-xs transition-colors cursor-pointer ${
                isDark
                  ? 'border-[#383846] text-zinc-300 hover:bg-[#262632]'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>Crear Simulación</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
