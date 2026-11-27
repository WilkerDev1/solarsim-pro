import React, { useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowLeft, Copy, ImageUp, PenLine, Plus, RefreshCw, Star, Stamp, Trash2 } from 'lucide-react';
import { canWrite } from '../../../../shared/permissions';
import { DOCUMENT_IMAGE_TYPES, checkDocumentDataUrl, sniffDocumentFileType } from '../../../../shared/fileSignatures';
import { QUOTATION_LIBRARY_LIMITS, QUOTATION_LIMITS, type QuotationDesign } from '../../../../shared/quotations';
import { useSimulationStore } from '../../../store/useSimulationStore';
import type { LibraryChange, LibraryKind, QuotationSignature, QuotationSignatureKind, QuotationTemplate } from '../../../types/quotationLibrary';
import { ACCENT_SWATCHES } from '../../../features/quotations/library';
import { useAssetImage } from '../../../features/quotations/assetImages';
import { newDocumentCompany } from '../../../features/quotations/issuer';
import { bytesToDataUrl } from '../../../utils/dataUrl';
import { confirmAction } from '../../common/confirmAction';
import { InfoTip } from '../../simulator/params/ui/InfoTip';
import { NumberField, TextField } from '../editor/fields';
import '../editor/quotation-editor.css';
import './quotation-library.css';

const LAYOUT_LABELS: Record<QuotationDesign['layout'], string> = { clasica: 'Clásica', banda: 'Banda', minimal: 'Minimal' };

/**
 * Gestor de plantillas, firmas y sellos de cotización (docs/QUOTATION_EDITOR.md#plantillas-firmas-y-sellos). Se abre
 * desde el catálogo de cotizaciones y desde la pestaña «Plantilla y firmas»; cada cambio pasa por la acción del store.
 */
export const QuotationLibraryView: React.FC = () => {
  const { section, sidebarTheme, currentUser, online, feedback, close, open, sync } = useSimulationStore(useShallow((s) => ({
    section: s.quotationLibrarySection,
    sidebarTheme: s.sidebarTheme,
    currentUser: s.syncSettings.currentUser,
    online: !!s.syncSettings.currentUser && !!s.syncSettings.authToken,
    feedback: s.quotationLibrarySyncFeedback,
    close: s.closeQuotationLibrary,
    open: s.openQuotationLibrary,
    sync: s.syncQuotationLibraryWithServer,
  })));
  const writable = canWrite(currentUser);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const runSync = async () => {
    setSyncing(true);
    const result = await sync();
    setMessage(result.message);
    setSyncing(false);
  };
  return (
    <div className="quotation-editor quotation-library" data-theme={sidebarTheme}>
      <header className="qe-header">
        <div className="qe-header-identity">
          <button type="button" className="qe-back" onClick={close}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver</button>
          <span className="qe-divider" aria-hidden="true" />
          <h1>Plantillas, firmas y sellos</h1>
          <span className="qe-save">{currentUser ? 'Compartidas con tu organización' : 'Guardadas en este equipo'}</span>
        </div>
        {online && (
          <div className="qe-actions">
            <button type="button" className="qe-btn" disabled={syncing} aria-busy={syncing} onClick={() => void runSync()}>
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />{syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          </div>
        )}
      </header>
      <div className="ql-body">
        <nav className="ql-nav" aria-label="Recursos">
          <span className="ql-nav-title">Recursos</span>
          {(['templates', 'signatures'] as const).map((id) => (
            <button key={id} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => open(id)}>
              {id === 'templates' ? 'Plantillas' : 'Firmas y sellos'}
            </button>
          ))}
        </nav>
        <main className="ql-main">
          {online && feedback && <p className="qe-field-error" role="alert">{feedback}</p>}
          {message && message !== feedback && <p className="qe-field-hint" role="status">{message}</p>}
          {!writable && <p className="qe-lock-notice" role="note">Solo lectura: tu rol no permite cambiar plantillas ni firmas.</p>}
          {section === 'templates' ? <TemplatesSection writable={writable} /> : <SignaturesSection writable={writable} />}
        </main>
      </div>
    </div>
  );
};

