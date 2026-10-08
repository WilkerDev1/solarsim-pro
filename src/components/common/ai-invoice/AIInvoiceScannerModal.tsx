import React, { useEffect, useRef, useState } from 'react';
import { X, Settings, Paperclip, Send, FileText, RotateCcw, Square, ArrowRight } from 'lucide-react';
import { useAIInvoiceScanner } from './hooks/useAIInvoiceScanner';
import { ProposalDraftReview } from './components/ProposalDraftReview';
import './proposal-workspace.css';

export const AIInvoiceScannerModal: React.FC = () => {
  const ai = useAIInvoiceScanner();
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!ai.isAIInvoiceModalOpen) {setConfirmUpdate(false); return;}
    const previous = document.activeElement as HTMLElement | null;
    promptInput.current?.focus();
    return () => { previous?.isConnected && previous.focus(); };
  }, [ai.isAIInvoiceModalOpen]);
  useEffect(() => { conversation.current?.scrollTo({top:conversation.current.scrollHeight,behavior:'smooth'}); }, [ai.messages,ai.isProcessing]);
  useEffect(() => {setConfirmUpdate(false);}, [ai.useCurrentProject,ai.activeProject?.id]);
  if (!ai.isAIInvoiceModalOpen) return null;
  return <div className="proposal-overlay">
    <div ref={dialog} className={`proposal-workspace ${ai.isDark ? 'proposal-dark' : ''}`} role="dialog" aria-modal="true" aria-labelledby="proposal-assistant-title"
      onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();if(confirmUpdate)setConfirmUpdate(false);else ai.closeAIInvoiceModal();}
        if(event.key==='Tab'){
          const controls=Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),select:not(:disabled),a[href]')).filter(el=>el.getClientRects().length);
          const first=controls[0],last=controls[controls.length-1];
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      }}>
      <header className="proposal-header"><div><h2 id="proposal-assistant-title">Asistente de propuestas</h2><p>Factura, descripción y catálogo en un mismo borrador.</p></div><div className="proposal-actions">
        <button type="button" onClick={ai.openAISettings} aria-label="Ajustes de IA"><Settings size={18}/></button>
        <button type="button" onClick={ai.closeAIInvoiceModal} aria-label="Cerrar asistente"><X size={19}/></button>
      </div></header>
      <div className="proposal-body">
        <div className="proposal-conversation">
          <div className="proposal-context"><span>{ai.equipmentCatalog.length} equipos disponibles</span><span>Tarifas de 4 distribuidoras</span></div>
          {ai.activeProject && <label className="proposal-context-choice"><input type="checkbox" checked={ai.useCurrentProject} disabled={ai.isProcessing} onChange={e=>ai.setUseCurrentProject(e.target.checked)}/><span>Usar datos de {ai.activeProject.client.projectId}<small>Permite actualizar la propuesta abierta.</small></span></label>}
          <div className="proposal-chat-scroll" ref={conversation} role="log" aria-label="Conversación del borrador">
            {!ai.messages.length && <div className="proposal-welcome"><h3>Cuéntame qué necesitas cotizar</h3><p>Adjunta facturas y describe cliente, consumo, equipos y condiciones. Puedes pedir varios modelos y corregir el resultado antes de crear la propuesta.</p><button type="button" className="proposal-example" onClick={()=>{ai.setPrompt('Cliente: Oficina de ejemplo en Santiago. Consumo: 900 kWh al mes. Cubrir 95%. Usa equipos del catálogo y muestra lo que falta confirmar.');promptInput.current?.focus();}}>Probar con una descripción de ejemplo <ArrowRight size={16}/></button></div>}
            {ai.messages.map((message,i)=><article className={`proposal-message proposal-${message.role}`} key={i}><strong>{message.role==='user'?'Tú':'Asistente'}</strong><p>{message.text}</p>{message.files?.length ? <small>{message.files.join(' · ')}</small>:null}</article>)}
            {ai.isProcessing && <div role="status" className="proposal-processing"><span className="proposal-working-dot"/>Analizando entrada y preparando el borrador…<p>Puedes cancelar. No se modifica ninguna propuesta durante el análisis.</p></div>}
          </div>
          <form className="proposal-composer" onSubmit={event=>{event.preventDefault();void ai.processSmartProposal();}}>
            {ai.errorMsg && <div className="proposal-error" role="alert">{ai.errorMsg}</div>}
            {!ai.geminiApiKey && <div className="proposal-notice">Configura Gemini para analizar documentos.<button type="button" onClick={ai.openAISettings}>Abrir ajustes de IA</button></div>}
            <div className="proposal-attachments">{ai.files.map((file,i)=><div key={`${file.name}-${i}`}><FileText size={15}/><span title={file.name}>{file.name}</span><button type="button" aria-label={`Quitar ${file.name}`} disabled={ai.isProcessing} onClick={()=>ai.removeFile(i)}><X size={14}/></button></div>)}</div>
            <label htmlFor="proposal-prompt">{ai.extractedData?'Correcciones o instrucciones adicionales':'Descripción de la propuesta'}</label>
            <textarea ref={promptInput} id="proposal-prompt" value={ai.prompt} disabled={ai.isProcessing} maxLength={12000} onChange={e=>ai.setPrompt(e.target.value)} placeholder="Ej.: 20 paneles de un modelo y 10 de otro, dos inversores, consumo mensual…" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();void ai.processSmartProposal();}}}/>
            <input ref={ai.fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={e=>{ai.addFiles(Array.from(e.target.files || []));e.target.value='';}}/>
            <div className="proposal-composer-actions"><button type="button" disabled={ai.isProcessing} onClick={()=>ai.fileInputRef.current?.click()}><Paperclip size={17}/>Adjuntar</button>
              {ai.isProcessing ? <button key="cancel-analysis" type="button" onClick={event=>{event.preventDefault();ai.cancel();}}><Square size={15}/>Cancelar análisis</button>:<button key="prepare-draft" type="submit" className="proposal-primary" disabled={!ai.geminiApiKey||(!ai.prompt.trim()&&!ai.files.length)}><Send size={16}/>{ai.extractedData?'Actualizar borrador':'Preparar borrador'}</button>}
            </div><p className="proposal-note">Hasta 4 archivos · 8 MB por archivo · 14 MB en total · PDF, PNG, JPG, WebP<br/>Los documentos y el texto se envían a Google Gemini al analizar.</p>
          </form>
        </div>
        <div className="proposal-draft-panel" aria-busy={ai.isProcessing}>
          <div className="proposal-draft-heading"><h3>Revisión del borrador</h3><button type="button" onClick={ai.reset} disabled={ai.isProcessing || (!ai.extractedData&&!ai.messages.length)}><RotateCcw size={15}/>Empezar de nuevo</button></div>
          {ai.extractedData ? <>
            <div className="proposal-draft-scroll">
              {(ai.extractedData.validationIssues || []).length>0 && <div className="proposal-review-notices"><h4>Datos que requieren atención</h4><ul>{ai.extractedData.validationIssues!.map((issue,i)=><li key={`${issue.code}-${i}`} className={issue.severity==='error'?'proposal-blocker':''}>{issue.message}</li>)}</ul></div>}
              <fieldset disabled={ai.isProcessing} className="proposal-review-fieldset"><ProposalDraftReview draft={ai.extractedData} catalog={ai.equipmentCatalog} matrix={ai.tariffMatrix} update={ai.updateDraft}/></fieldset>
            </div>
            <footer className="proposal-apply"><label><input type="checkbox" checked={ai.reviewConfirmed} disabled={ai.isProcessing||ai.blockingIssues.length>0} onChange={e=>ai.setReviewConfirmed(e.target.checked)}/><span>Revisé los datos, equipos, precios y supuestos del borrador.</span></label>
              {confirmUpdate ? <div className="proposal-update-confirm" role="alert"><p>Se reemplazarán cliente, consumo y equipos de <strong>{ai.activeProject?.client.projectId}</strong>. Las condiciones se recalcularán.</p><div className="proposal-actions"><button type="button" onClick={()=>setConfirmUpdate(false)}>Cancelar</button><button type="button" className="proposal-primary" disabled={!ai.canApply} onClick={()=>{ai.handleApplyToActive();setConfirmUpdate(false);}}>Confirmar actualización</button></div></div> : <div className="proposal-actions">
                {ai.useCurrentProject&&ai.activeProject&&<button type="button" disabled={!ai.canApply} onClick={()=>setConfirmUpdate(true)}>Actualizar {ai.activeProject.client.projectId}</button>}
                <button type="button" className="proposal-primary" disabled={!ai.canApply} onClick={ai.handleApplyAsNew}>Crear propuesta nueva</button>
              </div>}
            </footer>
          </>:<div className="proposal-empty"><FileText size={32}/><h3>Tu propuesta empieza aquí</h3><p>El borrador mostrará cliente, consumo, tarifa y una lista editable de equipos. Nada se guarda hasta que revises y confirmes.</p><ol><li>Describe el proyecto o adjunta la factura.</li><li>Revisa datos y corrige lo que falte.</li><li>Crea una propuesta o actualiza la abierta.</li></ol></div>}
        </div>
      </div>
    </div>
  </div>;
};
