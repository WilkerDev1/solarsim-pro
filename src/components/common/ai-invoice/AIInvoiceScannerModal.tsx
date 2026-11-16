import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, RotateCcw, Settings, Paperclip } from 'lucide-react';
import { useAIInvoiceScanner } from './hooks/useAIInvoiceScanner';
import { ProposalDraftReview } from './components/ProposalDraftReview';
import { ReviewIssueDigest, useDigestPeak } from './components/ReviewIssueDigest';
import { ProposalApplyBar } from './components/ProposalApplyBar';
import { describeIssues, firstPendingTarget, focusReviewAnchor, type IssueTarget, type ReviewTab } from './reviewIssues';
import './proposal-workspace.css';
import { useResizablePanel } from '../../../features/assistant/useResizablePanel';
import { ChatMessage } from '../../../features/assistant/components/ChatMessage';
import { ChatComposer, ChatSuggestions, ChatThinking, ScrollToLatest } from '../../../features/assistant/components/ChatComposer';
import { useChatAnnouncement, useElapsedSeconds, useResend, useStickToBottom } from '../../../features/assistant/chatUi';
import '../../../features/assistant/chat.css';
import { PrimaryIconDock } from '../../layout/PrimaryIconDock';

const SUGGESTIONS = [
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
  const pendingCount = issueViews.filter(v => v.tier !== 'info').length;
  const peak = useDigestPeak(issueViews.length);
  const [confirmReset, setConfirmReset] = useState(false);
  const resend = useResend(ai.prompt, ai.setPrompt, () => void ai.processSmartProposal(), ai.isProcessing);
  const lastMessage = ai.messages[ai.messages.length - 1];
  const announcement = useChatAnnouncement(ai.isProcessing, () => lastMessage?.kind === 'error' ? 'La respuesta no se completó.' : `Respuesta lista${pendingCount ? `: ${pendingCount} ${pendingCount === 1 ? 'punto pendiente' : 'puntos pendientes'}` : ''}.`);
  if (!ai.isAIInvoiceModalOpen) return null;
  const go = (target: IssueTarget) => { if (target.tab) setTab(target.tab); requestAnimationFrame(() => focusReviewAnchor(target.anchor)); };
  const lastUser = [...ai.messages].reverse().find(m => m.role === 'user');
  const lastAssistantIndex = ai.messages.map(m => m.role).lastIndexOf('assistant');
  const retry = lastUser ? () => resend(lastUser.text) : undefined;
  // El error del análisis ya es un turno del hilo; el aviso del compositor queda para errores de adjuntos.
  const composerError = ai.errorMsg && !(lastMessage?.kind === 'error' && lastMessage.text === ai.errorMsg) ? ai.errorMsg : null;
  const digest = !!issueViews.length && <ReviewIssueDigest issues={issueViews} peak={peak} onNavigate={issue=>{if(issue.target)go(issue.target);}}/>;
  const blocking = ai.blockingIssues.length;
  const toConfirm = issueViews.filter(v => v.tier === 'confirm').length;
  const canSend = !!ai.geminiApiKey && (!!ai.prompt.trim() || ai.files.length > 0);
  const disabledReason = !ai.geminiApiKey ? 'Configura Gemini para enviar.' : 'Escribe o adjunta un archivo.';
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
            <div className="proposal-chat-title"><h3>Asistente de propuestas</h3><small title="Prepara un borrador revisable; nada se guarda sin confirmar">Nada se guarda sin confirmar</small></div>
            {ai.activeProject && <label className="proposal-context-choice"><input type="checkbox" checked={ai.useCurrentProject} disabled={ai.isProcessing} onChange={e=>ai.setUseCurrentProject(e.target.checked)}/><span>Usar datos de {ai.activeProject.client.projectId}<small>Permite actualizar la propuesta abierta.</small></span></label>}
          </header>
          <div className="chat-log-wrap">
            <div className="proposal-chat-scroll" ref={conversation} onScroll={scroll.onScroll} role="log" aria-live="off" aria-label="Conversación del borrador" tabIndex={0}>
              {!ai.messages.length && <ChatSuggestions title="¿Qué necesitas cotizar?" description="Describe el proyecto o adjunta una factura. Prepararé un borrador con equipos del inventario y tarifas vigentes para que lo revises." items={ai.geminiApiKey ? SUGGESTIONS : []}
                action={ai.geminiApiKey ? {label:'Adjuntar factura (PDF o foto)',icon:<Paperclip size={15} aria-hidden/>,onClick:()=>document.querySelector<HTMLButtonElement>('.proposal-conversation .chat-icon-button')?.click()} : undefined}
                notice={!ai.geminiApiKey ? <div className="chat-notice">Configura Gemini para analizar documentos.<button type="button" onClick={ai.openAISettings}><Settings size={14} aria-hidden/>Abrir ajustes de IA</button></div> : undefined}
                onPick={text=>{ai.setPrompt(text);requestAnimationFrame(()=>promptInput.current?.focus());}}/>}
              {ai.messages.map((message,i)=><ChatMessage role={message.role} text={message.text} files={message.files} variant={message.kind} key={i}
                onCopy={message.role==='assistant'&&!message.kind?()=>navigator.clipboard.writeText(message.text):undefined}
                onRetry={i===lastAssistantIndex&&!ai.isProcessing?retry:undefined}
                onReuse={message.role==='user'&&!ai.isProcessing?()=>{ai.setPrompt(message.text);requestAnimationFrame(()=>promptInput.current?.focus());}:undefined}
                onOpenSettings={ai.openAISettings}>
                {i===lastAssistantIndex&&!ai.isProcessing?digest:null}
              </ChatMessage>)}
              {(lastAssistantIndex<0||ai.isProcessing)&&digest}
              {ai.isProcessing && <ChatThinking label={ai.files.length?'Leyendo adjuntos y preparando el borrador…':'Analizando y preparando el borrador…'} detail={elapsed>=8?'Puedes detenerlo con Esc. No se modifica ninguna propuesta durante el análisis.':undefined} elapsed={elapsed}/>}
            </div>
            <ScrollToLatest visible={scroll.away} onClick={()=>scroll.scrollToBottom()}/>
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
          <ChatComposer id="proposal-prompt" label="Mensaje al asistente" inputRef={promptInput} value={ai.prompt} onChange={ai.setPrompt}
            onSubmit={()=>void ai.processSmartProposal()} onCancel={ai.cancel} onPickFiles={ai.addFiles} busy={ai.isProcessing} canSend={canSend}
            disabledReason={disabledReason} placeholder="Describe la propuesta…" accept=".pdf,.png,.jpg,.jpeg,.webp"
            attachments={ai.files.map((file,i)=>({key:`${file.name}-${i}`,name:file.name,onRemove:()=>ai.removeFile(i)}))}
            notices={<>{composerError && <div className="chat-notice" data-tone="error" role="alert">{composerError}</div>}
              {!ai.geminiApiKey && !!ai.messages.length && <div className="chat-notice">Configura Gemini para analizar documentos.<button type="button" onClick={ai.openAISettings}><Settings size={14} aria-hidden/>Abrir ajustes de IA</button></div>}</>}
            footer={<details className="proposal-note-details"><summary>Archivos y privacidad</summary><p>Hasta 4 archivos · 8 MB por archivo · 14 MB en total · PDF, PNG, JPG, WebP. Puedes arrastrarlos al cuadro. Texto y documentos se envían a Google Gemini al analizar.</p></details>}/>
        </div>
        <div className="proposal-draft-panel" aria-busy={ai.isProcessing}>
          <div className="proposal-draft-heading"><h3>Revisión del borrador{ai.useCurrentProject&&ai.activeProject?<small> · sobre {ai.activeProject.client.projectId}</small>:null}</h3>{confirmReset ? <div className="proposal-reset-confirm" role="group" aria-label="Confirmar empezar de nuevo"><span>¿Descartar el borrador?</span><button type="button" className="proposal-ghost proposal-danger" autoFocus onClick={()=>{setConfirmReset(false);ai.reset();}}>Descartar</button><button type="button" className="proposal-tertiary" onClick={()=>setConfirmReset(false)}>Cancelar</button></div>
            : <button type="button" className="proposal-tertiary proposal-reset" onClick={()=>ai.extractedData?setConfirmReset(true):ai.reset()} disabled={ai.isProcessing || (!ai.extractedData&&!ai.messages.length)}><RotateCcw size={15}/>Empezar de nuevo</button>}</div>
          {ai.extractedData ? <>
            <div className="proposal-draft-scroll">
              <fieldset disabled={ai.isProcessing} className="proposal-review-fieldset"><ProposalDraftReview draft={ai.extractedData} catalog={ai.equipmentCatalog} matrix={ai.tariffMatrix} context={ai.context} preview={ai.draftPreview} production={ai.draftEnergy} update={ai.updateDraft} issueViews={issueViews} tab={tab} onTabChange={setTab}/></fieldset>
            </div>
            {confirmUpdate ? <footer className="proposal-apply" aria-label="Paso final"><div className="proposal-update-confirm" role="alert"><p>Se reemplazarán cliente, consumo y equipos de <strong>{ai.activeProject?.client.projectId}</strong>. Las condiciones se recalcularán.</p><div className="proposal-actions"><button type="button" className="proposal-ghost" onClick={()=>setConfirmUpdate(false)}>Cancelar</button><button type="button" className="proposal-primary" disabled={!ai.canApply} onClick={()=>{ai.handleApplyToActive();setConfirmUpdate(false);}}>Confirmar actualización</button></div></div></footer>
            : <ProposalApplyBar blocking={blocking} toConfirm={toConfirm} reviewConfirmed={ai.reviewConfirmed} canApply={ai.canApply} busy={ai.isProcessing}
              onConfirmChange={ai.setReviewConfirmed}
              onResolve={()=>{const target=firstPendingTarget(issueViews);if(target)go(target);}}
              onFocusCheck={()=>document.getElementById('proposal-review-check')?.focus()}
              onCreate={()=>{if(ai.canApply)ai.handleApplyAsNew();}}
              updateLabel={ai.useCurrentProject&&ai.activeProject?`Actualizar ${ai.activeProject.client.projectId}`:undefined}
              onUpdate={()=>setConfirmUpdate(true)}/>}
          </>:<div className="proposal-empty">{ai.isProcessing?<div className="proposal-skeleton" aria-hidden="true"><p className="proposal-skeleton-label">{ai.files.length?'Leyendo la factura':'Preparando el borrador'}…{elapsed>=3?` ${elapsed} s`:''}</p><div className="proposal-skeleton-summary"><i/><i/><i/><i/></div><div className="proposal-skeleton-tabs"><i/><i/><i/><i/></div><i className="proposal-skeleton-field"/><i className="proposal-skeleton-field"/><i className="proposal-skeleton-field"/></div>:<><FileText size={32}/><h3>Tu propuesta empieza aquí</h3><p>El borrador mostrará cliente, consumo, tarifa y una lista editable de equipos. Nada se guarda hasta que revises y confirmes.</p><ol><li>Describe el proyecto o adjunta la factura.</li><li>Revisa datos y corrige lo que falte.</li><li>Crea una propuesta o actualiza la abierta.</li></ol></>}</div>}
        </div>
      </div>
    </div>
  </div>;
};