/** Conflicto o rechazo de un registro, con las dos salidas (mismo criterio que las cotizaciones). */
const ChangeIssue: React.FC<{ kind: LibraryKind; id: string; change?: LibraryChange<unknown> }> = ({ kind, id, change }) => {
  if (!change || (change.server === undefined && !change.rejected)) return null;
  const resolve = (resolution: 'accept_server' | 'keep_local') => useSimulationStore.getState().resolveQuotationLibraryConflict(kind, id, resolution);
  const text = change.server === null
    ? 'La eliminaron en el servidor mientras tenía cambios aquí. Conservarla crea una copia nueva.'
    : change.server
      ? 'Cambió en el servidor mientras la editabas.'
      : `El servidor rechazó el cambio: ${change.rejected!.error}`;
  return (
    <div className="ql-issue" role="note">
      <span>{text}</span>
      <div className="qe-actions">
        <button type="button" className="qe-btn qe-btn-sm" onClick={() => resolve('accept_server')}>Usar la del servidor</button>
        <button type="button" className="qe-btn qe-btn-sm" onClick={() => resolve('keep_local')}>Conservar la mía</button>
      </div>
    </div>
  );
};

const TemplatesSection: React.FC<{ writable: boolean }> = ({ writable }) => {
  const { templates, changes, signatures } = useSimulationStore(useShallow((s) => ({
    templates: s.quotationLibrary.templates.items, changes: s.quotationLibrary.templates.changes, signatures: s.quotationLibrary.signatures.items,
  })));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const store = () => useSimulationStore.getState();
  const create = () => {
    const result = store().createQuotationTemplate({ name: `Plantilla ${templates.length + 1}` });
    if (!result.ok) return setError(result.error);
    setEditing(result.record.id);
  };
  const remove = async (template: QuotationTemplate) => {
    if (!(await confirmAction({ title: `Eliminar la plantilla «${template.name}»`, message: 'Las cotizaciones que la usaron conservan su diseño. No se puede deshacer.', confirmLabel: 'Eliminar' }))) return;
    const result = store().deleteQuotationTemplate(template.id);
    setError(result.ok ? null : result.error);
  };
  const run = (result: { ok: boolean; error?: string }) => setError(result.ok ? null : result.error ?? null);
  return (
    <section aria-labelledby="ql-templates-title" className="ql-section">
      <div className="ql-section-head">
        <div>
          <h2 id="ql-templates-title">Plantillas</h2>
          <p className="qe-muted">Cada plantilla guarda diseño, color, tipografía, firma, sello y los textos por defecto. La predeterminada se aplica a las cotizaciones nuevas.</p>
        </div>
        {writable && <button type="button" className="qe-btn qe-btn-primary" onClick={create}><Plus className="h-4 w-4" aria-hidden="true" />Nueva plantilla</button>}
      </div>
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      {!templates.length && <p className="qe-muted">Aún no hay plantillas. Crea una aquí o guarda el diseño de una cotización desde su pestaña «Plantilla y firmas».</p>}
      <ul className="ql-grid">
        {templates.map((template) => (
          <li key={template.id} className="qe-card ql-template">
            <div className="ql-thumb" data-layout={template.design.layout} style={{ '--ql-accent': template.design.accent } as React.CSSProperties} aria-hidden="true">
              <span className="ql-thumb-bar" /><span className="ql-thumb-line" /><span className="ql-thumb-line ql-thumb-short" /><span className="ql-thumb-table" />
            </div>
            <div className="ql-template-text">
              <h3>{template.name}{template.isDefault && <span className="qe-chip">Predeterminada</span>}</h3>
              <p className="qe-muted">{template.description || `${LAYOUT_LABELS[template.design.layout]} · ${template.design.typography === 'serif' ? 'Serif' : 'Sans'}${template.validityDays ? ` · vigencia ${template.validityDays} días` : ''}`}</p>
            </div>
            <ChangeIssue kind="templates" id={template.id} change={changes[template.id]} />
            {writable && (
              <div className="qe-actions">
                <button type="button" className="qe-btn qe-btn-sm" aria-expanded={editing === template.id} onClick={() => setEditing(editing === template.id ? null : template.id)}><PenLine className="h-4 w-4" aria-hidden="true" />{editing === template.id ? 'Cerrar' : 'Editar'}</button>
                <button type="button" className="qe-btn qe-btn-sm" onClick={() => run(store().duplicateQuotationTemplate(template.id))}><Copy className="h-4 w-4" aria-hidden="true" />Duplicar</button>
                {!template.isDefault
                  ? <button type="button" className="qe-btn qe-btn-sm" onClick={() => run(store().setDefaultQuotationTemplate(template.id))}><Star className="h-4 w-4" aria-hidden="true" />Predeterminada</button>
                  : <button type="button" className="qe-btn qe-btn-sm" onClick={() => run(store().setDefaultQuotationTemplate(null))}>Quitar predeterminada</button>}
                <button type="button" className="qe-icon-btn qe-danger" aria-label={`Eliminar la plantilla ${template.name}`} onClick={() => void remove(template)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            )}
            {writable && editing === template.id && <TemplateEditor template={template} signatures={signatures} />}
          </li>
        ))}
      </ul>
    </section>
  );
};

const TemplateEditor: React.FC<{ template: QuotationTemplate; signatures: readonly QuotationSignature[] }> = ({ template, signatures }) => {
  const save = (changes: Partial<QuotationTemplate>) => {
    const result = useSimulationStore.getState().updateQuotationTemplate(template.id, changes);
    return result.ok ? null : result.error;
  };
  const design = (patch: Partial<QuotationTemplate['design']>) => {
    const next = { ...template.design, ...patch };
    if ('signatureId' in patch && !patch.signatureId) delete next.signatureId;
    return save({ design: next });
  };
  const [error, setError] = useState<string | null>(null);
  const signers = signatures.filter((s) => s.kind === 'signature');
  return (
    <div className="ql-editor">
      <div className="qe-grid-2">
        <TextField label="Nombre" value={template.name} maxLength={QUOTATION_LIBRARY_LIMITS.name} onCommit={(name) => save({ name })} />
        <TextField label="Descripción" value={template.description} maxLength={QUOTATION_LIBRARY_LIMITS.description} onCommit={(description) => save({ description })} />
      </div>
      <div className="qe-field">
        <span className="qe-label" id={`ql-layout-${template.id}`}>Disposición</span>
        <div className="qe-segmented qe-segmented-3" role="group" aria-labelledby={`ql-layout-${template.id}`}>
          {(Object.keys(LAYOUT_LABELS) as QuotationDesign['layout'][]).map((layout) => (
            <button key={layout} type="button" aria-pressed={template.design.layout === layout} onClick={() => setError(design({ layout }))}>{LAYOUT_LABELS[layout]}</button>
          ))}
        </div>
      </div>
      <div className="qe-field">
        <span className="qe-label" id={`ql-accent-${template.id}`}>Color de acento</span>
        <div className="qe-swatches" role="group" aria-labelledby={`ql-accent-${template.id}`}>
          {ACCENT_SWATCHES.map((swatch) => (
            <button key={swatch.value} type="button" className="qe-swatch" style={{ background: swatch.value }} aria-label={swatch.label} aria-pressed={template.design.accent === swatch.value} onClick={() => setError(design({ accent: swatch.value }))} />
          ))}
          <label className="qe-swatch-custom" data-selected={!ACCENT_SWATCHES.some((s) => s.value === template.design.accent)}>
            <span className="sr-only">Color personalizado</span>
            <input type="color" defaultValue={template.design.accent} onBlur={(event) => { if (event.target.value !== template.design.accent) setError(design({ accent: event.target.value.toLowerCase() })); }} />
            <span aria-hidden="true">Otro</span>
          </label>
        </div>
      </div>
      <div className="qe-grid-2">
        <div className="qe-field">
          <span className="qe-label" id={`ql-font-${template.id}`}>Tipografía de títulos</span>
          <div className="qe-segmented" role="group" aria-labelledby={`ql-font-${template.id}`}>
            <button type="button" aria-pressed={template.design.typography === 'sans'} onClick={() => setError(design({ typography: 'sans' }))}>Sans</button>
            <button type="button" aria-pressed={template.design.typography === 'serif'} style={{ fontFamily: 'Georgia, serif' }} onClick={() => setError(design({ typography: 'serif' }))}>Serif</button>
          </div>
        </div>
        <div className="qe-field">
          <label htmlFor={`ql-signer-${template.id}`}>Firma</label>
          <select id={`ql-signer-${template.id}`} value={template.design.signatureId ?? ''} onChange={(event) => setError(design({ signatureId: event.target.value || undefined }))}>
            <option value="">La predeterminada</option>
            {signers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` — ${s.role}` : ''}</option>)}
          </select>
        </div>
      </div>
      <div className="ql-checks">
        <label className="qe-check"><input type="checkbox" checked={template.design.showSignature} onChange={(event) => setError(design({ showSignature: event.target.checked }))} />Mostrar la firma</label>
        <label className="qe-check"><input type="checkbox" checked={template.design.showStamp} onChange={(event) => setError(design({ showStamp: event.target.checked }))} />Sello de la empresa</label>
      </div>
      <NumberField
        label="Vigencia (días)"
        hint="Vacío o 0: sin vigencia. La fecha se calcula desde la emisión."
        value={template.validityDays ?? 0}
        format={(days) => (days ? String(days) : '')}
        onCommit={(days) => save({ validityDays: days ? Math.round(days) : null })}
      />
      <TextField label="Condiciones de pago" multiline rows={3} value={template.paymentTerms} maxLength={QUOTATION_LIMITS.paymentTerms} onCommit={(paymentTerms) => save({ paymentTerms })} />
      <TextField label="Notas" multiline rows={4} value={template.notes} maxLength={QUOTATION_LIMITS.notes} onCommit={(notes) => save({ notes })} />
      {error && <p className="qe-field-error" role="alert">{error}</p>}
    </div>
  );
};

