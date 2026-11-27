import React, { useId, useState } from 'react';
import { LayoutTemplate, PenLine, Pipette, Save } from 'lucide-react';
import { QUOTATION_LIBRARY_LIMITS, defaultQuotationSignature, designFromTemplate, templateFromQuotation, type QuotationDesign } from '../../../../shared/quotations';
import type { QuotationContent } from '../../../types/quotation';
import type { QuotationSignature, QuotationTemplate } from '../../../types/quotationLibrary';
import { setDesign } from '../../../domain/quotationEdit';
import { ACCENT_SWATCHES } from '../../../features/quotations/library';
import { useAssetImage } from '../../../features/quotations/assetImages';
import { InfoTip } from '../../simulator/params/ui/InfoTip';
import type { Edit } from './ContentSections';

interface DesignTabProps {
  content: QuotationContent;
  readOnly: boolean;
  /** Puede crear plantillas (rol con escritura), aunque la cotización esté bloqueada. */
  canSaveTemplate: boolean;
  edit: Edit;
  templates: readonly QuotationTemplate[];
  signatures: readonly QuotationSignature[];
  saveTemplate: (name: string) => string | null;
  openLibrary: (section: 'templates' | 'signatures') => void;
  /** Color que se está eligiendo (solo la vista previa); `null` al confirmarlo o descartarlo. */
  onPreviewAccent?: (accent: string | null) => void;
}

const LAYOUTS: { value: QuotationDesign['layout']; label: string; hint: string }[] = [
  { value: 'clasica', label: 'Clásica', hint: 'Barra fina y tabla gris' },
  { value: 'banda', label: 'Banda', hint: 'Encabezado a color' },
  { value: 'minimal', label: 'Minimal', hint: 'Solo líneas' },
];

/** Miniatura de la disposición, con el acento actual: dice de un vistazo qué cambia entre Clásica, Banda y Minimal. */
const LayoutThumb: React.FC<{ layout: QuotationDesign['layout']; accent: string }> = ({ layout, accent }) => {
  const banda = layout === 'banda';
  const minimal = layout === 'minimal';
  return (
    <span className="qe-thumb" aria-hidden="true">
      <span style={{ height: banda ? 26 : layout === 'clasica' ? 4 : 0, background: accent, flexShrink: 0 }} />
      <span className="qe-thumb-body">
        <span className="qe-thumb-head"><i style={{ background: banda ? '#b9c3ce' : accent }} /><i /></span>
        <span className="qe-thumb-rule" />
        <i className="qe-thumb-th" style={{ background: banda ? accent : minimal ? 'transparent' : '#e3e8ee', borderBottom: minimal ? '1px solid #182230' : undefined, borderRadius: minimal ? 0 : 2 }} />
        <i className="qe-thumb-line" /><i className="qe-thumb-line" /><i className="qe-thumb-line" />
        <i className="qe-thumb-total" />
      </span>
    </span>
  );
};

const Switch: React.FC<{ label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }> = ({ label, checked, disabled, onChange }) => {
  const id = useId();
  return (
    <div className="qe-switch-row">
      <span id={id}>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled} className="qe-switch" onClick={() => onChange(!checked)}>
        <span aria-hidden="true" />
      </button>
    </div>
  );
};

const SignatureThumb: React.FC<{ image: string; name: string }> = ({ image, name }) => {
  const src = useAssetImage(image);
  return <span className="qe-signer-thumb">{src ? <img src={src} alt={`Firma de ${name}`} className="h-auto max-h-[28px] w-auto max-w-[72px]" /> : <PenLine className="h-4 w-4" aria-hidden="true" />}</span>;
};

