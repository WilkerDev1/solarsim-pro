import React, { useEffect, useRef, useState } from 'react';
import { BookmarkCheck, Check, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { PDF_COLOR_THEMES } from '../../../constants/pdfThemes';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../../constants/defaultDocumentCustomization';
import { ELECTSUN_EMBLEM_WATERMARK_BASE64 } from '../../../assets/electsunLogo';
import { documentLogo, webHeaderLogo } from '../../../utils/documentLogo';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { DocumentCustomization, ProjectSimulation } from '../../../types';
import type { DocumentLayoutState } from '../useDocumentLayout';
import { confirmAction } from '../../common/confirmAction';

type LogoField = 'coverLogoBase64' | 'headerLogoBase64' | 'webHeaderLogoBase64' | 'watermarkLogoBase64';

interface PDFDesignControlsProps {
  isDark: boolean;
  project: ProjectSimulation;
  layout: DocumentLayoutState;
  updateDocumentCustomization: (customization: Partial<DocumentCustomization>) => void;
  saveCurrentProjectAsDefaultDocumentTemplate?: () => void;
  resetDefaultDocumentCustomization?: () => void;
}

const SECTION_TITLE = 'text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400';
const DIVIDER = <div className="h-px w-full bg-slate-200 dark:bg-[#2a2a36]" />;

/** Un logo con vista previa, subida y restauración. El archivo solo actualiza la propuesta en la que se eligió. */
const LogoField: React.FC<{
  label: string;
  hint?: string;
  field: LogoField;
  preview?: string;
  overridden: boolean;
  darkPreview?: boolean;
  project: ProjectSimulation;
  update: (customization: Partial<DocumentCustomization>) => void;
}> = ({ label, hint, field, preview, overridden, darkPreview = true, project, update }) => {
  const input = useRef<HTMLInputElement>(null);
  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const id = project.id;
    const generation = useSimulationStore.getState().sessionGeneration;
    const reader = new FileReader();
    reader.onload = () => {
      const state = useSimulationStore.getState();
      if (typeof reader.result === 'string' && state.activeProjectId === id && state.sessionGeneration === generation) update({ [field]: reader.result });
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase text-slate-700 dark:text-zinc-300">{label}</label>
        {overridden && (
          <button type="button" onClick={() => update({ [field]: undefined })} className="text-[10px] font-semibold text-red-500 hover:text-red-400 flex items-center gap-1 cursor-pointer" title="Restaurar el predeterminado">
            <Trash2 className="w-3 h-3" /> Restaurar
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <div className={`h-12 w-20 rounded-lg border flex items-center justify-center p-1 shrink-0 ${darkPreview ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
          {preview ? <img src={preview} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-[9px] text-slate-400">Sin logotipo</span>}
        </div>
        <div className="flex-1 min-w-0">
          <input ref={input} type="file" accept="image/*" aria-label={`Archivo: ${label}`} className="hidden" onChange={onFile} />
          <button type="button" onClick={() => input.current?.click()} className="w-full py-1.5 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border cursor-pointer bg-white border-slate-300 text-slate-700 hover:bg-slate-100 dark:bg-[#22222c] dark:border-[#343444] dark:text-zinc-200 dark:hover:bg-[#2a2a38]">
            <Upload className="w-3.5 h-3.5 text-emerald-500" /> {overridden ? 'Cambiar' : 'Subir'}
          </button>
          {hint && <p className="text-[9px] text-slate-400 mt-0.5">{hint}</p>}
        </div>
      </div>
    </div>
  );
};

/** Dock → Diseño: logos, marca de agua, tema y cabecera/pie. Los textos se editan en la hoja. */
export const PDFDesignControls: React.FC<PDFDesignControlsProps> = ({
  isDark,
  project,
  layout,
  updateDocumentCustomization,
  saveCurrentProjectAsDefaultDocumentTemplate,
  resetDefaultDocumentCustomization,
}) => {
  const cust = project.customization || {};
  const storedOpacity = cust.watermarkOpacity ?? DEFAULT_DOCUMENT_CUSTOMIZATION.watermarkOpacity ?? 0.15;
  const [opacity, setOpacity] = useState(storedOpacity);
  const [templateSaved, setTemplateSaved] = useState(false);

  // El control deslizante guarda tras 400 ms sin moverse; al salir de la pestaña se guarda lo pendiente.
  const pending = useRef<number | null>(null);
  const commit = useRef(updateDocumentCustomization);
  commit.current = updateDocumentCustomization;
  useEffect(() => setOpacity(storedOpacity), [storedOpacity, project.id]);
  useEffect(() => {
    pending.current = opacity === storedOpacity ? null : opacity;
    if (pending.current === null) return;
    const timer = setTimeout(() => {
      commit.current({ watermarkOpacity: opacity });
      pending.current = null;
    }, 400);
    return () => clearTimeout(timer);
  }, [opacity, storedOpacity]);
  useEffect(() => () => {
    if (pending.current !== null) commit.current({ watermarkOpacity: pending.current });
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className={SECTION_TITLE}>Paleta de Color Corporativa</h3>
        <div className="grid grid-cols-6 gap-1.5">
          {PDF_COLOR_THEMES.map((theme) => {
            const isActive = layout.theme.id === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => layout.setTheme(theme)}
                title={theme.name}
                className={`h-11 rounded-xl flex flex-col overflow-hidden border-2 transition-all cursor-pointer relative ${
                  isActive ? 'border-emerald-500 ring-2 ring-emerald-500/40 scale-105 shadow-md' : isDark ? 'border-[#2e2e3a] opacity-70 hover:opacity-100' : 'border-slate-200 opacity-80 hover:opacity-100'
                }`}
              >
                <span className="flex-1 w-full" style={{ backgroundColor: theme.primary }} />
                <span className="flex-1 w-full" style={{ backgroundColor: theme.secondary }} />
                <span className="flex-1 w-full" style={{ backgroundColor: theme.tertiary || theme.barColor }} />
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {DIVIDER}

      <div className="space-y-3">
        <h3 className={SECTION_TITLE}>Logotipos</h3>
        <LogoField label="Logotipo de portada" field="coverLogoBase64" preview={documentLogo(cust, 'cover')} overridden={!!cust.coverLogoBase64} project={project} update={updateDocumentCustomization} />
        <LogoField label="Logotipo de encabezado PDF" field="headerLogoBase64" preview={documentLogo(cust, 'header')} overridden={cust.headerLogoBase64 !== undefined} project={project} update={updateDocumentCustomization} />
        <LogoField label="Logotipo de encabezado web" field="webHeaderLogoBase64" preview={webHeaderLogo(cust)} overridden={cust.webHeaderLogoBase64 !== undefined} darkPreview={false} project={project} update={updateDocumentCustomization} />
      </div>

      {DIVIDER}

      <div className="space-y-3">
        <h3 className={SECTION_TITLE}>Marca de agua</h3>
        <LogoField
          label="Imagen de marca de agua"
          hint="Emblema o logo centrado (PNG transparente)."
          field="watermarkLogoBase64"
          preview={cust.watermarkLogoBase64 || ELECTSUN_EMBLEM_WATERMARK_BASE64}
          overridden={!!cust.watermarkLogoBase64}
          darkPreview={false}
          project={project}
          update={updateDocumentCustomization}
        />
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase text-slate-700 dark:text-zinc-300">Opacidad</label>
            <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-zinc-300">{Math.round(opacity * 100)}%</span>
          </div>
          <input type="range" min="0" max="0.5" step="0.01" value={opacity} onChange={(event) => setOpacity(parseFloat(event.target.value))} aria-label="Opacidad de la marca de agua" className="w-full accent-emerald-600" />
        </div>
      </div>

      {DIVIDER}

      <div className="space-y-2">
        <h3 className={SECTION_TITLE}>Opciones de Formato</h3>
        <label className="flex items-center justify-between p-2.5 rounded-xl border cursor-pointer bg-white border-slate-300 text-slate-800 dark:bg-[#22222d] dark:border-[#38384a] dark:text-zinc-100">
          <span className="text-xs font-semibold">Mostrar Encabezados y Pies</span>
          <input type="checkbox" checked={layout.showHeadersFooters} onChange={(event) => layout.setShowHeadersFooters(event.target.checked)} className="w-4 h-4 rounded text-emerald-600 focus:ring-0 cursor-pointer shrink-0" />
        </label>
      </div>

      {DIVIDER}

      <div className="p-3 rounded-2xl border bg-gradient-to-br from-indigo-50/70 to-slate-50 border-indigo-200/80 dark:from-[#181822] dark:to-[#181822] dark:border-[#2e2e42] space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <BookmarkCheck className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 dark:text-zinc-100">Plantilla de la empresa</h4>
            <p className="text-[10.5px] leading-relaxed mt-0.5 text-slate-600 dark:text-zinc-400">
              Los textos se guardan uno a uno desde la hoja (<strong>Guardar en plantilla</strong>). Aquí puedes guardar toda la propuesta de una vez.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const before = useSimulationStore.getState().documentTemplatesByCompany;
              (saveCurrentProjectAsDefaultDocumentTemplate ?? useSimulationStore.getState().saveCurrentProjectAsDefaultDocumentTemplate)();
              setTemplateSaved(before !== useSimulationStore.getState().documentTemplatesByCompany);
              setTimeout(() => setTemplateSaved(false), 2500);
            }}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95 text-white ${templateSaved ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}
          >
            {templateSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5 text-amber-300" />}
            <span>{templateSaved ? '¡Plantilla guardada!' : 'Guardar toda la propuesta'}</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await confirmAction({ title: 'Restablecer plantilla', message: '¿Deseas restablecer la plantilla predeterminada de propuestas a los valores de fábrica originales?', confirmLabel: 'Restablecer', tone: 'danger' })) {
                (resetDefaultDocumentCustomization ?? useSimulationStore.getState().resetDefaultDocumentCustomization)();
              }
            }}
            className="py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 border cursor-pointer bg-white border-slate-300 text-slate-700 hover:bg-slate-100 dark:bg-[#222230] dark:border-[#36364a] dark:text-zinc-300"
            title="Restablecer plantilla a los valores de fábrica"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[11px]">Fábrica</span>
          </button>
        </div>
      </div>
    </div>
  );
};
