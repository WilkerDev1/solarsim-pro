import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSimulationStore } from '../../../../store/useSimulationStore';
import { parseProposalWithAI } from '../../../../services/geminiInvoiceService';
import { calculateRecommendedPanelCount } from '../../../../engine/solarEngine';
import { getProvinceHSP } from '../../../../data/rdProvinces';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { FilePreview } from '../types';
import { normalizeProposalDraft, AIProposalContext } from '../../../../../shared/aiProposal';
import { buildAITariffContext } from '../../../../utils/aiTariffContext';
import { useEnergyCalculationMode } from '../../../../features/application/useApplicationFeatures';
import { aiWorkspaceKey, proposalFileType, readProposalFile, PROPOSAL_FILES_LIMIT } from '../workspace';

export interface ProposalMessage { role: 'user' | 'assistant'; text: string; files?: string[] }
export function useAIInvoiceScanner() {
  const state = useSimulationStore();
  const { isAIInvoiceModalOpen, geminiApiKey, geminiModel, equipmentCatalog, activeProjectId, projects,
    defaultSimulationSettings: defaults, tariffMatrix } = state;
  const workspace = aiWorkspaceKey(state);
  const mode = useEnergyCalculationMode();
  const activeProject = projects.find(p => p.id === activeProjectId && !p.deletedAt);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ProposalMessage[]>([]);
  const [useCurrentProject, setUseCurrentProject] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [draftScope, setDraftScope] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController>();
  const nativeRequestId = useRef<string>();
  const fileURLs = useRef<string[]>([]);
  const target = useCurrentProject ? activeProject : undefined;
  const context = useMemo(() => {
    const province = extractedData?.province || target?.client.province || defaults.defaultProvince;
    const losses = target?.specs.systemLosses ?? defaults.defaultSystemLosses;
    const yieldInfo = calculateRecommendedPanelCount(province, Array(12).fill(0), 620, 95, losses, target?.client.customMonthlyHSP);
    return {
      province, systemLosses: losses, targetCoveragePct: target?.rates.targetCoveragePct ?? defaults.defaultTargetCoveragePct,
      customMonthlyHSP: target?.client.customMonthlyHSP,
      monthlyConsumptionKWh: target?.monthlyConsumption,
      distributor: target?.rates.distributor,
      tariffCode: target?.rates.tariffCode,
      tariffReference: buildAITariffContext(tariffMatrix),
      annualSpecificYieldKWhPerKWp: yieldInfo.annualSpecificYieldKWhPerKWp,
      calculationMode: mode,
    } as AIProposalContext;
  }, [extractedData?.province, target, defaults, tariffMatrix, mode]);
  const scope = `${workspace}|${useCurrentProject ? activeProjectId : 'new'}`;
  const previousScope = useRef(scope);
  const cancel = () => { sequence.current++; controller.current?.abort();
    if (nativeRequestId.current) void window.electronAPI?.cancelAIRequest?.(nativeRequestId.current);
    nativeRequestId.current=undefined; setIsProcessing(false); };
  const reset = () => {
    cancel(); setExtractedData(null); setMessages([]); setPrompt(''); setFiles([]);
    setErrorMsg(null); setReviewConfirmed(false); setDraftScope('');
  };
  useEffect(() => { reset(); }, [workspace, isAIInvoiceModalOpen]);
  useEffect(() => {
    if (scope !== previousScope.current) { previousScope.current = scope; cancel(); setExtractedData(null); setReviewConfirmed(false); setErrorMsg('Cambió el destino. Prepara otro borrador antes de aplicar.'); }
  }, [scope]);
  useEffect(() => {
    const urls = files.map(f => f.url);
    fileURLs.current.filter(url => !urls.includes(url)).forEach(url => URL.revokeObjectURL(url));
    fileURLs.current = urls;
  }, [files]);
  useEffect(() => () => { cancel(); fileURLs.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const addFiles = (incoming: File[]) => {
    if (isProcessing) return;
    try {
      if (incoming.reduce((sum,f)=>sum+f.size,0)+files.reduce((sum,f)=>sum+f.file.size,0)>14*1024*1024) throw new Error('Los adjuntos juntos deben pesar como máximo 14 MB.');
      if (incoming.length + files.length > PROPOSAL_FILES_LIMIT) throw new Error('Puedes adjuntar hasta 4 archivos por conversación.');
      const validated = incoming.map(file => ({ file, type: proposalFileType(file) }));
      setFiles([...files, ...validated.map(({file,type}) => ({file,type,url:URL.createObjectURL(file),name:file.name}))]);
      setErrorMsg(null); setReviewConfirmed(false);
    } catch (error) { setErrorMsg((error as Error).message); }
  };
  const processSmartProposal = async () => {
    if (isProcessing) return;
    if (!prompt.trim() && !files.length) { setErrorMsg('Escribe lo que necesitas o adjunta una factura.'); return; }
    if (!geminiApiKey) { setErrorMsg('Configura la clave de Gemini en Ajustes de IA para continuar.'); return; }
    if (prompt.length > 12000) { setErrorMsg('Resume las instrucciones a un máximo de 12.000 caracteres.'); return; }
    const capturedWorkspace = workspace;
    const capturedTarget = useCurrentProject ? activeProjectId : null;
    const id = ++sequence.current;
    controller.current = new AbortController();
    setIsProcessing(true); setErrorMsg(null); setReviewConfirmed(false);
    const instructions = [...messages.filter(m => m.role === 'user').slice(-5).map(m => m.text), prompt.trim()].filter(Boolean);
    const isCurrent = () => sequence.current === id && useSimulationStore.getState().isAIInvoiceModalOpen
      && aiWorkspaceKey(useSimulationStore.getState()) === capturedWorkspace
      && (!capturedTarget || useSimulationStore.getState().activeProjectId === capturedTarget);
    try {
      const attachments = await Promise.all(files.map(async f => ({ fileBase64: await readProposalFile(f.file), mimeType:f.type, fileName:f.name })));
      if (!isCurrent()) return;
      const payload = { apiKey:geminiApiKey, model:geminiModel, files:attachments,
        projectRequirementsText: instructions.join('\n\nCorrección del usuario:\n').slice(-24000),
        equipmentCatalog, dopExchangeRate: target?.rates.usdExchangeRate ?? 60.5,
        context: { ...context, currentDraft: extractedData || undefined, currentClient: target?.client },
      };
      let result: ExtractedInvoiceData;
      if (window.electronAPI?.parseInvoiceWithAI) {
        // An actual IPC failure is reported once; do not replay a paid request in the renderer.
        const requestId=globalThis.crypto.randomUUID(); nativeRequestId.current=requestId;
        const response = await window.electronAPI.parseInvoiceWithAI({...payload,requestId});
        if (nativeRequestId.current===requestId) nativeRequestId.current=undefined;
        if (!response.success || !response.data) throw new Error(response.error || 'No se pudo preparar el borrador.');
        result = response.data;
      } else result = await parseProposalWithAI(payload, controller.current.signal);
      if (!isCurrent()) return;
      if (result.province) result.province = getProvinceHSP(result.province).name;
      setExtractedData(result); setDraftScope(scope); setPrompt('');
      setMessages(previous => [...previous.slice(-10), { role:'user', text:prompt.trim() || 'Analizar los documentos adjuntos', files:files.map(f => f.name) },
        {role:'assistant', text:result.aiReasoningSummary || 'Preparé un borrador. Revisa los datos y los equipos antes de aplicarlo.'}]);
    } catch (error) { if (isCurrent()) setErrorMsg((error as Error).message || 'No se pudo analizar la entrada. Reintenta.'); }
    finally { if (isCurrent()) setIsProcessing(false); }
  };
  const validatedDraft = useMemo(() => extractedData ? normalizeProposalDraft(extractedData, equipmentCatalog, context) : null, [extractedData, equipmentCatalog, context]);
  const reviewSnapshot = JSON.stringify(validatedDraft);
  useEffect(() => { setReviewConfirmed(false); }, [reviewSnapshot]);
  const blockingIssues = validatedDraft?.validationIssues?.filter(issue => issue.severity === 'error') || [];
  const canApply = !!validatedDraft && !blockingIssues.length && reviewConfirmed && draftScope === scope && !isProcessing;
  const apply = (createNew: boolean) => {
    const current = useSimulationStore.getState();
    if (!canApply || aiWorkspaceKey(current) !== workspace || (!createNew && current.activeProjectId !== activeProjectId)) return;
    current.applyExtractedInvoice(validatedDraft!, createNew);
  };
  const updateDraft = (updates: Partial<ExtractedInvoiceData>) => { setExtractedData(previous => previous ? {...previous,...updates} : null); setReviewConfirmed(false); };
  return { isAIInvoiceModalOpen, isDark:state.sidebarTheme === 'dark', geminiApiKey, activeProject,
    closeAIInvoiceModal: () => { cancel(); state.closeAIInvoiceModal(); }, openAISettings: () => state.openSettingsModal('ai'),
    files, addFiles, removeFile:(index:number) => {setFiles(previous=>previous.filter((_,i)=>i!==index));setReviewConfirmed(false);}, fileInputRef,
    isProcessing, cancel, reset, prompt, setPrompt, messages, errorMsg, processSmartProposal,
    extractedData:validatedDraft, updateDraft, equipmentCatalog, tariffMatrix, context, useCurrentProject,
    setUseCurrentProject:(value:boolean)=>{cancel();setUseCurrentProject(value);setExtractedData(null);setReviewConfirmed(false);setMessages([]);},
    reviewConfirmed, setReviewConfirmed, blockingIssues, canApply,
    handleApplyAsNew:()=>apply(true), handleApplyToActive:()=>apply(false),
  };
}