/** Pestaña «Plantilla y firmas»: todo edita `design` y se ve al instante en la vista previa. */
export const DesignTab: React.FC<DesignTabProps> = ({ content, readOnly, canSaveTemplate, edit, templates, signatures, saveTemplate, openLibrary, onPreviewAccent }) => {
  const { design } = content;
  const [error, setError] = useState<string | null>(null);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const change = (patch: Partial<QuotationDesign>) => setError(edit((c) => setDesign(c, patch)));
  const signers = signatures.filter((s) => s.kind === 'signature');
  const defaultSigner = defaultQuotationSignature(signatures, 'signature');
  const selectedSigner = (design.signatureId && signers.some((s) => s.id === design.signatureId) ? design.signatureId : defaultSigner?.id) ?? null;
  const hasStamp = !!defaultQuotationSignature(signatures, 'stamp');
  const isSwatch = ACCENT_SWATCHES.some((s) => s.value === design.accent);
  const submitTemplate = () => {
    const name = (naming ?? '').trim();
    if (!name) return setError('Escribe un nombre para la plantilla.');
    const failure = saveTemplate(name);
    setError(failure);
    if (!failure) { setSaved(`Plantilla «${name}» guardada.`); setNaming(null); }
  };

  return (
    <>
      <section className="qe-card" aria-labelledby="qe-template-title">
        <div className="qe-card-head">
          <h2 id="qe-template-title">Plantilla</h2>
          <button type="button" className="qe-link" onClick={() => openLibrary('templates')}>Gestionar plantillas</button>
        </div>
        <div className="qe-layouts" role="group" aria-label="Disposición de la hoja">
          {LAYOUTS.map((layout) => (
            <button key={layout.value} type="button" className="qe-layout" aria-pressed={design.layout === layout.value} disabled={readOnly} onClick={() => change({ layout: layout.value })}>
              <LayoutThumb layout={layout.value} accent={customAccent ?? design.accent} />
              <span className="qe-layout-text">
                <span className="qe-layout-name">{layout.label}</span>
                <span className="qe-layout-hint">{layout.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {templates.length > 0 && (
          <>
            <div className="qe-subhead"><span>Plantillas guardadas</span></div>
            <div className="qe-choice-list" role="group" aria-label="Plantillas guardadas">
              {templates.map((template) => {
                const selected = design.templateId === template.id;
                return (
                  <button key={template.id} type="button" className="qe-choice" aria-pressed={selected} disabled={readOnly} onClick={() => change(designFromTemplate(template))}>
                    <span className="qe-radio" aria-hidden="true" />
                    <span className="qe-choice-text">
                      <span className="qe-choice-name">{template.name}{template.isDefault && <span className="qe-chip">Predeterminada</span>}</span>
                      <span className="qe-choice-hint">{template.description || `${LAYOUTS.find((l) => l.value === template.design.layout)?.label} · ${template.design.typography === 'serif' ? 'Serif' : 'Sans'}`}</span>
                    </span>
                    <span className="qe-choice-swatch" style={{ background: template.design.accent }} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="qe-card" aria-labelledby="qe-appearance-title">
        <div className="qe-card-head"><h2 id="qe-appearance-title">Apariencia</h2></div>
        <div className="qe-setting">
          <div className="qe-setting-text">
            <span id="qe-accent-label">Color de acento</span>
            <small>Encabezado, número y tabla</small>
          </div>
          <div className="qe-swatches" role="group" aria-labelledby="qe-accent-label">
            {ACCENT_SWATCHES.map((swatch) => (
              <button key={swatch.value} type="button" className="qe-swatch" style={{ background: swatch.value }} aria-label={swatch.label} title={swatch.label} aria-pressed={design.accent === swatch.value} disabled={readOnly} onClick={() => change({ accent: swatch.value })} />
            ))}
            <label className="qe-swatch-custom" data-selected={!isSwatch} title="Color personalizado" style={!isSwatch ? { background: customAccent ?? design.accent } : undefined}>
              <span className="sr-only">Color personalizado</span>
              <input
                type="color"
                value={customAccent ?? design.accent}
                disabled={readOnly}
                onChange={(event) => { setCustomAccent(event.target.value); onPreviewAccent?.(event.target.value.toLowerCase()); }}
                onBlur={() => { if (customAccent && customAccent !== design.accent) change({ accent: customAccent.toLowerCase() }); setCustomAccent(null); onPreviewAccent?.(null); }}
              />
              {isSwatch && <Pipette className="h-3.5 w-3.5" aria-hidden="true" />}
            </label>
          </div>
        </div>
        <div className="qe-setting">
          <div className="qe-setting-text">
            <span id="qe-font-label">Tipografía de títulos</span>
            <small>Título y total general</small>
          </div>
          <div className="qe-segmented qe-segmented-compact" role="group" aria-labelledby="qe-font-label">
            <button type="button" aria-pressed={design.typography === 'sans'} disabled={readOnly} onClick={() => change({ typography: 'sans' })}>Sans</button>
            <button type="button" aria-pressed={design.typography === 'serif'} disabled={readOnly} style={{ fontFamily: 'Georgia, serif' }} onClick={() => change({ typography: 'serif' })}>Serif</button>
          </div>
        </div>
      </section>

      <section className="qe-card" aria-labelledby="qe-signature-title">
        <div className="qe-card-head">
          <h2 id="qe-signature-title">Firma y sello</h2>
          <button type="button" className="qe-link" onClick={() => openLibrary('signatures')}>{signers.length ? 'Firmas y sellos' : 'Importar firma'}</button>
        </div>
        {signers.length ? (
          <div className="qe-choice-list" role="group" aria-label="Quién firma">
            {signers.map((signer) => (
              <button key={signer.id} type="button" className="qe-choice" aria-pressed={selectedSigner === signer.id} disabled={readOnly || !design.showSignature} onClick={() => change({ signatureId: signer.id })}>
                <span className="qe-radio" aria-hidden="true" />
                <span className="qe-choice-text">
                  <span className="qe-choice-name">{signer.name}</span>
                  <span className="qe-choice-hint">{[signer.role || 'Sin cargo', signer.isDefault && 'predeterminada'].filter(Boolean).join(' · ')}</span>
                </span>
                <SignatureThumb image={signer.image} name={signer.name} />
              </button>
            ))}
          </div>
        ) : (
          <p className="qe-muted">Sin firmas importadas: bajo la raya se imprime el vendedor y queda el espacio para firmar a mano.</p>
        )}
        <Switch label="Mostrar la firma en el documento" checked={design.showSignature} disabled={readOnly} onChange={(showSignature) => change({ showSignature })} />
        <div className="qe-switch-with-tip">
          <Switch label="Sello de la empresa" checked={design.showStamp} disabled={readOnly} onChange={(showStamp) => change({ showStamp })} />
          <InfoTip
            label="De dónde sale el sello"
            text={hasStamp ? 'Se imprime el sello predeterminado de la organización.' : 'Sin sello importado se imprime el del membrete o, si no hay, uno generado con el logo, el RNC y el teléfono del emisor.'}
          />
        </div>
      </section>

      {canSaveTemplate && (
        naming === null ? (
          <button type="button" className="qe-btn qe-btn-block" onClick={() => { setSaved(null); setError(null); setNaming(''); }}>
            <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
            Guardar este diseño como plantilla
          </button>
        ) : (
          <div className="qe-card qe-inline-form">
            <div className="qe-field">
              <label htmlFor="qe-template-name">Nombre de la plantilla</label>
              <input id="qe-template-name" autoFocus value={naming} maxLength={QUOTATION_LIBRARY_LIMITS.name} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitTemplate(); if (e.key === 'Escape') setNaming(null); }} />
              <p className="qe-field-hint">Guarda la disposición, el color, la tipografía, la firma y el sello, las notas, las condiciones de pago y la vigencia.</p>
            </div>
            <div className="qe-actions">
              <button type="button" className="qe-btn qe-btn-primary qe-btn-sm" onClick={submitTemplate}><Save className="h-4 w-4" aria-hidden="true" />Guardar plantilla</button>
              <button type="button" className="qe-btn qe-btn-sm" onClick={() => setNaming(null)}>Cancelar</button>
            </div>
          </div>
        )
      )}
      {saved && <p className="qe-field-hint" role="status">{saved}</p>}
      {error && <p className="qe-field-error" role="alert">{error}</p>}
    </>
  );
};

/** Contenido de plantilla a partir de la cotización (lo usa «Guardar como plantilla»). */
export const templateContentOf = (content: QuotationContent, name: string) => templateFromQuotation(content, name);
