import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, RotateCcw, ShieldCheck, AlertOctagon, CheckCircle2, Settings } from 'lucide-react';
import { useAIInvoiceScanner } from './hooks/useAIInvoiceScanner';
import { ProposalDraftReview } from './components/ProposalDraftReview';
import { ReviewIssueDigest } from './components/ReviewIssueDigest';
import { describeIssues, focusReviewAnchor, type ReviewTab } from './reviewIssues';
import './proposal-workspace.css';
import { useResizablePanel } from '../../../features/assistant/useResizablePanel';
import { ChatMessage } from '../../../features/assistant/components/ChatMessage';
import { ChatComposer, ChatSuggestions, ChatThinking, ScrollToLatest } from '../../../features/assistant/components/ChatComposer';
import { useElapsedSeconds, useStickToBottom } from '../../../features/assistant/chatUi';
import '../../../features/assistant/chat.css';
import { PrimaryIconDock } from '../../layout/PrimaryIconDock';

const SUGGESTIONS = [
  'Prepara una propuesta a partir de la factura adjunta',
  'Sistema de 10 kWp con inversor híbrido y dos baterías para una residencia en Santiago',
  'Cliente comercial en Santo Domingo, consumo promedio de 2.500 kWh al mes, sin baterías',
];

export const AIInvoiceScannerModal: React.FC = () => {
  const ai = useAIInvoiceScanner();
  const resize = useResizablePanel();
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [tab, setTab] = useState<ReviewTab>('consumption');
  const dialog = useRef<HTMLDivElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const scroll = useStickToBottom(conversation, [ai.messages, ai.isProcessing, ai.attentionIssues.length]);
  const elapsed = useElapsedSeconds(ai.isProcessing);
  const issueViews = useMemo(() => describeIssues(ai.attentionIssues, ai.extractedData || undefined), [ai.attentionIssues, ai.extractedData]);
  useEffect(() => {
    if (!ai.isAIInvoiceModalOpen) {setConfirmUpdate(false); return;}
    const previous = document.activeElement as HTMLElement | null;
    promptInput.current?.focus();
    return () => { previous?.isConnected && previous.focus(); };
  }, [ai.isAIInvoiceModalOpen]);
  useEffect(() => {setConfirmUpdate(false);}, [ai.useCurrentProject,ai.activeProject?.id]);
  if (!ai.isAIInvoiceModalOpen) return null;
  const blocking = ai.blockingIssues.length;
  const toConfirm = issueViews.filter(v => v.tier === 'confirm').length;
  const canSend = !!ai.geminiApiKey && (!!ai.prompt.trim() || ai.files.length > 0);
  const disabledReason = !ai.geminiApiKey ? 'Configura Gemini para enviar.' : 'Escribe o adjunta un archivo.';
  const finalStatus = !ai.extractedData ? '' : blocking ? `Resuelve ${blocking} ${blocking === 1 ? 'bloqueo' : 'bloqueos'} para continuar.` : !ai.reviewConfirmed ? (toConfirm ? `Confirma la revisión (${toConfirm} ${toConfirm === 1 ? 'punto' : 'puntos'} por confirmar).` : 'Marca la revisión para continuar.') : 'Listo para crear la propuesta.';
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
      <h2 id="proposal-assistant-title" className="sr-only">Asistente de propuestas</h2>
      <PrimaryIconDock beforeNavigate={ai.closeAIInvoiceModal} assistantActive />
      <div className="proposal-body" style={resize.width ? {'--pw-chat-width':`${resize.width}px`} as React.CSSProperties : undefined}>
        <div className="proposal-conversation">
          <div className="proposal-resize-handle" {...resize.separatorProps} />
          <header className="proposal-chat-header">
            <div><h3>Asistente de propuestas</h3><small>Prepara un borrador revisable · nada se guarda sin confirmar</small></div>
            {ai.activeProject && <label className="proposal-context-choice"><input type="checkbox" checked={ai.useCurrentProject} disabled={ai.isProcessing} onChange={e=>ai.setUseCurrentProject(e.target.checked)}/><span>Usar datos de {ai.activeProject.client.projectId}<small>Permite actualizar la propuesta abierta.</small></span></label>}
          </header>
          <div className="proposal-chat-scroll" ref={conversation} onScroll={scroll.onScroll} role="log" aria-label="Conversación del borrador">
            {!ai.messages.length && <ChatSuggestions title="¿Qué necesitas cotizar?" description="Describe el proyecto o adjunta una factura. Prepararé un borrador con equipos del inventario y tarifas vigentes para que lo revises." items={SUGGESTIONS} onPick={text=>{ai.setPrompt(text);requestAnimationFrame(()=>promptInput.current?.focus());}}/>}
            {ai.messages.map((message,i)=><ChatMessage role={message.role} text={message.text} files={message.files} variant={message.kind} key={i}/>)}
            {!!issueViews.length && <ReviewIssueDigest issues={issueViews} onNavigate={issue=>{if(!issue.target)return;if(issue.target.tab)setTab(issue.target.tab);const anchor=issue.target.anchor;requestAnimationFrame(()=>focusReviewAnchor(anchor));}}/>}
            {ai.isProcessing && <ChatThinking label={ai.files.length?'Leyendo adjuntos y preparando el borrador…':'Analizando y preparando el borrador…'} detail="Puedes detenerlo. No se modifica ninguna propuesta durante el análisis." elapsed={elapsed}/>}
          </div>
          <ScrollToLatest visible={scroll.away} onClick={()=>scroll.scrollToBottom()}/>
          <ChatComposer id="proposal-prompt" label="Mensaje al asistente" inputRef={promptInput} value={ai.prompt} onChange={ai.setPrompt}
            onSubmit={()=>void ai.processSmartProposal()} onCancel={ai.cancel} onPickFiles={ai.addFiles} busy={ai.isProcessing} canSend={canSend}
            disabledReason={disabledReason} placeholder="Describe la propuesta, pregunta o pide un cambio…" accept=".pdf,.png,.jpg,.jpeg,.webp"
            attachments={ai.files.map((file,i)=>({key:`${file.name}-${i}`,name:file.name,onRemove:()=>ai.removeFile(i)}))}
            notices={<>{ai.errorMsg && <div className="chat-notice" data-tone="error" role="alert">{ai.errorMsg}</div>}
              {!ai.geminiApiKey && <div className="chat-notice">Configura Gemini para analizar documentos.<button type="button" onClick={ai.openAISettings}><Settings size={14} aria-hidden/>Abrir ajustes de IA</button></div>}</>}
            footer={<details className="proposal-note-details"><summary>Archivos y privacidad</summary><p>Hasta 4 archivos · 8 MB por archivo · 14 MB en total · PDF, PNG, JPG, WebP. Puedes arrastrarlos al cuadro. Texto y documentos se envían a Google Gemini al analizar.</p></details>}/>
        </div>
        <div className="proposal-draft-panel" aria-busy={ai.isProcessing}>
          <div className="proposal-draft-heading"><h3>Revisión del borrador{ai.useCurrentProject&&ai.activeProject?<small> · sobre {ai.activeProject.client.projectId}</small>:null}</h3><button type="button" className="proposal-ghost" onClick={ai.reset} disabled={ai.isProcessing || (!ai.extractedData&&!ai.messages.length)}><RotateCcw size={15}/>Empezar de nuevo</button></div>
          {ai.extractedData ? <>
            <div className="proposal-draft-scroll">
              <fieldset disabled={ai.isProcessing} className="proposal-review-fieldset"><ProposalDraftReview draft={ai.extractedData} catalog={ai.equipmentCatalog} matrix={ai.tariffMatrix} context={ai.context} preview={ai.draftPreview} production={ai.draftEnergy} update={ai.updateDraft} issues={ai.attentionIssues} tab={tab} onTabChange={setTab}/></fieldset>
            </div>
            <footer className="proposal-apply" aria-label="Paso final">
              <div className="proposal-apply-check">
                <span className="proposal-step">Paso final</span>
                <label data-checked={ai.reviewConfirmed || undefined}><input type="checkbox" checked={ai.reviewConfirmed} disabled={ai.isProcessing||blocking>0} aria-describedby="proposal-apply-status" onChange={e=>ai.setReviewConfirmed(e.target.checked)}/><span>Revisé los datos, equipos, precios y supuestos del borrador.</span></label>
                <p id="proposal-apply-status" className="proposal-apply-status" data-tier={blocking?'blocking':ai.reviewConfirmed?'ok':'confirm'} aria-live="polite">{blocking?<AlertOctagon size={14} aria-hidden/>:ai.reviewConfirmed?<CheckCircle2 size={14} aria-hidden/>:<ShieldCheck size={14} aria-hidden/>}{finalStatus}</p>
              </div>
              {confirmUpdate ? <div className="proposal-update-confirm" role="alert"><p>Se reemplazarán cliente, consumo y equipos de <strong>{ai.activeProject?.client.projectId}</strong>. Las condiciones se recalcularán.</p><div className="proposal-actions"><button type="button" className="proposal-ghost" onClick={()=>setConfirmUpdate(false)}>Cancelar</button><button type="button" className="proposal-primary" disabled={!ai.canApply} onClick={()=>{ai.handleApplyToActive();setConfirmUpdate(false);}}>Confirmar actualización</button></div></div> : <div className="proposal-actions">
                {ai.useCurrentProject&&ai.activeProject&&<button type="button" disabled={!ai.canApply} onClick={()=>setConfirmUpdate(true)}>Actualizar {ai.activeProject.client.projectId}</button>}
                <button type="button" className="proposal-primary" disabled={!ai.canApply} onClick={ai.handleApplyAsNew}>Crear propuesta nueva</button>
              </div>}
            </footer>
          </>:<div className="proposal-empty">{ai.isProcessing?<div className="proposal-skeleton" role="status"><span className="sr-only">Preparando el borrador…</span><i/><i/><i/><i/></div>:<><FileText size={32}/><h3>Tu propuesta empieza aquí</h3><p>El borrador mostrará cliente, consumo, tarifa y una lista editable de equipos. Nada se guarda hasta que revises y confirmes.</p><ol><li>Describe el proyecto o adjunta la factura.</li><li>Revisa datos y corrige lo que falte.</li><li>Crea una propuesta o actualiza la abierta.</li></ol></>}</div>}
        </div>
      </div>
    </div>
  </div>;
};
