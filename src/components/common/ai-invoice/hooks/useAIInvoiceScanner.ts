import React, { useState, useRef, useMemo } from 'react';
import { useSimulationStore } from '../../../../store/useSimulationStore';
import { parseInvoiceWithGemini } from '../../../../services/geminiInvoiceService';
import { calculateRecommendedPanelCount } from '../../../../engine/solarEngine';
import { ExtractedInvoiceData } from '../../../../types/aiInvoice';
import { ProjectSimulation } from '../../../../types';
import { SolarEquipmentItem } from '../../../../types/equipment';
import { FilePreview, ActiveInvoiceTab, INVOICE_MONTH_NAMES } from '../types';

export function useAIInvoiceScanner() {
  const {
    isAIInvoiceModalOpen,
    closeAIInvoiceModal,
    openAISettingsModal,
    geminiApiKey,
    geminiModel,
    equipmentCatalog,
    activeProjectId,
    projects,
    applyExtractedInvoice,
    sidebarTheme,
  } = useSimulationStore();

  const isDark = sidebarTheme === 'dark';
  const panelCatalog = useMemo(() => equipmentCatalog.filter((item) => item.type === 'panel'), [equipmentCatalog]);
  const inverterCatalog = useMemo(() => equipmentCatalog.filter((item) => item.type === 'inverter'), [equipmentCatalog]);
  const batteryCatalog = useMemo(() => equipmentCatalog.filter((item) => item.type === 'battery'), [equipmentCatalog]);

  const activeProject: ProjectSimulation | undefined = projects.find((p: ProjectSimulation) => p.id === activeProjectId);
  const isInsideProject = Boolean(activeProject && activeProjectId);

  // Estados locales
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedInvoiceData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [originalMonthlyConsumption, setOriginalMonthlyConsumption] = useState<number[] | null>(null);
  const [isPeakModeActive, setIsPeakModeActive] = useState<boolean>(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string>('');

  // Pestañas y visor
  const [activeTab, setActiveTab] = useState<ActiveInvoiceTab>('client');
  const [zoomLevel, setZoomLevel] = useState(100);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Requisitos o especificaciones técnicas del proyecto
  const [projectRequirementsPrompt, setProjectRequirementsPrompt] = useState<string>('');

  // Módulo solar seleccionado actualmente
  const selectedPanel: SolarEquipmentItem | null = useMemo(() => {
    if (selectedPanelId) {
      const found = panelCatalog.find((p: SolarEquipmentItem) => p.id === selectedPanelId);
      if (found) return found;
    }
    const targetW = extractedData?.selectedPanelWatts || activeProject?.specs?.panelPowerW || 620;
    return (
      panelCatalog.find((p: SolarEquipmentItem) => p.powerW === targetW) ||
      panelCatalog.find((p: SolarEquipmentItem) => p.powerW === 620) ||
      panelCatalog[0] ||
      null
    );
  }, [selectedPanelId, panelCatalog, extractedData?.selectedPanelWatts, activeProject?.specs?.panelPowerW]);

  const handleFileSelect = (file: File) => {
    setErrorMsg(null);
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|png|jpe?g|webp)$/i)) {
      setErrorMsg('Por favor selecciona un documento válido (PDF, PNG o JPG).');
      return;
    }
    const url = URL.createObjectURL(file);
    setSelectedFile({
      file,
      url,
      name: file.name,
      type: file.type,
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Alternar entre historial real extraído y dimensionamiento por mes pico
  const handleTogglePeakMonthMode = () => {
    if (!extractedData) return;

    const panelWatts = selectedPanel?.powerW || activeProject?.specs?.panelPowerW || 620;
    const targetCov = extractedData.targetCoveragePct ?? activeProject?.rates?.targetCoveragePct ?? 95;
    const sysLosses = activeProject?.specs?.systemLosses ?? 25.0;

    if (isPeakModeActive) {
      // Revertir al consumo original
      const restored = originalMonthlyConsumption || extractedData.monthlyConsumptionKWh;
      const restoredTotal = restored.reduce((s: number, v: number) => s + v, 0);
      const restoredAvg = Math.round(restoredTotal / 12);

      const rec = calculateRecommendedPanelCount(
        extractedData.province || activeProject?.client?.province || 'Santo Domingo / Distrito Nacional',
        restored,
        panelWatts,
        targetCov,
        sysLosses,
        activeProject?.client?.customMonthlyHSP
      );

      setExtractedData({
        ...extractedData,
        monthlyConsumptionKWh: [...restored],
        annualConsumptionKWh: restoredTotal,
        averageMonthlyKWh: restoredAvg,
        recommendedCapacityKWp: rec.recommendedCapacityKWp,
        recommendedPanelCount: rec.recommendedPanelCount,
      });
      setIsPeakModeActive(false);
    } else {
      // Modo Mes Pico
      if (!originalMonthlyConsumption && extractedData.monthlyConsumptionKWh) {
        setOriginalMonthlyConsumption([...extractedData.monthlyConsumptionKWh]);
      }
      const peakVal = Math.max(...extractedData.monthlyConsumptionKWh, 0);
      const peakArray = Array(12).fill(peakVal);
      const peakTotal = peakVal * 12;

      const rec = calculateRecommendedPanelCount(
        extractedData.province || activeProject?.client?.province || 'Santo Domingo / Distrito Nacional',
        peakArray,
        panelWatts,
        targetCov,
        sysLosses,
        activeProject?.client?.customMonthlyHSP
      );

      setExtractedData({
        ...extractedData,
        monthlyConsumptionKWh: peakArray,
        annualConsumptionKWh: peakTotal,
        averageMonthlyKWh: peakVal,
        recommendedCapacityKWp: rec.recommendedCapacityKWp,
        recommendedPanelCount: rec.recommendedPanelCount,
      });
      setIsPeakModeActive(true);
    }
  };

  // Procesa el documento con Gemini Vision y Smart Proposal Grounding
  const processSmartProposal = async () => {
    if (!selectedFile && !projectRequirementsPrompt.trim()) {
      setErrorMsg('Debes subir una factura o escribir los requisitos del proyecto.');
      return;
    }

    if (!geminiApiKey) {
      setErrorMsg('No tienes una Google Gemini API Key configurada.');
      openAISettingsModal();
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      let result: ExtractedInvoiceData;
      const cleanPrompt = projectRequirementsPrompt.trim() || undefined;

      // Entorno Electron
      if (window.electronAPI && typeof window.electronAPI.parseInvoiceWithAI === 'function') {
        let fileBase64 = '';
        if (selectedFile) {
          fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const b64 = res.split(',')[1] || '';
              resolve(b64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile.file);
          });
        }

        const res = await window.electronAPI.parseInvoiceWithAI({
          fileBase64,
          mimeType: selectedFile?.type || 'application/pdf',
          fileName: selectedFile?.name || 'factura_desconocida',
          apiKey: geminiApiKey,
          model: geminiModel,
          projectRequirementsText: cleanPrompt,
          equipmentCatalog,
          dopExchangeRate: activeProject?.rates?.usdExchangeRate || 60.0,
          panelPowerW: activeProject?.specs?.panelPowerW || 620,
        });

        if (!res.success || !res.data) {
          throw new Error(res.error || 'Error al procesar la factura con IA en Electron.');
        }
        result = res.data;
      } else {
        // Entorno Web (Fallback directo)
        let base64 = '';
        if (selectedFile) {
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              const b64 = res.split(',')[1] || '';
              resolve(b64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile.file);
          });
        }

        result = await parseInvoiceWithGemini({
          fileBase64: base64,
          mimeType: selectedFile?.type || 'application/pdf',
          fileName: selectedFile?.name || 'factura_desconocida',
          apiKey: geminiApiKey,
          model: geminiModel,
          projectRequirementsText: cleanPrompt,
          equipmentCatalog,
          dopExchangeRate: activeProject?.rates?.usdExchangeRate || 60.0,
          panelPowerW: activeProject?.specs?.panelPowerW || 620,
        });
      }

      setExtractedData(result);
      if (result.monthlyConsumptionKWh && result.monthlyConsumptionKWh.length === 12) {
        setOriginalMonthlyConsumption([...result.monthlyConsumptionKWh]);
      }
      setIsPeakModeActive(false);

      if (result.selectedPanelId) {
        setSelectedPanelId(result.selectedPanelId);
      }
    } catch (err: any) {
      console.error('[AIInvoiceScanner] Error processing:', err);
      setErrorMsg(err.message || 'Error al procesar con Gemini. Revisa la consola o tu conexión.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Cambio de módulo fotovoltaico desde el catálogo
  const handlePanelChange = (newPanelId: string) => {
    setSelectedPanelId(newPanelId);
    const newPanel = panelCatalog.find((p: SolarEquipmentItem) => p.id === newPanelId);
    if (!newPanel || !extractedData) return;

    const panelWatts = newPanel.powerW || 620;
    const targetCov = extractedData.targetCoveragePct ?? activeProject?.rates?.targetCoveragePct ?? 95;
    const sysLosses = activeProject?.specs?.systemLosses ?? 25.0;

    const rec = calculateRecommendedPanelCount(
      extractedData.province || activeProject?.client?.province || 'Santo Domingo / Distrito Nacional',
      extractedData.monthlyConsumptionKWh,
      panelWatts,
      targetCov,
      sysLosses,
      activeProject?.client?.customMonthlyHSP
    );

    setExtractedData({
      ...extractedData,
      selectedPanelId: newPanel.id,
      selectedPanelModel: newPanel.displayName || newPanel.modelSeries,
      selectedPanelWatts: panelWatts,
      recommendedCapacityKWp: rec.recommendedCapacityKWp,
      recommendedPanelCount: rec.recommendedPanelCount,
    });
  };

  // Cambio interactivo de cobertura meta (%)
  const handleCoverageChange = (newCoverage: number) => {
    if (!extractedData) return;
    const safeCoverage = Math.max(10, Math.min(300, Math.round(newCoverage)));
    const panelWatts = selectedPanel?.powerW || activeProject?.specs?.panelPowerW || 620;
    const sysLosses = activeProject?.specs?.systemLosses ?? 25.0;

    const rec = calculateRecommendedPanelCount(
      extractedData.province || activeProject?.client?.province || 'Santo Domingo / Distrito Nacional',
      extractedData.monthlyConsumptionKWh,
      panelWatts,
      safeCoverage,
      sysLosses,
      activeProject?.client?.customMonthlyHSP
    );

    setExtractedData({
      ...extractedData,
      targetCoveragePct: safeCoverage,
      recommendedCapacityKWp: rec.recommendedCapacityKWp,
      recommendedPanelCount: rec.recommendedPanelCount,
    });
  };

  // Ajuste manual de consumo mensual
  const handleUpdateMonthlyConsumption = (index: number, val: number) => {
    if (!extractedData) return;
    setIsPeakModeActive(false);
    const newArr = [...extractedData.monthlyConsumptionKWh];
    newArr[index] = Math.max(0, val);
    const newTotal = newArr.reduce((s: number, v: number) => s + v, 0);
    const newAvg = Math.round(newTotal / 12);
    
    const panelWatts = selectedPanel?.powerW || activeProject?.specs?.panelPowerW || 620;
    const targetCov = extractedData.targetCoveragePct ?? activeProject?.rates?.targetCoveragePct ?? 95;
    const sysLosses = activeProject?.specs?.systemLosses ?? 25.0;
    const rec = calculateRecommendedPanelCount(
      extractedData.province || activeProject?.client?.province || 'Santo Domingo / Distrito Nacional',
      newArr,
      panelWatts,
      targetCov,
      sysLosses,
      activeProject?.client?.customMonthlyHSP
    );

    setExtractedData({
      ...extractedData,
      monthlyConsumptionKWh: newArr,
      annualConsumptionKWh: newTotal,
      averageMonthlyKWh: newAvg,
      recommendedCapacityKWp: rec.recommendedCapacityKWp,
      recommendedPanelCount: rec.recommendedPanelCount,
    });
  };

  const handleApplyToActive = () => {
    if (!extractedData) return;
    const dataToApply: ExtractedInvoiceData = {
      ...extractedData,
      selectedPanelId: selectedPanel?.id,
      selectedPanelModel: selectedPanel?.displayName || selectedPanel?.modelSeries,
      selectedPanelWatts: selectedPanel?.powerW,
    };
    applyExtractedInvoice(dataToApply, false);
  };

  const handleApplyAsNew = () => {
    if (!extractedData) return;
    const dataToApply: ExtractedInvoiceData = {
      ...extractedData,
      selectedPanelId: selectedPanel?.id,
      selectedPanelModel: selectedPanel?.displayName || selectedPanel?.modelSeries,
      selectedPanelWatts: selectedPanel?.powerW,
    };
    applyExtractedInvoice(dataToApply, true);
  };

  const handleResetDocument = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setOriginalMonthlyConsumption(null);
    setIsPeakModeActive(false);
    setErrorMsg(null);
    setZoomLevel(100);
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 25, 250));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 25, 50));
  const handleZoomReset = () => setZoomLevel(100);

  // Mes de mayor consumo (pico) para cálculos y UI
  const peakConsumptionVal = useMemo(() => {
    if (!extractedData || !extractedData.monthlyConsumptionKWh) return 0;
    return Math.max(...extractedData.monthlyConsumptionKWh, 0);
  }, [extractedData]);

  const peakMonthIndex = useMemo(() => {
    if (!extractedData || !extractedData.monthlyConsumptionKWh) return -1;
    return extractedData.monthlyConsumptionKWh.indexOf(peakConsumptionVal);
  }, [extractedData, peakConsumptionVal]);

  const peakMonthName = peakMonthIndex >= 0 ? INVOICE_MONTH_NAMES[peakMonthIndex] : '';

  // Cobertura real estimada resultante con la cantidad entera de paneles
  const estimatedRealCoveragePct = useMemo(() => {
    if (!extractedData || !extractedData.monthlyConsumptionKWh || !extractedData.recommendedCapacityKWp) return null;
    const totalAnnual = extractedData.annualConsumptionKWh || extractedData.monthlyConsumptionKWh.reduce((s: number, v: number) => s + (Number(v) || 0), 0);
    if (totalAnnual <= 0) return null;

    const panelWatts = selectedPanel?.powerW || activeProject?.specs?.panelPowerW || 620;
    const sysLosses = activeProject?.specs?.systemLosses ?? 25.0;
    const rec = calculateRecommendedPanelCount(
      extractedData.province || activeProject?.client?.province || 'Santo Domingo / Distrito Nacional',
      extractedData.monthlyConsumptionKWh,
      panelWatts,
      extractedData.targetCoveragePct ?? 95,
      sysLosses,
      activeProject?.client?.customMonthlyHSP
    );

    const annualProd = rec.recommendedCapacityKWp * rec.annualSpecificYieldKWhPerKWp;
    return Math.round((annualProd / totalAnnual) * 1000) / 10;
  }, [extractedData, selectedPanel, activeProject]);

  // Consumo máximo para escalar la gráfica visual de barras
  const maxConsumptionVal = extractedData
    ? Math.max(...extractedData.monthlyConsumptionKWh, 100)
    : 1000;

  return {
    // Store
    isAIInvoiceModalOpen,
    closeAIInvoiceModal,
    openAISettingsModal,
    geminiApiKey,
    geminiModel,
    panelCatalog,
    inverterCatalog,
    batteryCatalog,
    activeProject,
    isInsideProject,
    isDark,

    // State
    selectedFile,
    setSelectedFile,
    isProcessing,
    extractedData,
    setExtractedData,
    errorMsg,
    isPeakModeActive,
    selectedPanelId,
    selectedPanel,
    activeTab,
    setActiveTab,
    zoomLevel,
    setZoomLevel,
    fileInputRef,
    projectRequirementsPrompt,
    setProjectRequirementsPrompt,

    // Computados
    peakConsumptionVal,
    peakMonthIndex,
    peakMonthName,
    maxConsumptionVal,
    estimatedRealCoveragePct,

    // Handlers
    handleFileSelect,
    handleDragOver,
    handleDrop,
    processSmartProposal,
    handleTogglePeakMonthMode,
    handlePanelChange,
    handleCoverageChange,
    handleUpdateMonthlyConsumption,
    handleApplyToActive,
    handleApplyAsNew,
    handleResetDocument,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  };
}
