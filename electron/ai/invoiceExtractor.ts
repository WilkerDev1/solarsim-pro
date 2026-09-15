import { AIInvoicePayload, ExtractedInvoiceResult, EquipmentSubstitution } from './types';

export function robustParseJson(raw: string): any {
  let clean = raw.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(clean);
  } catch (firstErr: any) {
    try {
      let repaired = clean;
      let inString = false;
      let escaped = false;
      const openBrackets: string[] = [];

      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '\\' && inString) {
          escaped = !escaped;
          continue;
        }
        if (char === '"' && !escaped) {
          inString = !inString;
        }
        if (!inString) {
          if (char === '{' || char === '[') {
            openBrackets.push(char);
          } else if (char === '}') {
            if (openBrackets[openBrackets.length - 1] === '{') openBrackets.pop();
          } else if (char === ']') {
            if (openBrackets[openBrackets.length - 1] === '[') openBrackets.pop();
          }
        }
        escaped = false;
      }

      if (inString) {
        repaired += '"';
      }

      repaired = repaired.replace(/,\s*$/, '');

      while (openBrackets.length > 0) {
        const last = openBrackets.pop();
        if (last === '{') repaired += '}';
        else if (last === '[') repaired += ']';
      }

      return JSON.parse(repaired);
    } catch {
      const lastComma = clean.lastIndexOf(',');
      if (lastComma > 0) {
        try {
          return robustParseJson(clean.slice(0, lastComma));
        } catch {
          // ignore
        }
      }
      const lastBrace = clean.lastIndexOf('}');
      if (lastBrace > 0) {
        try {
          return JSON.parse(clean.slice(0, lastBrace + 1));
        } catch {
          // ignore
        }
      }
      throw new Error(`Error interpretando JSON de la IA: ${firstErr?.message || 'Formato truncado'}`);
    }
  }
}

export function matchBrandFuzzy(brandA?: string, brandB?: string): boolean {
  if (!brandA || !brandB) return false;
  const a = brandA.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = brandB.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  if (
    (a.includes('lux') && b.includes('lux')) ||
    (a.includes('weco') && b.includes('weco')) ||
    (a.includes('hina') && b.includes('hina')) ||
    (a.includes('canadian') && b.includes('canadian'))
  ) return true;
  return false;
}

