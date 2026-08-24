import React, { useState, useRef } from 'react';
import {
  Building2,
  User,
  ShieldCheck,
  CheckCircle2,
  PackageCheck,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Trash2,
  ListPlus,
  PlusCircle,
  FileText,
} from 'lucide-react';
import { ProjectSimulation, DocumentCustomization, ExtraTOCItem } from '../../../types';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import {
  ELECTSUN_LOGO_WHITE_BASE64,
  ELECTSUN_LOGO_COLOR_BASE64,
  ELECTSUN_EMBLEM_WATERMARK_BASE64,
} from '../../../assets/electsunLogo';

interface PDFDocumentDataEditorProps {
  isDark: boolean;
  project: ProjectSimulation;
  updateClient: (client: Partial<ProjectSimulation['client']>) => void;
  updateSpecs: (specs: Partial<ProjectSimulation['specs']>) => void;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
}

export const PDFDocumentDataEditor: React.FC<PDFDocumentDataEditorProps> = ({
  isDark,
  project,
  updateClient,
  updateSpecs,
  updateDocumentCustomization,
}) => {
  const cust = project.customization || {};

  // File input refs
  const coverLogoInputRef = useRef<HTMLInputElement>(null);
  const headerLogoInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  // Accordion state
  const [openSection, setOpenSection] = useState<
    'company' | 'contact' | 'warranties' | 'services' | 'hardware' | 'about' | 'projectDescription' | 'annexes'
  >('company');

  // Extra TOC Item Form State
  const [newExtraTitle, setNewExtraTitle] = useState('');
  const [newExtraSubtitle, setNewExtraSubtitle] = useState('');
  const [newExtraPageCount, setNewExtraPageCount] = useState<number>(1);

  const extraTocItems: ExtraTOCItem[] = cust.extraTocItems || [];

  const handleAddExtraItem = () => {
    if (!newExtraTitle.trim()) return;
    const newItem: ExtraTOCItem = {
      id: `extra-toc-${Date.now()}`,
      title: newExtraTitle.trim(),
      subtitle: newExtraSubtitle.trim() || undefined,
      pageCount: newExtraPageCount > 0 ? newExtraPageCount : 1,
    };
    updateDocumentCustomization({
      extraTocItems: [...extraTocItems, newItem],
    });
    setNewExtraTitle('');
    setNewExtraSubtitle('');
    setNewExtraPageCount(1);
  };

  const handleAddPreset = (preset: { title: string; subtitle: string; pageCount: number }) => {
    const newItem: ExtraTOCItem = {
      id: `extra-toc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      title: preset.title,
      subtitle: preset.subtitle,
      pageCount: preset.pageCount,
    };
    updateDocumentCustomization({
      extraTocItems: [...extraTocItems, newItem],
    });
  };

  const handleUpdatePageCount = (id: string, newCount: number) => {
    const clamped = Math.max(1, Math.min(99, newCount));
    updateDocumentCustomization({
      extraTocItems: extraTocItems.map((it) => (it.id === id ? { ...it, pageCount: clamped } : it)),
    });
  };

  const handleRemoveExtraItem = (id: string) => {
    updateDocumentCustomization({
      extraTocItems: extraTocItems.filter((it) => it.id !== id),
    });
  };

  const toggleSection = (
    section: 'company' | 'contact' | 'warranties' | 'services' | 'hardware' | 'about' | 'projectDescription' | 'annexes'
  ) => {
    setOpenSection(openSection === section ? ('' as any) : section);
  };

  const handleResetCompanyDefaults = () => {
    updateDocumentCustomization({
      companyName: DEFAULT_DOCUMENT_CUSTOMIZATION.companyName,
      companySlogan: DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan,
      companyFooterText: DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText,
      coverLogoBase64: undefined,
      headerLogoBase64: undefined,
      watermarkLogoBase64: undefined,
      watermarkOpacity: DEFAULT_DOCUMENT_CUSTOMIZATION.watermarkOpacity,
    });
  };

  const handleCoverLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDocumentCustomization({ coverLogoBase64: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleHeaderLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDocumentCustomization({ headerLogoBase64: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateDocumentCustomization({ watermarkLogoBase64: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const activeCoverLogo = cust.coverLogoBase64 || cust.headerLogoBase64 || ELECTSUN_LOGO_COLOR_BASE64;
  const activeHeaderLogo = cust.headerLogoBase64 || ELECTSUN_LOGO_WHITE_BASE64;
  const activeWatermarkLogo = cust.watermarkLogoBase64 || ELECTSUN_EMBLEM_WATERMARK_BASE64;

  return (
    <div className="space-y-3">
      {/* 1. SECCIÓN: IDENTIDAD DE LA EMPRESA EMISORA Y LOGOS */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('company')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" />
            <span>1. Empresa Emisora y Logotipos</span>
          </div>
          {openSection === 'company' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {openSection === 'company' && (
          <div className={`p-3 pt-1 space-y-3.5 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            {/* Nombre y Eslogan */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Nombre Empresa
                </label>
                <input
                  type="text"
                  value={cust.companyName !== undefined ? cust.companyName : DEFAULT_DOCUMENT_CUSTOMIZATION.companyName}
                  onChange={(e) => updateDocumentCustomization({ companyName: e.target.value })}
                  placeholder="electsun"
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Eslogan
                </label>
                <input
                  type="text"
                  value={cust.companySlogan !== undefined ? cust.companySlogan : DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan}
                  onChange={(e) => updateDocumentCustomization({ companySlogan: e.target.value })}
                  placeholder="El sol a tu favor"
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Teléfono Empresa (Portada / Web)
                </label>
                <input
                  type="text"
                  value={cust.companyPhone !== undefined ? cust.companyPhone : DEFAULT_DOCUMENT_CUSTOMIZATION.companyPhone}
                  onChange={(e) => updateDocumentCustomization({ companyPhone: e.target.value })}
                  placeholder="+1 (809) 378-6590"
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Sitio Web / Instagram
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={cust.companyWebsite !== undefined ? cust.companyWebsite : DEFAULT_DOCUMENT_CUSTOMIZATION.companyWebsite}
                    onChange={(e) => updateDocumentCustomization({ companyWebsite: e.target.value })}
                    placeholder="electsun.com.do"
                    className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                      isDark
                        ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                    }`}
                  />
                  <input
                    type="text"
                    value={cust.companyInstagram !== undefined ? cust.companyInstagram : DEFAULT_DOCUMENT_CUSTOMIZATION.companyInstagram}
                    onChange={(e) => updateDocumentCustomization({ companyInstagram: e.target.value })}
                    placeholder="Electsunrd"
                    className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                      isDark
                        ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Logotipo de Portada */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#1b1b24] border-[#2e2e3e]' : 'bg-slate-100/70 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-1.5">
                <label className={`text-[10px] font-bold uppercase flex items-center gap-1.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                  Logotipo de Portada (Cover)
                </label>
                {cust.coverLogoBase64 && (
                  <button
                    type="button"
                    onClick={() => updateDocumentCustomization({ coverLogoBase64: undefined })}
                    title="Restaurar logo predeterminado de portada"
                    className="text-[10px] font-semibold text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Restaurar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="w-24 h-12 rounded-lg bg-slate-900 border border-slate-700 p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <img
                    src={activeCoverLogo}
                    alt="Cover logo preview"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <input
                    ref={coverLogoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => coverLogoInputRef.current?.click()}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      isDark
                        ? 'bg-[#282836] border-[#3e3e52] text-zinc-200 hover:bg-[#323244] hover:text-white'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-500" />
                    {cust.coverLogoBase64 ? 'Cambiar Logotipo' : 'Subir Logotipo Portada'}
                  </button>
                  <p className="text-[9px] text-zinc-500 mt-1">PNG transparente en alta resolución.</p>
                </div>
              </div>
            </div>

            {/* Logotipo del Header */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#1b1b24] border-[#2e2e3e]' : 'bg-slate-100/70 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-1.5">
                <label className={`text-[10px] font-bold uppercase flex items-center gap-1.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                  Logotipo de Encabezado (Header)
                </label>
                {cust.headerLogoBase64 && (
                  <button
                    type="button"
                    onClick={() => updateDocumentCustomization({ headerLogoBase64: undefined })}
                    title="Restaurar logo predeterminado"
                    className="text-[10px] font-semibold text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Restaurar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="w-24 h-12 rounded-lg bg-emerald-950/80 border border-emerald-800/60 p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <img
                    src={activeHeaderLogo}
                    alt="Header logo preview"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <input
                    ref={headerLogoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleHeaderLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => headerLogoInputRef.current?.click()}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      isDark
                        ? 'bg-[#282836] border-[#3e3e52] text-zinc-200 hover:bg-[#323244] hover:text-white'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-500" />
                    {cust.headerLogoBase64 ? 'Cambiar Logotipo' : 'Subir Logotipo'}
                  </button>
                  <p className="text-[9px] text-zinc-500 mt-1">PNG transparente recomendado (blanco o color).</p>
                </div>
              </div>
            </div>

            {/* Logotipo de Marca de Agua y Opacidad */}
            <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-[#1b1b24] border-[#2e2e3e]' : 'bg-slate-100/70 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-1.5">
                <label className={`text-[10px] font-bold uppercase flex items-center gap-1.5 ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                  Marca de Agua (Fondo de Páginas)
                </label>
                {cust.watermarkLogoBase64 && (
                  <button
                    type="button"
                    onClick={() => updateDocumentCustomization({ watermarkLogoBase64: undefined })}
                    title="Restaurar marca de agua predeterminada"
                    className="text-[10px] font-semibold text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Restaurar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 mb-2.5">
                <div className="w-12 h-12 rounded-lg bg-white border border-slate-300 p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  <img
                    src={activeWatermarkLogo}
                    alt="Watermark preview"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <input
                    ref={watermarkInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleWatermarkUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => watermarkInputRef.current?.click()}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      isDark
                        ? 'bg-[#282836] border-[#3e3e52] text-zinc-200 hover:bg-[#323244] hover:text-white'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50 shadow-xs'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-500" />
                    {cust.watermarkLogoBase64 ? 'Cambiar Imagen' : 'Subir Marca de Agua'}
                  </button>
                  <p className="text-[9px] text-zinc-500 mt-0.5">Emblema o logo centrado (PNG transparente).</p>
                </div>
              </div>

              {/* Slider de Opacidad */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-[10px] font-bold uppercase ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Graduación de Opacidad
                  </span>
                  <span className="text-[10px] font-bold font-mono text-emerald-500">
                    {Math.round((cust.watermarkOpacity !== undefined ? cust.watermarkOpacity : 0.15) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.80"
                  step="0.01"
                  value={cust.watermarkOpacity !== undefined ? cust.watermarkOpacity : 0.15}
                  onChange={(e) => updateDocumentCustomization({ watermarkOpacity: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[9px] text-zinc-500 font-medium mt-0.5">
                  <span>0% (Oculto)</span>
                  <span>15% (Recomendado)</span>
                  <span>80% (Máximo)</span>
                </div>
              </div>
            </div>

            {/* Pie de Página Institucional */}
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Pie de Página Institucional (Dirección / Web)
              </label>
              <textarea
                rows={2}
                value={cust.companyFooterText !== undefined ? cust.companyFooterText : DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText}
                onChange={(e) => updateDocumentCustomization({ companyFooterText: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <button
              type="button"
              onClick={handleResetCompanyDefaults}
              className={`text-[10px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isDark ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <RotateCcw className="w-3 h-3" /> Restaurar predeterminados (Electsun)
            </button>
          </div>
        )}
      </div>

      {/* 2. SECCIÓN: DATOS DE CONTACTO Y VALIDEZ */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('contact')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-500" />
            <span>2. Contacto y Validez de Oferta</span>
          </div>
          {openSection === 'contact' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {openSection === 'contact' && (
          <div className={`p-3 pt-1 space-y-3 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Nombre de Contacto (Atención a)
              </label>
              <input
                type="text"
                value={cust.contactName !== undefined ? cust.contactName : (project.client.name || '')}
                onChange={(e) => updateDocumentCustomization({ contactName: e.target.value })}
                placeholder={project.client.name || 'Nombre del cliente'}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Teléfono Cliente
                </label>
                <input
                  type="text"
                  value={cust.clientPhone !== undefined ? cust.clientPhone : (project.client.contactPhone || '809-378-6590')}
                  onChange={(e) => {
                    updateDocumentCustomization({ clientPhone: e.target.value });
                    updateClient({ contactPhone: e.target.value });
                  }}
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Días de Validez
                </label>
                <input
                  type="number"
                  value={project.client.quoteValidityDays || 7}
                  onChange={(e) => updateClient({ quoteValidityDays: Number(e.target.value) })}
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Nota de Validez y Disponibilidad (Pie Pág 2)
              </label>
              <textarea
                rows={2}
                value={
                  cust.validityNote !== undefined
                    ? cust.validityNote
                    : `* Equipos según disponibilidad de inventario | * Propuesta válida por ${project.client.quoteValidityDays || 7} días | * Precios en USD *`
                }
                onChange={(e) => updateDocumentCustomization({ validityNote: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. SECCIÓN: TÉRMINOS DE GARANTÍAS */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('warranties')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>3. Términos de Garantías</span>
          </div>
          {openSection === 'warranties' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {openSection === 'warranties' && (
          <div className={`p-3 pt-1 space-y-2.5 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Garantía Paneles Solares
              </label>
              <input
                type="text"
                value={cust.panelWarrantyText !== undefined ? cust.panelWarrantyText : DEFAULT_DOCUMENT_CUSTOMIZATION.panelWarrantyText}
                onChange={(e) => updateDocumentCustomization({ panelWarrantyText: e.target.value })}
                placeholder="25 Años de Producción Lineal"
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Garantía Inversores
              </label>
              <input
                type="text"
                value={cust.inverterWarrantyText !== undefined ? cust.inverterWarrantyText : DEFAULT_DOCUMENT_CUSTOMIZATION.inverterWarrantyText}
                onChange={(e) => updateDocumentCustomization({ inverterWarrantyText: e.target.value })}
                placeholder="5 a 10 Años de Fábrica"
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Garantía Baterías (si aplica)
              </label>
              <input
                type="text"
                value={cust.batteryWarrantyText !== undefined ? cust.batteryWarrantyText : DEFAULT_DOCUMENT_CUSTOMIZATION.batteryWarrantyText}
                onChange={(e) => updateDocumentCustomization({ batteryWarrantyText: e.target.value })}
                placeholder="5 a 10 Años (según fabricante)"
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Garantía Mano de Obra y Soporte
              </label>
              <input
                type="text"
                value={cust.workmanshipWarrantyText !== undefined ? cust.workmanshipWarrantyText : DEFAULT_DOCUMENT_CUSTOMIZATION.workmanshipWarrantyText}
                onChange={(e) => updateDocumentCustomization({ workmanshipWarrantyText: e.target.value })}
                placeholder="1 Año en Instalación y Soporte Técnico"
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. SECCIÓN: GESTIÓN Y SERVICIOS INCLUIDOS */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('services')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>4. Servicios y Gestiones Incluidas</span>
          </div>
          {openSection === 'services' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {openSection === 'services' && (
          <div className={`p-3 pt-1 space-y-3 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Trámites y Gestiones (Separar con comas o saltos de línea)
              </label>
              <textarea
                rows={3}
                value={cust.servicesIncludedText !== undefined ? cust.servicesIncludedText : DEFAULT_DOCUMENT_CUSTOMIZATION.servicesIncludedText}
                onChange={(e) => updateDocumentCustomization({ servicesIncludedText: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. SECCIÓN: HARDWARE Y EQUIPOS DEL SISTEMA */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('hardware')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-emerald-500" />
            <span>5. Hardware y Equipos del Sistema</span>
          </div>
          {openSection === 'hardware' ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {openSection === 'hardware' && (
          <div className={`p-3 pt-1 space-y-3 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Módulos Solares (Marca y Modelo)
              </label>
              <input
                type="text"
                value={project.specs.panelBrandModel || 'Módulos CANADIAN SOLAR TOPHIKU6 CS6.1-72TD (620W)'}
                onChange={(e) => updateSpecs({ panelBrandModel: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Modelo Inversor
                </label>
                <input
                  type="text"
                  value={project.specs.inverterBrandModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)'}
                  onChange={(e) => updateSpecs({ inverterBrandModel: e.target.value })}
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Cant.
                </label>
                <input
                  type="number"
                  value={project.specs.inverterCount || 2}
                  onChange={(e) => updateSpecs({ inverterCount: Number(e.target.value) })}
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Modelo Batería
                </label>
                <input
                  type="text"
                  value={project.specs.batteryBrandModel || 'Batería Hinaess 16 KwH-48 vdc.'}
                  onChange={(e) => updateSpecs({ batteryBrandModel: e.target.value })}
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Cant.
                </label>
                <input
                  type="number"
                  value={project.specs.batteryCount || 3}
                  onChange={(e) => updateSpecs({ batteryCount: Number(e.target.value) })}
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Descripción de Servicios e Instalación
              </label>
              <textarea
                rows={2}
                value={
                  project.specs.installationServicesDesc ||
                  'Instalación y Accesorios (Estructura de montaje, cableado, fusibles, registros, protecciones, conexión AC-DC, desconectivo, etc.).'
                }
                onChange={(e) => updateSpecs({ installationServicesDesc: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 6. SECCIÓN: QUIÉNES SOMOS Y PRESENTACIÓN INSTITUCIONAL */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('about' as any)}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" />
            <span>6. Quiénes Somos y Presentación</span>
          </div>
          {openSection === ('about' as any) ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>

        {openSection === ('about' as any) && (
          <div className={`p-3 pt-1 space-y-3 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Sitio Web
                </label>
                <input
                  type="text"
                  value={cust.companyWebsite !== undefined ? cust.companyWebsite : DEFAULT_DOCUMENT_CUSTOMIZATION.companyWebsite}
                  onChange={(e) => updateDocumentCustomization({ companyWebsite: e.target.value })}
                  placeholder="www.electsun.do"
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Usuario Instagram
                </label>
                <input
                  type="text"
                  value={cust.companyInstagram !== undefined ? cust.companyInstagram : DEFAULT_DOCUMENT_CUSTOMIZATION.companyInstagram}
                  onChange={(e) => updateDocumentCustomization({ companyInstagram: e.target.value })}
                  placeholder="Electsunrd"
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Texto "¿Quiénes Somos?" (Pág. 1 del Dossier)
              </label>
              <textarea
                rows={3}
                value={cust.aboutUsIntroText !== undefined ? cust.aboutUsIntroText : DEFAULT_DOCUMENT_CUSTOMIZATION.aboutUsIntroText}
                onChange={(e) => updateDocumentCustomization({ aboutUsIntroText: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Texto de Transición (Debajo de Servicios y antes de "¿Por Qué Elegirnos?")
              </label>
              <textarea
                rows={2}
                value={cust.aboutUsTransitionText !== undefined ? cust.aboutUsTransitionText : (DEFAULT_DOCUMENT_CUSTOMIZATION.aboutUsTransitionText || 'Descubre cómo nuestros productos y servicios pueden ayudarte a aprovechar al máximo la energía del sol.')}
                onChange={(e) => updateDocumentCustomization({ aboutUsTransitionText: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Texto "¿Por Qué Elegirnos?" / Misión
              </label>
              <textarea
                rows={3}
                value={cust.whyChooseUsText !== undefined ? cust.whyChooseUsText : DEFAULT_DOCUMENT_CUSTOMIZATION.whyChooseUsText}
                onChange={(e) => updateDocumentCustomization({ whyChooseUsText: e.target.value })}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-emerald-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-600'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* 7. SECCIÓN: DESCRIPCIÓN DEL PROYECTO & NORMATIVA SIE (PÁGINA 6) */}
      <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'border-[#2a2a36] bg-[#1a1a24]' : 'border-slate-200 bg-white'}`}>
        <button
          type="button"
          onClick={() => toggleSection('projectDescription')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#222230]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
            <span>7. Descripción del Proyecto & Normativa (Pág. 6)</span>
          </div>
          {openSection === 'projectDescription' ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        {openSection === 'projectDescription' && (
          <div className={`p-3 pt-1 space-y-3 border-t text-xs ${isDark ? 'border-[#2a2a36] bg-[#14141d]' : 'border-slate-200 bg-slate-50/50'}`}>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Personaliza los textos explicativos y el alcance técnico de ingeniería que complementan a los equipos y cálculos automáticos en la <strong className={isDark ? 'text-zinc-200' : 'text-slate-800'}>Página 6 (4. Descripción del Proyecto)</strong>.
            </p>

            <div className={`p-2 rounded-lg border text-[10.5px] flex items-center gap-2 ${isDark ? 'bg-blue-950/30 border-blue-800/50 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
              <span className="text-sm">💡</span>
              <span>
                <strong>Formato en Negrita:</strong> Puedes encerrar cualquier palabra o cifra entre <code>**asteriscos**</code> (ej. <code>**8,532 kWh**</code> o <code>**10 Módulos**</code>) para resaltarla en negrita en el PDF.
              </span>
            </div>

            {/* Subtítulo de Resumen Técnico */}
            <div>
              <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Subtítulo del Resumen Técnico
              </label>
              <input
                type="text"
                value={cust.projectSummarySubtitle || ''}
                onChange={(e) => updateDocumentCustomization({ projectSummarySubtitle: e.target.value })}
                placeholder={`Criterios de dimensionamiento técnico para ${project.client.name || 'Cliente'}`}
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-blue-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                }`}
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Si se deja en blanco, usa el valor automático con el nombre del cliente.
              </span>
            </div>

            {/* Componentes de Ingeniería y Alcance Técnico (Párrafo 2) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={`block text-[10px] font-bold uppercase ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Componentes de Ingeniería y Estructuras (Párrafo 2)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateDocumentCustomization({
                      projectEngineeringScopeText: DEFAULT_DOCUMENT_CUSTOMIZATION.projectEngineeringScopeText,
                    })
                  }
                  className="text-[10px] text-blue-500 hover:text-blue-400 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restablecer
                </button>
              </div>
              <textarea
                rows={4}
                value={
                  cust.projectEngineeringScopeText !== undefined
                    ? cust.projectEngineeringScopeText
                    : DEFAULT_DOCUMENT_CUSTOMIZATION.projectEngineeringScopeText
                }
                onChange={(e) => updateDocumentCustomization({ projectEngineeringScopeText: e.target.value })}
                placeholder="junto con todos los componentes de ingeniería complementarios..."
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors leading-relaxed ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-blue-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                }`}
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Texto explicativo que se concatena después de los inversores y baterías (ej. estructuras, cableado, protecciones CC/CA).
              </span>
            </div>

            {/* Marco Regulatorio y Normativa SIE (Caja Amarilla) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={`block text-[10px] font-bold uppercase ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Marco Regulatorio & Normativa SIE (Caja Informativa)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateDocumentCustomization({
                      regulatoryNote: DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote,
                    })
                  }
                  className="text-[10px] text-blue-500 hover:text-blue-400 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restablecer
                </button>
              </div>
              <textarea
                rows={5}
                value={cust.regulatoryNote !== undefined ? cust.regulatoryNote : DEFAULT_DOCUMENT_CUSTOMIZATION.regulatoryNote}
                onChange={(e) => updateDocumentCustomization({ regulatoryNote: e.target.value })}
                placeholder="Párrafos de la resolución SIE-007 y condiciones de medición neta..."
                className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors leading-relaxed ${
                  isDark
                    ? 'bg-[#20202c] border-[#343446] text-white focus:border-blue-500'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                }`}
              />
              <span className="text-[10px] text-zinc-500 block mt-0.5">
                Separa los párrafos con un salto de línea doble para mostrarlos como párrafos independientes en la caja informativa.
              </span>
            </div>

            {/* Párrafos Personalizados Completos (Modo Libre / Avanzado) */}
            <div className={`p-2.5 rounded-lg border ${isDark ? 'bg-[#181824] border-[#2c2c3e]' : 'bg-slate-100 border-slate-200'} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                  ✍️ Sobreescritura Libre de Párrafos (Opcional)
                </span>
                {(cust.customProjectSummaryParagraph1 || cust.customProjectSummaryParagraph2) && (
                  <button
                    type="button"
                    onClick={() =>
                      updateDocumentCustomization({
                        customProjectSummaryParagraph1: '',
                        customProjectSummaryParagraph2: '',
                      })
                    }
                    className="text-[10px] text-amber-500 hover:text-amber-400 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpiar
                  </button>
                )}
              </div>

              <div>
                <label className={`block text-[10px] font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Sobreescribir Párrafo 1 (Resumen de Consumo y Producción):
                </label>
                <textarea
                  rows={3}
                  value={cust.customProjectSummaryParagraph1 || ''}
                  onChange={(e) => updateDocumentCustomization({ customProjectSummaryParagraph1: e.target.value })}
                  placeholder="Si deseas redactar tu propio Párrafo 1 completo en lugar del generado automáticamente..."
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-amber-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-bold mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Sobreescribir Párrafo 2 (Equipos y Alcance de Instalación):
                </label>
                <textarea
                  rows={3}
                  value={cust.customProjectSummaryParagraph2 || ''}
                  onChange={(e) => updateDocumentCustomization({ customProjectSummaryParagraph2: e.target.value })}
                  placeholder="Si deseas redactar tu propio Párrafo 2 completo en lugar del generado automáticamente..."
                  className={`w-full text-xs p-2 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#20202c] border-[#343446] text-white focus:border-amber-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 8. SECCIÓN: Puntos Extra del Índice / Anexos */}
      <div
        className={`rounded-xl border overflow-hidden transition-all ${
          isDark ? 'border-[#27272a] bg-[#16161e]' : 'border-slate-200 bg-white shadow-xs'
        }`}
      >
        <button
          type="button"
          onClick={() => toggleSection('annexes')}
          className={`w-full p-3 text-left font-bold text-xs flex items-center justify-between cursor-pointer transition-colors ${
            isDark ? 'text-zinc-200 hover:bg-[#1e1e28]' : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-amber-500 shrink-0" />
            <span>8. Anexos y Puntos Extra del Índice</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                extraTocItems.length > 0
                  ? isDark
                    ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                  : isDark
                  ? 'bg-zinc-800 text-zinc-500 border-zinc-700'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {extraTocItems.length} {extraTocItems.length === 1 ? 'Anexo' : 'Anexos'}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
                openSection === 'annexes' ? 'rotate-180 text-amber-500' : ''
              }`}
            />
          </div>
        </button>

        {openSection === 'annexes' && (
          <div className="p-3.5 pt-0 space-y-3">
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              Agrega temas o secciones adicionales para que aparezcan en el <strong>Índice (Página 2)</strong> con sus números correlativos automáticos, ideal para documentos que adjuntarás externamente al PDF final (ej: Fichas técnicas, Planos, Certificaciones).
            </p>

            {/* Lista de Anexos */}
            {extraTocItems.length > 0 && (
              <div className="space-y-2">
                {extraTocItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-all ${
                      isDark ? 'bg-[#1e1e28] border-[#2e2e3e]' : 'bg-slate-50 border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 font-black text-[10px] flex items-center justify-center shrink-0">
                          +{idx + 1}
                        </span>
                        <span className={`text-xs font-bold truncate block ${isDark ? 'text-zinc-100' : 'text-slate-900'}`}>
                          {item.title}
                        </span>
                      </div>
                      {item.subtitle && (
                        <span className={`text-[10.5px] truncate block pl-5.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                          {item.subtitle}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div
                        className={`flex items-center rounded-lg border px-1.5 py-0.5 transition-all ${
                          isDark
                            ? 'bg-[#242432] border-[#38384a] focus-within:border-amber-500'
                            : 'bg-white border-slate-300 focus-within:border-amber-600'
                        }`}
                        title="Haz clic para modificar la cantidad de páginas de este anexo"
                      >
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={item.pageCount || 1}
                          onChange={(e) => handleUpdatePageCount(item.id, parseInt(e.target.value) || 1)}
                          className={`w-6 text-center font-mono font-black text-xs bg-transparent outline-none p-0 cursor-text ${
                            isDark ? 'text-amber-400' : 'text-amber-900'
                          }`}
                        />
                        <span className={`text-[10px] font-bold select-none pl-0.5 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                          {(item.pageCount || 1) === 1 ? 'pág' : 'págs'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveExtraItem(item.id)}
                        className="p-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors cursor-pointer"
                        title="Eliminar punto del índice"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario */}
            <div
              className={`p-3 rounded-xl border space-y-2.5 ${
                isDark ? 'bg-[#1a1a24] border-[#2c2c3c]' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Título del Punto Extra / Anexo
                </label>
                <input
                  type="text"
                  placeholder="ej: Fichas Técnicas de Equipos"
                  value={newExtraTitle}
                  onChange={(e) => setNewExtraTitle(e.target.value)}
                  className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors ${
                    isDark
                      ? 'bg-[#242432] border-[#38384a] text-zinc-100 focus:border-amber-500'
                      : 'bg-white border-slate-300 text-slate-800 focus:border-amber-600'
                  }`}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Subtema / Descripción (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej: Datasheets de Módulos e Inversores"
                    value={newExtraSubtitle}
                    onChange={(e) => setNewExtraSubtitle(e.target.value)}
                    className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors ${
                      isDark
                        ? 'bg-[#242432] border-[#38384a] text-zinc-100 focus:border-amber-500'
                        : 'bg-white border-slate-300 text-slate-800 focus:border-amber-600'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-bold uppercase mb-1 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    Páginas
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newExtraPageCount}
                    onChange={(e) => setNewExtraPageCount(parseInt(e.target.value) || 1)}
                    className={`w-full text-xs px-2.5 py-1.5 rounded-lg border font-medium outline-none transition-colors ${
                      isDark
                        ? 'bg-[#242432] border-[#38384a] text-zinc-100 focus:border-amber-500'
                        : 'bg-white border-slate-300 text-slate-800 focus:border-amber-600'
                    }`}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddExtraItem}
                disabled={!newExtraTitle.trim()}
                className="w-full py-2 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Añadir Punto al Índice</span>
              </button>

              {/* Plantillas Rápidas */}
              <div className="pt-2 border-t border-dashed border-zinc-700/50">
                <span className={`text-[9.5px] uppercase font-bold tracking-wider block mb-1.5 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Sugerencias Rápidas:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { title: 'Fichas Técnicas de Equipos', subtitle: 'Datasheets de Módulos e Inversores Tier-1', pageCount: 2 },
                    { title: 'Diagramas Unifilares y Planos', subtitle: 'Esquema Eléctrico y Distribución de Strings', pageCount: 1 },
                    { title: 'Certificaciones y Garantías', subtitle: 'Certificados UL, IEC y Respaldo de Fábrica', pageCount: 1 },
                    { title: 'Anexo Fotográfico de Sitio', subtitle: 'Levantamiento de Techo y Puntos de Conexión', pageCount: 1 },
                  ].map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => handleAddPreset(preset)}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                        isDark
                          ? 'bg-[#242432] border-[#38384a] text-zinc-300 hover:bg-amber-950/40 hover:text-amber-300 hover:border-amber-700/50'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-300'
                      }`}
                    >
                      + {preset.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
