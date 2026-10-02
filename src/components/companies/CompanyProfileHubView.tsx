import React, { useState } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { CompanyProfile } from '../../types';
import {
  Building2,
  Plus,
  Trash2,
  Check,
  Star,
  Upload,
  ArrowLeft,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Globe,
  FileCheck2,
  User,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export const CompanyProfileHubView: React.FC = () => {
  const {
    companies,
    activeCompanyId,
    addCompany,
    updateCompany,
    deleteCompany,
    setActiveCompany,
    localUserProfile,
    updateLocalUserProfile,
    setActiveView,
  } = useSimulationStore();

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(activeCompanyId);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // New company form state
  const [formData, setFormData] = useState<Partial<CompanyProfile>>({
    name: '',
    commercialName: '',
    rncOrId: '',
    phone: '',
    email: '',
    address: '',
    website: '',
    primaryColor: '#059669',
    accentColor: '#0284c7',
    defaultPaymentTerms: '60% anticipo al ordenar, 30% contra entrega de equipos en sitio, 10% tras interconexión.',
    defaultWarrantyNotes: '25 años en paneles solares, 10 años en inversores y baterías BESS, 1 año en instalación.',
    isDefault: false,
  });

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0];

  const handleSelectCompany = (comp: CompanyProfile) => {
    setSelectedCompanyId(comp.id);
    setIsCreatingNew(false);
    setFormData({ ...comp });
  };

  const handleStartCreate = () => {
    setIsCreatingNew(true);
    setFormData({
      name: '',
      commercialName: '',
      rncOrId: '',
      phone: '',
      email: '',
      address: '',
      website: '',
      primaryColor: '#059669',
      accentColor: '#0284c7',
      defaultPaymentTerms: '60% anticipo al ordenar, 30% contra entrega, 10% interconexión.',
      defaultWarrantyNotes: '25 años de producción lineal en módulos fotovoltaicos.',
      isDefault: companies.length === 0,
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoBase64' | 'signatureSealBase64') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar los 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setFormData((prev) => ({ ...prev, [field]: base64 }));
      if (!isCreatingNew && selectedCompany) {
        updateCompany(selectedCompany.id, { [field]: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) {
      alert('El nombre o razón social de la empresa es obligatorio.');
      return;
    }

    if (isCreatingNew) {
      const newId = addCompany({
        name: formData.name.trim(),
        commercialName: formData.commercialName?.trim() || formData.name.trim(),
        rncOrId: formData.rncOrId?.trim() || '',
        phone: formData.phone?.trim() || '',
        email: formData.email?.trim() || '',
        address: formData.address?.trim() || '',
        website: formData.website?.trim() || '',
        logoBase64: formData.logoBase64,
        signatureSealBase64: formData.signatureSealBase64,
        primaryColor: formData.primaryColor || '#059669',
        accentColor: formData.accentColor || '#0284c7',
        defaultPaymentTerms: formData.defaultPaymentTerms || '',
        defaultWarrantyNotes: formData.defaultWarrantyNotes || '',
        isDefault: !!formData.isDefault,
      });
      setSelectedCompanyId(newId);
      setIsCreatingNew(false);
      showFeedback('¡Empresa creada y guardada con éxito! 🏢');
    } else if (selectedCompany) {
      updateCompany(selectedCompany.id, formData);
      showFeedback('¡Datos de la empresa actualizados! ✨');
    }
  };

  const showFeedback = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1117] text-zinc-100 overflow-hidden select-none">
      {/* 🧭 Top Bar / Header */}
      <header className="h-14 border-b border-[#21262d] bg-[#161b22]/90 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveView('dashboard')}
            className="p-1.5 rounded-xl hover:bg-[#21262d] text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Volver al catálogo de proyectos"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <div className="h-4 w-[1px] bg-[#30363d]" />
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <h1 className="text-base font-extrabold tracking-tight text-white">
              Centro de Empresas & Membretes
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">
              {companies.length} {companies.length === 1 ? 'Empresa' : 'Empresas'}
            </span>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="text-xs font-semibold px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg animate-in fade-in">
            {saveSuccessMsg}
          </div>
        )}
      </header>

      {/* 🖼️ Main Body Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* 📋 Left Column: List of Companies & Local Consultant Profile */}
        <aside className="w-80 border-r border-[#21262d] bg-[#161b22]/50 p-4 flex flex-col gap-5 overflow-y-auto">
          {/* Header Action */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Mis Empresas / Marcas
            </span>
            <button
              onClick={handleStartCreate}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva</span>
            </button>
          </div>

          {/* Companies List */}
          <div className="flex flex-col gap-2">
            {companies.map((comp) => {
              const isSelected = !isCreatingNew && comp.id === selectedCompanyId;
              const isActive = comp.id === activeCompanyId;

              return (
                <div
                  key={comp.id}
                  onClick={() => handleSelectCompany(comp)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 relative group ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/20'
                      : 'bg-[#1c2128]/70 border-[#30363d] hover:bg-[#21262d] hover:border-zinc-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 text-white overflow-hidden shadow-xs"
                        style={{ backgroundColor: comp.primaryColor || '#059669' }}
                      >
                        {comp.logoBase64 ? (
                          <img src={comp.logoBase64} alt={comp.name} className="w-full h-full object-cover" />
                        ) : (
                          comp.commercialName?.charAt(0) || comp.name.charAt(0) || 'E'
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">
                          {comp.commercialName || comp.name}
                        </h4>
                        <span className="text-[10px] text-zinc-400 font-mono block truncate">
                          RNC: {comp.rncOrId || 'N/A'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {comp.isDefault && (
                        <span title="Predeterminada" className="text-amber-400">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Active Profile Indicator */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#30363d]/60 text-[10px]">
                    <span className="text-zinc-500">{comp.phone || comp.email || 'Sin contacto'}</span>
                    {isActive ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" /> Activa
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCompany(comp.id);
                          showFeedback(`"${comp.commercialName || comp.name}" es ahora tu empresa activa.`);
                        }}
                        className="text-zinc-400 hover:text-emerald-400 font-semibold cursor-pointer underline"
                      >
                        Usar ahora
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 👤 Local Consultant / User Card */}
          <div className="mt-auto pt-4 border-t border-[#21262d] flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Perfil del Consultor
            </span>
            <div className="p-3 rounded-xl bg-[#1c2128] border border-[#30363d] flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-slate-700 text-white text-xs font-bold flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block truncate">
                    {localUserProfile.name || 'Consultor Solar'}
                  </span>
                  <span className="text-[10px] text-zinc-400 block truncate">
                    {localUserProfile.roleTitle || 'Ingeniero Fotovoltaico'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-1 text-xs">
                <input
                  type="text"
                  placeholder="Tu Nombre (ej. Ing. Carlos Díaz)"
                  value={localUserProfile.name}
                  onChange={(e) => updateLocalUserProfile({ name: e.target.value })}
                  className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-[11px] text-white focus:outline-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Cargo (ej. Director de Proyectos)"
                  value={localUserProfile.roleTitle}
                  onChange={(e) => updateLocalUserProfile({ roleTitle: e.target.value })}
                  className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded text-[11px] text-white focus:outline-emerald-500"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* 📝 Right Column: Selected Company Detail & Branding Editor */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Header of Form */}
            <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-emerald-400" />
                  <span>{isCreatingNew ? 'Registrar Nueva Empresa / Marca' : 'Detalles de la Empresa'}</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Configura los membretes, sellos, firmas y datos fiscales que se aplicarán automáticamente a tus propuestas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isCreatingNew && selectedCompany && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCompany(selectedCompany.id);
                        showFeedback(`"${selectedCompany.commercialName || selectedCompany.name}" es ahora tu empresa activa.`);
                      }}
                      disabled={selectedCompany.id === activeCompanyId}
                      className="px-3 py-1.5 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/40 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {selectedCompany.id === activeCompanyId ? '✓ Empresa Activa' : 'Fijar como Activa'}
                    </button>

                    {companies.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Estás seguro de eliminar "${selectedCompany.name}"?`)) {
                            deleteCompany(selectedCompany.id);
                            showFeedback('Empresa eliminada.');
                          }
                        }}
                        className="p-2 rounded-xl text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Eliminar empresa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex flex-col gap-6">
              {/* Section 1: Identidad Corporativa */}
              <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Identidad y Datos Fiscales</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      Razón Social Oficial *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Electsun Dominicana S.R.L."
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      Nombre Comercial / Marca
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. ELECTSUN"
                      value={formData.commercialName || ''}
                      onChange={(e) => setFormData({ ...formData, commercialName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      RNC / Identificación Tributaria
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 1-31-12345-6"
                      value={formData.rncOrId || ''}
                      onChange={(e) => setFormData({ ...formData, rncOrId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      Teléfono Corporativo
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Ej. 809-555-0100"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      Correo Electrónico Oficial
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        placeholder="Ej. info@electsun.com.do"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      Sitio Web
                    </label>
                    <div className="relative">
                      <Globe className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Ej. electsun.com.do"
                        value={formData.website || ''}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                      Dirección Física de la Oficina
                    </label>
                    <div className="relative">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Ej. Av. Winston Churchill, Torre Empresarial, Santo Domingo, D.N."
                        value={formData.address || ''}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0d1117] border border-[#30363d] text-xs text-white focus:outline-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Branding Visual (Logos & Firma) */}
              <div className="p-5 rounded-2xl bg-[#161b22] border border-[#30363d] flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Branding Visual & Membrete Oficial</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Logo Upload Box */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                      Logo de la Empresa (PNG, SVG)
                    </label>
                    <div className="p-4 rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] flex flex-col items-center justify-center gap-3 relative min-h-[130px]">
                      {formData.logoBase64 ? (
                        <div className="relative group">
                          <img
                            src={formData.logoBase64}
                            alt="Logo"
                            className="max-h-24 max-w-[200px] object-contain drop-shadow"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, logoBase64: undefined })}
                            className="absolute -top-2 -right-2 p-1 bg-rose-600 hover:bg-rose-500 text-white rounded-full transition-colors cursor-pointer"
                            title="Eliminar logo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center gap-2 cursor-pointer text-zinc-400 hover:text-white transition-colors">
                          <Upload className="w-6 h-6 text-zinc-500" />
                          <span className="text-xs font-semibold">Subir imagen de Logo</span>
                          <span className="text-[10px] text-zinc-500">Máx 2MB (fondo transparente recomendado)</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e, 'logoBase64')}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Sello / Firma Digital Upload Box */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                      Sello o Firma Autorizada (Opcional)
                    </label>
                    <div className="p-4 rounded-xl border border-dashed border-[#30363d] bg-[#0d1117] flex flex-col items-center justify-center gap-3 relative min-h-[130px]">
                      {formData.signatureSealBase64 ? (
                        <div className="relative group">
                          <img
                            src={formData.signatureSealBase64}
                            alt="Sello"
                            className="max-h-24 max-w-[200px] object-contain drop-shadow"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, signatureSealBase64: undefined })}
                            className="absolute -top-2 -right-2 p-1 bg-rose-600 hover:bg-rose-500 text-white rounded-full transition-colors cursor-pointer"
                            title="Eliminar firma"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center gap-2 cursor-pointer text-zinc-400 hover:text-white transition-colors">
                          <FileCheck2 className="w-6 h-6 text-zinc-500" />
                          <span className="text-xs font-semibold">Subir Sello / Firma Digital</span>
                          <span className="text-[10px] text-zinc-500">Aparecerá al pie de la propuesta oficial</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml"
                            className="hidden"
                            onChange={(e) => handleFileUpload(e, 'signatureSealBase64')}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Colores Corporativos */}
                  <div className="flex items-center gap-4">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                        Color Primario
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.primaryColor || '#059669'}
                          onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                          className="w-9 h-9 rounded-lg bg-transparent border border-[#30363d] cursor-pointer"
                        />
                        <span className="text-xs font-mono text-zinc-400">{formData.primaryColor || '#059669'}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider block mb-1">
                        Color Secundario / Acento
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.accentColor || '#0284c7'}
                          onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                          className="w-9 h-9 rounded-lg bg-transparent border border-[#30363d] cursor-pointer"
                        />
                        <span className="text-xs font-mono text-zinc-400">{formData.accentColor || '#0284c7'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Empresa Predeterminada */}
                  <div className="flex items-center gap-3 pt-6">
                    <input
                      type="checkbox"
                      id="isDefaultCompany"
                      checked={!!formData.isDefault}
                      onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="isDefaultCompany" className="text-xs font-semibold text-zinc-200 cursor-pointer">
                      Establecer como empresa predeterminada para nuevas cotizaciones
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {isCreatingNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingNew(false);
                      if (selectedCompany) setFormData({ ...selectedCompany });
                    }}
                    className="px-4 py-2.5 rounded-xl border border-[#30363d] hover:bg-[#21262d] text-xs font-bold text-zinc-300 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-950/40 cursor-pointer flex items-center gap-2 active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>{isCreatingNew ? 'Guardar Nueva Empresa' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};