export function processExtractedInvoice(
  rawText: string,
  payload: AIInvoicePayload,
  modelUsedInfo?: { modelUsed?: string; requestedModel?: string; modelWarning?: string }
): ExtractedInvoiceResult {
  const {
    fileName,
    panelPowerW = 620,
    projectRequirementsText,
    equipmentCatalog = [],
    dopExchangeRate = 60.0,
    includeBattery = false,
  } = payload;

  const parsed = robustParseJson(rawText);
  const cleanName = (parsed.clientName || 'Cliente Propuesta Solar').replace(/\?/g, 'Ñ');

  // Normalizar array de 12 meses
  let monthlyConsumption: number[] = Array.isArray(parsed.monthlyConsumptionKWh)
    ? parsed.monthlyConsumptionKWh.map((n: any) => Math.max(0, Math.round(Number(n) || 0)))
    : [];

  if (monthlyConsumption.length < 12) {
    const avg = parsed.averageMonthlyKWh || 1200;
    while (monthlyConsumption.length < 12) {
      monthlyConsumption.push(avg);
    }
  } else if (monthlyConsumption.length > 12) {
    monthlyConsumption = monthlyConsumption.slice(0, 12);
  }

  const totalAnnual = monthlyConsumption.reduce((sum, v) => sum + v, 0);
  const avgMonthly = Math.round(totalAnnual / 12);

  // Smart Panel Matching con el Catálogo
  let selectedPanelId: string | undefined;
  let selectedPanelModel: string | undefined;
  let selectedPanelWatts: number = panelPowerW > 0 ? panelPowerW : 620;
  let selectedPanelUnitPriceUSD: number | undefined;

  if (parsed.matchedPanelId || parsed.matchedPanelModel || parsed.matchedPanelWatts) {
    let panMatch = equipmentCatalog.find(
      (e) => e.type === 'panel' && (e.id === parsed.matchedPanelId || e.displayName === parsed.matchedPanelModel || e.modelSeries === parsed.matchedPanelModel)
    );
    if (!panMatch) {
      const reqBrand = (parsed.matchedPanelModel || '').toLowerCase();
      const targetW = parsed.matchedPanelWatts || selectedPanelWatts;
      panMatch = equipmentCatalog.find((e) => {
        if (e.type !== 'panel') return false;
        const matchPower = targetW > 0 ? Math.abs((e.powerW || 0) - targetW) <= 10 : true;
        const matchBrand = reqBrand ? matchBrandFuzzy(e.brand, reqBrand) || reqBrand.includes(e.brand.toLowerCase()) : true;
        return matchPower && matchBrand;
      }) || equipmentCatalog.find((e) => e.type === 'panel' && targetW > 0 && Math.abs((e.powerW || 0) - targetW) <= 15);
    }

    if (panMatch) {
      selectedPanelId = panMatch.id;
      selectedPanelModel = panMatch.displayName;
      selectedPanelWatts = panMatch.powerW || selectedPanelWatts;
    } else {
      // Fallback al panel más cercano en potencia del catálogo si la marca pedida no existe
      const targetW = parsed.matchedPanelWatts || selectedPanelWatts;
      const sortedPanels = equipmentCatalog
        .filter((e) => e.type === 'panel' && e.powerW)
        .sort((a, b) => Math.abs((a.powerW || 0) - targetW) - Math.abs((b.powerW || 0) - targetW));
      if (sortedPanels.length > 0) {
        selectedPanelId = sortedPanels[0].id;
        selectedPanelModel = sortedPanels[0].displayName;
        selectedPanelWatts = sortedPanels[0].powerW || selectedPanelWatts;
      } else {
        selectedPanelModel = parsed.matchedPanelModel;
        selectedPanelWatts = parsed.matchedPanelWatts || selectedPanelWatts;
      }
    }
  }

  // Detección de cobertura explícita solicitada en texto
  let requestedCoveragePct: number | undefined;
  if (projectRequirementsText) {
    const covMatch = projectRequirementsText.match(/(?:cobertura|meta)(?:\s*deseada)?(?:\s*al|\s*de)?\s*(\d+)\s*%/i);
    if (covMatch) {
      const parsedPct = parseInt(covMatch[1], 10);
      if (parsedPct >= 10 && parsedPct <= 300) {
        requestedCoveragePct = parsedPct;
      }
    }
  }

  // Detección explícita de paneles / potencia solicitada en texto
  let explicitPanelsDetected = false;
  if (projectRequirementsText) {
    const countMatch = projectRequirementsText.match(/(\d+)\s*(?:paneles|panel|m[oó]dulos)\b/i);
    const kwpMatch =
      projectRequirementsText.match(/(?:paneles|panel|m[oó]dulos|sistema\s*(?:solar|fotovoltaico|fv)?|arreglo|planta)\s*(?:de|en)?\s*(\d+(?:\.\d+)?)\s*k(?:w|wp)\b/i)
      || projectRequirementsText.match(/(\d+(?:\.\d+)?)\s*k(?:w|wp)\s*(?:en\s+|de\s+)?(?:paneles|panel|m[oó]dulos|solar|fotovoltaic[oa]|fv|canadian|jinko|trina|longi|ja\s*solar|risen)\b/i)
      || (() => {
        const strictKwp = projectRequirementsText.match(/(\d+(?:\.\d+)?)\s*kwp\b/i);
        if (!strictKwp) return null;
        const idx = strictKwp.index ?? 0;
        const surrounding = projectRequirementsText.slice(Math.max(0, idx - 25), Math.min(projectRequirementsText.length, idx + strictKwp[0].length + 25)).toLowerCase();
        if (surrounding.includes('inversor') || surrounding.includes('bater') || surrounding.includes('consum') || surrounding.includes('mensual') || surrounding.includes('diari')) {
          return null;
        }
        return strictKwp;
      })();

    if (countMatch) {
      const explicitCount = parseInt(countMatch[1], 10);
      if (explicitCount > 0) {
        parsed.matchedPanelCount = explicitCount;
        explicitPanelsDetected = true;
      }
    } else if (kwpMatch) {
      const explicitKwp = parseFloat(kwpMatch[1]);
      if (explicitKwp > 0) {
        parsed.matchedPanelCount = Math.max(1, Math.round((explicitKwp * 1000) / selectedPanelWatts));
        explicitPanelsDetected = true;
      }
    }
  }

  const specificYieldKWhPerKWp = 1450;
  const baseCoveragePct = requestedCoveragePct || 95;
  const targetAnnualSolarKWh = totalAnnual * (baseCoveragePct / 100);
  const recommendedCapacityKWp = Math.round((targetAnnualSolarKWh / specificYieldKWhPerKWp) * 100) / 100;
  const recommendedPanelCount = Math.max(1, Math.ceil((recommendedCapacityKWp * 1000) / selectedPanelWatts));

  const finalPanelCount = (explicitPanelsDetected && parsed.matchedPanelCount && parsed.matchedPanelCount > 0)
    ? parsed.matchedPanelCount
    : recommendedPanelCount;
  const finalCapacityKWp = Math.round(((finalPanelCount * selectedPanelWatts) / 1000) * 100) / 100;

  // Deducción inteligente de la Cobertura Meta (%)
  let effectiveTargetCoverage = baseCoveragePct;
  if (totalAnnual > 0) {
    if (explicitPanelsDetected) {
      const STANDARD_PRESETS = [80, 90, 95, 100, 105, 110, 120];
      const matchingPreset = STANDARD_PRESETS.find((pct) => {
        const pCap = (totalAnnual * (pct / 100)) / specificYieldKWhPerKWp;
        const pPanels = Math.max(1, Math.ceil((pCap * 1000) / selectedPanelWatts));
        return pPanels === finalPanelCount;
      });

      if (matchingPreset !== undefined) {
        effectiveTargetCoverage = matchingPreset;
      } else {
        const estimatedSolarAnnualKWh = finalCapacityKWp * specificYieldKWhPerKWp;
        const rawPct = Math.round((estimatedSolarAnnualKWh / totalAnnual) * 100);
        effectiveTargetCoverage = Math.max(10, Math.min(300, rawPct));
      }
    }
  }

  // Smart Inverter Matching
  let selectedInverterId: string | undefined;
  let selectedInverterModel: string | undefined;
  let selectedInverterPowerKW: number | undefined;
  let selectedInverterCount: number | undefined;
  let selectedInverterUnitPriceUSD: number | undefined;

  let invMatch: any | undefined;

  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();
    const knownInvBrands = ['weco', 'lux power', 'luxpower', 'solis', 'huawei', 'growatt', 'deye', 'sma', 'fronius', 'enphase', 'victron'];
    const reqBrand = knownInvBrands.find((b) => reqLower.includes(b));

    let explicitInvKW: number | undefined;
    const invKwMatch = reqLower.match(/(?:inversor(?:es)?|inv)\b[^\n,;.]*?(\d+(?:\.\d+)?)\s*(?:kw|k)\b/i)
      || reqLower.match(/(\d+(?:\.\d+)?)\s*(?:kw|k)\b[^\n,;.]*?(?:inversor(?:es)?|inv)\b/i);
    if (invKwMatch) {
      explicitInvKW = parseFloat(invKwMatch[1]);
    } else if (reqBrand) {
      const cleanBrandKey = reqBrand.replace('luxpower', 'lux');
      const brandKwMatch = reqLower.match(new RegExp(`(?:${cleanBrandKey})\\b[^\\n,;.]*?(\\d+(?:\\.\\d+)?)\\s*(?:kw|k)\\b`, 'i'))
        || reqLower.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:kw|k)\\b[^\\n,;.]*?(?:${cleanBrandKey})`, 'i'));
      if (brandKwMatch) {
        const matchIdx = brandKwMatch.index ?? 0;
        const surrounding = reqLower.slice(Math.max(0, matchIdx - 25), Math.min(reqLower.length, matchIdx + brandKwMatch[0].length + 25));
        if (!surrounding.includes('bater')) {
          explicitInvKW = parseFloat(brandKwMatch[1]);
        }
      }
    }

    if (reqBrand) {
      const cleanBrandKey = reqBrand.replace('luxpower', 'lux');
      const brandInverters = equipmentCatalog.filter(
        (e: any) => e.type === 'inverter' && (
          e.brand?.toLowerCase().includes(cleanBrandKey) ||
          e.displayName?.toLowerCase().includes(cleanBrandKey) ||
          e.modelSeries?.toLowerCase().includes(cleanBrandKey)
        )
      );
      if (brandInverters.length > 0) {
        const targetKW = explicitInvKW || parsed.matchedInverterPowerKW || 8.0;
        brandInverters.sort((a: any, b: any) => {
          const diffA = Math.abs((a.powerKW || 0) - targetKW);
          const diffB = Math.abs((b.powerKW || 0) - targetKW);
          if (Math.abs(diffA - diffB) > 0.05) return diffA - diffB;
          const strTarget = `${Math.round(targetKW)}k`;
          const matchNameA = (a.displayName || '').toLowerCase().includes(strTarget) || (a.modelSeries || '').toLowerCase().includes(strTarget);
          const matchNameB = (b.displayName || '').toLowerCase().includes(strTarget) || (b.modelSeries || '').toLowerCase().includes(strTarget);
          if (matchNameA && !matchNameB) return -1;
          if (!matchNameA && matchNameB) return 1;
          return 0;
        });
        invMatch = brandInverters[0];
      }
    }

    const invCountMatch = reqLower.match(/(\d+)\s*(?:x\s*)?(?:inversor(?:es)?|unidades?\s*(?:de\s*)?inversor)/i);
    if (invCountMatch) {
      selectedInverterCount = parseInt(invCountMatch[1], 10);
    } else if (reqBrand) {
      const cleanBrandKey = reqBrand.replace('luxpower', 'lux');
      const countBrandMatch = reqLower.match(new RegExp(`(\\d+)\\s*(?:x\\s*)?(?:${cleanBrandKey})\\b(?!\\s*bater[ií]a)`, 'i'));
      if (countBrandMatch) {
        const fullMatchIdx = countBrandMatch.index ?? 0;
        const lineText = reqLower.slice(Math.max(0, fullMatchIdx - 15), Math.min(reqLower.length, fullMatchIdx + 30));
        if (!lineText.includes('bater')) {
          selectedInverterCount = parseInt(countBrandMatch[1], 10);
        }
      }
    }
  }

  if (!invMatch && (parsed.matchedInverterId || parsed.matchedInverterModel || parsed.matchedInverterPowerKW)) {
    invMatch = equipmentCatalog.find(
      (e: any) => e.type === 'inverter' && (e.id === parsed.matchedInverterId || e.displayName === parsed.matchedInverterModel || e.modelSeries === parsed.matchedInverterModel)
    );
    if (!invMatch) {
      const reqInvStr = `${parsed.matchedInverterModel || ''} ${parsed.aiReasoningSummary || ''}`.toLowerCase();
      const targetKW = parsed.matchedInverterPowerKW || 8.0;
      invMatch = equipmentCatalog.find((e: any) => {
        if (e.type !== 'inverter') return false;
        const matchBrand = matchBrandFuzzy(e.brand, reqInvStr) || reqInvStr.includes(e.brand.toLowerCase());
        const matchPower = Math.abs((e.powerKW || 0) - targetKW) <= 1.0;
        return matchBrand && matchPower;
      }) || equipmentCatalog.find((e: any) => {
        if (e.type !== 'inverter') return false;
        return matchBrandFuzzy(e.brand, reqInvStr) || reqInvStr.includes(e.brand.toLowerCase());
      });
    }

    if (!invMatch) {
      const targetKW = parsed.matchedInverterPowerKW || 8.0;
      const sortedInverters = equipmentCatalog
        .filter((e: any) => e.type === 'inverter' && e.powerKW)
        .sort((a: any, b: any) => Math.abs((a.powerKW || 0) - targetKW) - Math.abs((b.powerKW || 0) - targetKW));
      if (sortedInverters.length > 0) {
        invMatch = sortedInverters[0];
      }
    }
  }

  if (!invMatch) {
    const defaultInverters = equipmentCatalog.filter((e: any) => e.type === 'inverter');
    invMatch = defaultInverters.find((i: any) => (i.powerKW || 0) === 8.0) || defaultInverters[0];
  }

  if (invMatch) {
    selectedInverterId = invMatch.id;
    selectedInverterModel = invMatch.displayName;
    selectedInverterPowerKW = invMatch.powerKW || parsed.matchedInverterPowerKW || 8.0;
    const prices = invMatch.supplierPrices || [];
    if (prices.length > 0) {
      selectedInverterUnitPriceUSD = [...prices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0]?.priceUSD;
    }
  } else {
    selectedInverterModel = parsed.matchedInverterModel || 'Inversor Lux Power LXP-LB-US 8K (8.0Kw)';
    selectedInverterPowerKW = parsed.matchedInverterPowerKW || 8.0;
  }
  
  if (selectedInverterCount && selectedInverterCount > 0) {
    // Mantener cantidad explícita
  } else if (parsed.matchedInverterCount && parsed.matchedInverterCount > 0) {
    selectedInverterCount = parsed.matchedInverterCount;
  } else {
    selectedInverterCount = Math.max(1, Math.ceil(finalCapacityKWp / (selectedInverterPowerKW || 8.0)));
  }

  // Smart BESS Battery Storage Matching
  let hasBattery = parsed.hasBattery === true;
  let selectedBatteryId: string | undefined;
  let selectedBatteryModel: string | undefined;
  let selectedBatteryCapacityKWh: number | undefined;
  let selectedBatteryCount: number | undefined;
  let selectedBatteryUnitPriceUSD: number | undefined;

  let batMatch: any | undefined;

  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();
    const knownBatBrands = ['weco', 'hinaess', 'hina', 'powergem', 'byd', 'tesla', 'pylontech', 'dyness', 'deye', 'felicity'];
    const reqBrand = knownBatBrands.find((b) => reqLower.includes(b));
    if (reqBrand || reqLower.includes('bateria') || reqLower.includes('batería')) {
      hasBattery = true;
      if (reqBrand) {
        const cleanBrandKey = reqBrand === 'powergem' || reqBrand === 'hina' ? 'hina' : reqBrand;
        const brandBatteries = equipmentCatalog.filter(
          (e: any) => e.type === 'battery' && (
            e.brand?.toLowerCase().includes(cleanBrandKey) ||
            e.displayName?.toLowerCase().includes(cleanBrandKey) ||
            e.modelSeries?.toLowerCase().includes(cleanBrandKey)
          )
        );
        if (brandBatteries.length > 0) {
          const capMatch = reqLower.match(/(?:bater[ií]a(?:s)?|bess)\b[^\n,;.]*?(\d+(?:\.\d+)?)\s*(?:kwh|k\b)/i)
            || reqLower.match(/(\d+(?:\.\d+)?)\s*(?:kwh|k\b)[^\n,;.]*?(?:bater[ií]a(?:s)?|bess)\b/i)
            || reqLower.match(/(\d+(?:\.\d+)?)\s*(?:kwh|k|k\b)/);
          const targetCap = capMatch ? parseFloat(capMatch[1]) : (parsed.matchedBatteryCapacityKWh || 16.0);
          brandBatteries.sort((a: any, b: any) => Math.abs((a.capacityKWh || 0) - targetCap) - Math.abs((b.capacityKWh || 0) - targetCap));
          batMatch = brandBatteries[0];
        }
      }

      const batCountMatch = reqLower.match(/(\d+)\s*(?:bater[ií]as?|unidades?\s*de\s*bater[ií]a)/i);
      if (batCountMatch) {
        selectedBatteryCount = parseInt(batCountMatch[1], 10);
      }
    }
  }

  if (!batMatch && (hasBattery || parsed.matchedBatteryId || parsed.matchedBatteryModel || (parsed.matchedBatteryCount && parsed.matchedBatteryCount > 0))) {
    hasBattery = true;
    batMatch = equipmentCatalog.find(
      (e: any) => e.type === 'battery' && (e.id === parsed.matchedBatteryId || e.displayName === parsed.matchedBatteryModel || e.modelSeries === parsed.matchedBatteryModel)
    );
    if (!batMatch) {
      const reqBatStr = `${parsed.matchedBatteryModel || ''} ${parsed.aiReasoningSummary || ''}`.toLowerCase();
      const targetCap = parsed.matchedBatteryCapacityKWh || 16.08;
      batMatch = equipmentCatalog.find((e: any) => {
        if (e.type !== 'battery') return false;
        const matchBrand = matchBrandFuzzy(e.brand, reqBatStr) || reqBatStr.includes(e.brand.toLowerCase());
        const matchCap = Math.abs((e.capacityKWh || 0) - targetCap) <= 1.0;
        return matchBrand && matchCap;
      }) || equipmentCatalog.find((e: any) => {
        if (e.type !== 'battery') return false;
        return matchBrandFuzzy(e.brand, reqBatStr) || reqBatStr.includes(e.brand.toLowerCase());
      });
    }

    if (!batMatch) {
      const targetCap = parsed.matchedBatteryCapacityKWh || 16.08;
      const sortedBatteries = equipmentCatalog
        .filter((e: any) => e.type === 'battery' && e.capacityKWh)
        .sort((a: any, b: any) => Math.abs((a.capacityKWh || 0) - targetCap) - Math.abs((b.capacityKWh || 0) - targetCap));
      if (sortedBatteries.length > 0) {
        batMatch = sortedBatteries[0];
      }
    }
  }

  if (includeBattery) {
    hasBattery = true;
  }

  if (hasBattery && !batMatch) {
    const defaultBatteries = equipmentCatalog.filter((e: any) => e.type === 'battery');
    batMatch = defaultBatteries.find((b: any) => (b.capacityKWh || 0) >= 15) || defaultBatteries[0];
  }

  if (batMatch && hasBattery) {
    selectedBatteryId = batMatch.id;
    selectedBatteryModel = batMatch.displayName;
    selectedBatteryCapacityKWh = batMatch.capacityKWh || parsed.matchedBatteryCapacityKWh || 16.08;
    const prices = batMatch.supplierPrices || [];
    if (prices.length > 0) {
      selectedBatteryUnitPriceUSD = [...prices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0]?.priceUSD;
    }
  } else if (!hasBattery) {
    selectedBatteryId = undefined;
    selectedBatteryModel = undefined;
    selectedBatteryCapacityKWh = undefined;
    selectedBatteryCount = 0;
    selectedBatteryUnitPriceUSD = undefined;
  }
  selectedBatteryCount = hasBattery ? (selectedBatteryCount || parsed.matchedBatteryCount || 1) : 0;

  // Sustituciones de equipos
  let equipmentSubstitutions: EquipmentSubstitution[] = Array.isArray(parsed.equipmentSubstitutions) ? [...parsed.equipmentSubstitutions] : [];

  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();

    // Inversor
    if (selectedInverterModel) {
      const knownInvBrands = ['weco', 'lux power', 'luxpower', 'solis', 'huawei', 'growatt', 'deye', 'sma', 'fronius', 'enphase', 'victron'];
      const reqBrand = knownInvBrands.find((b) => reqLower.includes(b));
      if (reqBrand && !selectedInverterModel.toLowerCase().includes(reqBrand.replace('luxpower', 'lux'))) {
        if (!equipmentSubstitutions.some((s) => s.type === 'inverter')) {
          equipmentSubstitutions.push({
            type: 'inverter',
            requestedModel: `Inversor ${reqBrand.toUpperCase()}`,
            selectedModel: selectedInverterModel,
            reason: `Marca ${reqBrand.toUpperCase()} no disponible en catálogo; se seleccionó ${selectedInverterModel} de potencia equivalente (${selectedInverterPowerKW || 8} kW).`,
          });
        }
      }
    }

    // Batería
    if (hasBattery && selectedBatteryModel) {
      const knownBatBrands = ['weco', 'hinaess', 'hina', 'byd', 'tesla', 'pylontech', 'dyness'];
      const reqBrand = knownBatBrands.find((b) => reqLower.includes(b));
      const normalizedReqBrand = reqBrand === 'hina' ? 'hinaess' : reqBrand;
      if (normalizedReqBrand && !selectedBatteryModel.toLowerCase().includes(normalizedReqBrand)) {
        if (!equipmentSubstitutions.some((s) => s.type === 'battery')) {
          equipmentSubstitutions.push({
            type: 'battery',
            requestedModel: `Batería ${normalizedReqBrand.toUpperCase()}`,
            selectedModel: selectedBatteryModel,
            reason: `Marca ${normalizedReqBrand.toUpperCase()} no disponible en catálogo; se seleccionó ${selectedBatteryModel} de capacidad equivalente (${selectedBatteryCapacityKWh || 16.08} kWh).`,
          });
        }
      }
    }
  }

  // Sanitización de sustituciones
  if (projectRequirementsText) {
    const reqLower = projectRequirementsText.toLowerCase();
    equipmentSubstitutions = equipmentSubstitutions.filter((sub) => {
      if (sub.type === 'inverter' && selectedInverterModel) {
        const invReqBrand = ['weco', 'lux power', 'luxpower', 'solis', 'huawei', 'growatt', 'deye', 'sma', 'fronius', 'victron']
          .find((b) => sub.requestedModel.toLowerCase().includes(b) || reqLower.includes(b));
        if (invReqBrand && selectedInverterModel.toLowerCase().includes(invReqBrand.replace('luxpower', 'lux'))) {
          return false;
        }
      }
      if (sub.type === 'battery' && selectedBatteryModel) {
        const batReqBrand = ['weco', 'hinaess', 'hina', 'powergem', 'byd', 'tesla', 'pylontech', 'dyness', 'deye', 'felicity']
          .find((b) => sub.requestedModel.toLowerCase().includes(b) || reqLower.includes(b));
        const normBrand = batReqBrand === 'powergem' || batReqBrand === 'hina' ? 'hina' : batReqBrand;
        if (normBrand && selectedBatteryModel.toLowerCase().includes(normBrand)) {
          return false;
        }
      }
      return true;
    });
  }

  // Precios de proveedores y auto-pricing
  const selectedSupplierInfo: any = {};
  let autoSupplierPricing = false;

  if (selectedPanelId) {
    const pItem = equipmentCatalog.find((e) => e.id === selectedPanelId);
    if (pItem?.supplierPrices && pItem.supplierPrices.length > 0) {
      const best = [...pItem.supplierPrices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0];
      selectedPanelUnitPriceUSD = best.priceUSD;
      selectedSupplierInfo.panel = {
        supplierName: best.supplierName,
        priceUSD: best.priceUSD,
        updatedAt: best.updatedAt,
        supplierPriceId: best.id,
      };
      autoSupplierPricing = true;
    }
  }

  if (selectedInverterId) {
    const iItem = equipmentCatalog.find((e) => e.id === selectedInverterId);
    if (iItem?.supplierPrices && iItem.supplierPrices.length > 0) {
      const best = [...iItem.supplierPrices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0];
      selectedInverterUnitPriceUSD = best.priceUSD;
      selectedSupplierInfo.inverter = {
        supplierName: best.supplierName,
        priceUSD: best.priceUSD,
        updatedAt: best.updatedAt,
        supplierPriceId: best.id,
      };
      autoSupplierPricing = true;
    }
  }

  if (selectedBatteryId) {
    const bItem = equipmentCatalog.find((e) => e.id === selectedBatteryId);
    if (bItem?.supplierPrices && bItem.supplierPrices.length > 0) {
      const best = [...bItem.supplierPrices].sort((a: any, b: any) => a.priceUSD - b.priceUSD)[0];
      selectedBatteryUnitPriceUSD = best.priceUSD;
      selectedSupplierInfo.battery = {
        supplierName: best.supplierName,
        priceUSD: best.priceUSD,
        updatedAt: best.updatedAt,
        supplierPriceId: best.id,
      };
      autoSupplierPricing = true;
    }
  }

  // Extracción de tarifa en RD$ y conversión a USD
  let finalEnergyCostDOP: number | undefined = parsed.energyCostPerKWhDOP && Number(parsed.energyCostPerKWhDOP) > 0
    ? Number(parsed.energyCostPerKWhDOP)
    : undefined;

  if (!finalEnergyCostDOP) {
    const combinedNotes = `${parsed.aiNotes || ''} ${parsed.notes || ''} ${parsed.specialTechnicalNotes || ''}`;
    const match = combinedNotes.match(/(?:tarifa|precio)(?:\s+de|\s*:)?\s*(?:RD\$?)?\s*([\d,.]+)\s*(?:\/|\s*por\s*)?kWh/i);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val > 0 && val < 60) {
        finalEnergyCostDOP = val;
      }
    }
  }

  if (!finalEnergyCostDOP && parsed.totalBilledAmountDOP && parsed.currentBilledKWh && Number(parsed.currentBilledKWh) > 0) {
    const deduced = (Number(parsed.totalBilledAmountDOP) - (Number(parsed.fixedChargeDOP) || 0)) / Number(parsed.currentBilledKWh);
    if (deduced > 3 && deduced < 50) {
      finalEnergyCostDOP = Number(deduced.toFixed(2));
    }
  }

  const effectiveExchangeRate = dopExchangeRate > 0 ? dopExchangeRate : 60.50;
  const finalEnergyCostUSD = finalEnergyCostDOP
    ? Number((finalEnergyCostDOP / effectiveExchangeRate).toFixed(4))
    : undefined;

  return {
    clientName: cleanName,
    companyName: parsed.companyName || undefined,
    nic: parsed.nic || undefined,
    nis: parsed.nis || undefined,
    circuit: parsed.circuit || undefined,
    rnc: parsed.rnc || undefined,
    contractNumber: parsed.contractNumber || undefined,
    eNCF: parsed.eNCF || undefined,
    address: parsed.address || undefined,
    province: parsed.province || 'Santo Domingo',
    municipality: parsed.municipality || undefined,
    phone: parsed.phone || undefined,
    email: parsed.email || undefined,
    distributor: (['EDEESTE', 'EDESUR', 'EDENORTE', 'CEPM'].includes(parsed.distributor)
      ? parsed.distributor
      : 'EDEESTE') as any,
    tariffCode: parsed.tariffCode || 'BTS1',
    energyCostPerKWhDOP: finalEnergyCostDOP,
    energyCostPerKWhUSD: finalEnergyCostUSD,
    dopExchangeRate: effectiveExchangeRate,
    marginalRateDOP: parsed.marginalRateDOP || undefined,
    fixedChargeDOP: parsed.fixedChargeDOP || undefined,
    peakDemandKW: parsed.peakDemandKW || undefined,
    demandCostPerKWDOP: parsed.demandCostPerKWDOP || undefined,
    meterNumber: parsed.meterNumber || undefined,
    voltagePhase: parsed.voltagePhase || undefined,
    powerFactor: parsed.powerFactor || undefined,
    billingDays: parsed.billingDays || undefined,
    totalBilledAmountDOP: parsed.totalBilledAmountDOP || undefined,
    totalWithoutSubsidyDOP: parsed.totalWithoutSubsidyDOP || undefined,
    governmentSubsidyDOP: parsed.governmentSubsidyDOP || undefined,
    monthlyConsumptionKWh: monthlyConsumption,
    annualConsumptionKWh: totalAnnual,
    averageMonthlyKWh: avgMonthly,
    currentBilledKWh: parsed.currentBilledKWh || monthlyConsumption[0],

    // Paneles
    recommendedCapacityKWp: finalCapacityKWp,
    recommendedPanelCount: finalPanelCount,
    selectedPanelId,
    selectedPanelModel,
    selectedPanelWatts,
    selectedPanelUnitPriceUSD,

    // Inversor
    selectedInverterId,
    selectedInverterModel,
    selectedInverterPowerKW,
    selectedInverterCount,
    selectedInverterUnitPriceUSD,

    // Baterías
    hasBattery,
    selectedBatteryId,
    selectedBatteryModel,
    selectedBatteryCapacityKWh,
    selectedBatteryCount,
    selectedBatteryUnitPriceUSD,

    // Estrategia Comercial & Finanzas
    targetMarginPct: parsed.targetMarginPct || undefined,
    pricingMode: parsed.targetMarginPct ? 'cost_matrix' : undefined,
    autoSupplierPricing,
    selectedSupplierInfo: autoSupplierPricing ? selectedSupplierInfo : undefined,

    // Requisitos & Razonamiento IA
    targetCoveragePct: effectiveTargetCoverage,
    confidenceScore: parsed.confidenceScore || 98,
    extractedFromFileName: fileName || 'Requisitos en texto libre',
    projectRequirementsPrompt: projectRequirementsText || undefined,
    aiReasoningSummary: parsed.aiReasoningSummary || undefined,
    specialTechnicalNotes: parsed.specialTechnicalNotes || undefined,
    aiNotes: parsed.notes || undefined,
    equipmentSubstitutions: equipmentSubstitutions.length > 0 ? equipmentSubstitutions : undefined,

    // Información de modelo y advertencia por fallback
    modelUsed: modelUsedInfo?.modelUsed,
    requestedModel: modelUsedInfo?.requestedModel,
    modelWarning: modelUsedInfo?.modelWarning,
  };
}
