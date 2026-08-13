import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { RD_PROVINCES } from '../../data/rdProvinces';
import { X, Sun, Building2, MapPin, Zap, ArrowRight } from 'lucide-react';

export const NewProjectModal: React.FC = () => {
  const { isNewProjectModalOpen, closeNewProjectModal, createNewProject } = useSimulationStore();

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [province, setProvince] = useState(RD_PROVINCES[0].name);
  const [distributor, setDistributor] = useState<'EDEESTE' | 'EDESUR' | 'EDENORTE' | 'CEPM'>('EDEESTE');
  const [tariffCode, setTariffCode] = useState('BTS2');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNewProjectModalOpen) {
      setName('');
      setCompany('');
      setProvince(RD_PROVINCES[0].name);
      setDistributor('EDEESTE');
      setTariffCode('BTS2');
      setAddress('');
      setError('');
    }
  }, [isNewProjectModalOpen]);

  // Adjust distributor based on selected province
  const handleProvinceChange = (provName: string) => {
    setProvince(provName);
    if (provName.includes('Punta Cana') || provName.includes('Altagracia')) {
      setDistributor('CEPM');
      setTariffCode('BTS1');
    } else if (provName.includes('Santiago') || provName.includes('Puerto Plata') || provName.includes('Vega') || provName.includes('Duarte') || provName.includes('Monte Cristi')) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col scale-100 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 text-white px-6 py-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Sun className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight text-white">Nueva Simulación Solar</h3>
              <p className="text-xs text-emerald-100">Configura los datos del cliente y ubicación inicial</p>
            </div>
          </div>
          <button
            onClick={closeNewProjectModal}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nombre del Proyecto / Cliente <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Ej. Clínica San Rafael, Residencial Las Palmas, Agropecuaria del Este"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition-all placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-500" /> Empresa / Razón Social
              </label>
              <input
                type="text"
                placeholder="Ej. Grupo Ramos SRL"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" /> Provincia / Región (RD)
              </label>
              <select
                value={province}
                onChange={(e) => handleProvinceChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all cursor-pointer"
              >
                {RD_PROVINCES.map((p) => (
                  <option key={p.code} value={p.name}>
                    {p.name} ({p.avgHSP} HSP)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-slate-500" /> Distribuidora Eléctrica
              </label>
              <select
                value={distributor}
                onChange={(e) => setDistributor(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all cursor-pointer"
              >
                <option value="EDEESTE">EDEESTE</option>
                <option value="EDESUR">EDESUR</option>
                <option value="EDENORTE">EDENORTE</option>
                <option value="CEPM">CEPM (Punta Cana / Bávaro)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tarifa Eléctrica Inicial</label>
              <select
                value={tariffCode}
                onChange={(e) => setTariffCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all cursor-pointer"
              >
                <option value="BTS1">BTS1 (Residencial Simple)</option>
                <option value="BTS2">BTS2 (Comercial / Residencial Demanda)</option>
                <option value="MTD">MTD (Media Tensión con Demanda)</option>
                <option value="BTD">BTD (Baja Tensión con Demanda)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Dirección del Inmueble (Opcional)</label>
            <input
              type="text"
              placeholder="Ej. Av. 27 de Febrero esq. Winston Churchill, Santo Domingo"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:ring-1 focus:ring-emerald-600 transition-all"
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={closeNewProjectModal}
              className="px-4 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer"
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
