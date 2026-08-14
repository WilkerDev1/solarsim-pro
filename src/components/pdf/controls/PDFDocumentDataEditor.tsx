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
} from 'lucide-react';
import { ProjectSimulation, DocumentCustomization } from '../../../types';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import {
  ELECTSUN_LOGO_WHITE_BASE64,
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
  const headerLogoInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  // Accordion state
  const [openSection, setOpenSection] = useState<'company' | 'contact' | 'warranties' | 'services' | 'hardware'>('company');

  const toggleSection = (section: 'company' | 'contact' | 'warranties' | 'services' | 'hardware') => {
    setOpenSection(openSection === section ? ('' as any) : section);
  };

  const handleResetCompanyDefaults = () => {
    updateDocumentCustomization({
      companyName: DEFAULT_DOCUMENT_CUSTOMIZATION.companyName,
      companySlogan: DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan,
      companyFooterText: DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText,
      headerLogoBase64: undefined,
      watermarkLogoBase64: undefined,
      watermarkOpacity: DEFAULT_DOCUMENT_CUSTOMIZATION.watermarkOpacity,
    });
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
                  value={cust.clientPhone !== undefined ? cust.clientPhone : (project.client.contactPhone || '809-555-0199')}
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
    </div>
  );
};