const KIND_TEXT: Record<QuotationSignatureKind, { title: string; empty: string; import: string; name: string }> = {
  signature: { title: 'Firmas', empty: 'Sin firmas. Importa la imagen de una firma (PNG con fondo transparente queda mejor).', import: 'Importar firma', name: 'Firma' },
  stamp: { title: 'Sellos', empty: 'Sin sellos. Importa el sello escaneado o usa el del membrete.', import: 'Importar sello', name: 'Sello' },
};

/** Imagen elegida → data URL validado por su contenido real (png/jpeg/webp) y su tamaño. */
async function readSignatureImage(file: File): Promise<{ ok: true; image: string } | { ok: false; error: string }> {
  if (file.size > QUOTATION_LIBRARY_LIMITS.signatureImageBytes) return { ok: false, error: `La imagen supera ${QUOTATION_LIBRARY_LIMITS.signatureImageBytes / 1024} KB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffDocumentFileType(bytes.subarray(0, 16));
  if (!type || !DOCUMENT_IMAGE_TYPES.includes(type as never)) return { ok: false, error: 'Formato no admitido: usa una imagen PNG, JPEG o WebP.' };
  const image = bytesToDataUrl(bytes, type);
  const checked = checkDocumentDataUrl(image, { allowed: DOCUMENT_IMAGE_TYPES, maxBytes: QUOTATION_LIBRARY_LIMITS.signatureImageBytes });
  return checked.ok ? { ok: true, image } : { ok: false, error: 'La imagen no es válida.' };
}

const SignaturesSection: React.FC<{ writable: boolean }> = ({ writable }) => {
  const { signatures, changes, company } = useSimulationStore(useShallow((s) => ({
    signatures: s.quotationLibrary.signatures.items, changes: s.quotationLibrary.signatures.changes, company: newDocumentCompany(s),
  })));
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<{ kind: QuotationSignatureKind; replace?: string } | null>(null);
  const store = () => useSimulationStore.getState();
  const pick = (kind: QuotationSignatureKind, replace?: string) => { pending.current = { kind, replace }; input.current?.click(); };
  const imported = async (file: File) => {
    const target = pending.current;
    if (!target) return;
    const read = await readSignatureImage(file);
    if (!read.ok) return setError(read.error);
    const name = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim().slice(0, QUOTATION_LIBRARY_LIMITS.name) || KIND_TEXT[target.kind].name;
    const result = target.replace
      ? store().updateQuotationSignature(target.replace, { image: read.image })
      : store().createQuotationSignature({ kind: target.kind, name, image: read.image, isDefault: !signatures.some((s) => s.kind === target.kind) });
    setError(result.ok ? null : result.error);
  };
  // El sello del membrete (o su logo, p. ej. el de Electsun) como sello reutilizable de la organización.
  const companySeal = [company?.signatureSealBase64, company?.logoBase64].find((image) => !!image && checkDocumentDataUrl(image, { allowed: DOCUMENT_IMAGE_TYPES, maxBytes: QUOTATION_LIBRARY_LIMITS.signatureImageBytes }).ok);
  const useCompanySeal = () => {
    const result = store().createQuotationSignature({ kind: 'stamp', name: `Sello ${company?.name ?? ''}`.trim().slice(0, QUOTATION_LIBRARY_LIMITS.name), image: companySeal!, isDefault: !signatures.some((s) => s.kind === 'stamp') });
    setError(result.ok ? null : result.error);
  };
  const remove = async (signature: QuotationSignature) => {
    if (!(await confirmAction({ title: `Eliminar «${signature.name}»`, message: 'Las cotizaciones que la usaban imprimirán la predeterminada. No se puede deshacer.', confirmLabel: 'Eliminar' }))) return;
    const result = store().deleteQuotationSignature(signature.id);
    setError(result.ok ? null : result.error);
  };
  return (
    <section aria-labelledby="ql-signatures-title" className="ql-section">
      <div className="ql-section-head">
        <div>
          <h2 id="ql-signatures-title">Firmas y sellos</h2>
          <p className="qe-muted">Se importan una vez y se reutilizan en cualquier cotización o plantilla.</p>
        </div>
        {writable && (
          <div className="qe-actions">
            <button type="button" className="qe-btn qe-btn-primary" onClick={() => pick('signature')}><ImageUp className="h-4 w-4" aria-hidden="true" />Importar firma</button>
            <button type="button" className="qe-btn" onClick={() => pick('stamp')}><Stamp className="h-4 w-4" aria-hidden="true" />Importar sello</button>
            {companySeal && <button type="button" className="qe-btn" onClick={useCompanySeal}>Usar el sello del membrete</button>}
            <InfoTip label="Formatos admitidos" text={`PNG, JPEG o WebP de hasta ${QUOTATION_LIBRARY_LIMITS.signatureImageBytes / 1024} KB. Se comprueba el contenido real del archivo.`} />
          </div>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void imported(file); event.target.value = ''; }} />
      {error && <p className="qe-field-error" role="alert">{error}</p>}
      {(['signature', 'stamp'] as const).map((kind) => {
        const items = signatures.filter((s) => s.kind === kind);
        return (
          <div key={kind} className="ql-kind">
            <h3>{KIND_TEXT[kind].title}</h3>
            {!items.length && <p className="qe-muted">{KIND_TEXT[kind].empty}</p>}
            <ul className="ql-grid">
              {items.map((signature) => (
                <li key={signature.id} className="qe-card ql-signature">
                  <SignaturePreview image={signature.image} name={signature.name} />
                  {writable ? (
                    <div className="qe-grid-2">
                      <TextField label="Nombre" value={signature.name} maxLength={QUOTATION_LIBRARY_LIMITS.name} onCommit={(name) => { const r = store().updateQuotationSignature(signature.id, { name }); return r.ok ? null : r.error; }} />
                      {kind === 'signature' && <TextField label="Cargo" value={signature.role} maxLength={QUOTATION_LIBRARY_LIMITS.role} placeholder="Ventas" onCommit={(role) => { const r = store().updateQuotationSignature(signature.id, { role }); return r.ok ? null : r.error; }} />}
                    </div>
                  ) : (
                    <p><strong>{signature.name}</strong>{signature.role ? ` · ${signature.role}` : ''}</p>
                  )}
                  {signature.isDefault && <span className="qe-chip">Predeterminada</span>}
                  <ChangeIssue kind="signatures" id={signature.id} change={changes[signature.id]} />
                  {writable && (
                    <div className="qe-actions">
                      {!signature.isDefault && <button type="button" className="qe-btn qe-btn-sm" onClick={() => { const r = store().setDefaultQuotationSignature(signature.id); setError(r.ok ? null : r.error); }}><Star className="h-4 w-4" aria-hidden="true" />Predeterminada</button>}
                      <button type="button" className="qe-btn qe-btn-sm" onClick={() => pick(kind, signature.id)}><ImageUp className="h-4 w-4" aria-hidden="true" />Reemplazar</button>
                      <button type="button" className="qe-icon-btn qe-danger" aria-label={`Eliminar ${signature.name}`} onClick={() => void remove(signature)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
};

const SignaturePreview: React.FC<{ image: string; name: string }> = ({ image, name }) => {
  const src = useAssetImage(image);
  return (
    <div className="ql-signature-image">
      {src ? <img src={src} alt={name} className="h-auto max-h-[72px] w-auto max-w-[220px]" /> : <span className="qe-muted">Imagen en el servidor</span>}
    </div>
  );
};
