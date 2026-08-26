import React from 'react';

/**
 * Parses markdown-style bold formatting (**text**) and renders it as React elements.
 * Preserves normal text, spaces, and linebreaks.
 *
 * @param text The input text string containing optional **bold** markdown markers
 * @param boldClassName CSS class applied to <strong> tags (default: 'text-slate-950 font-bold')
 * @param style Optional inline styles (e.g. dynamic primary color)
 */
export function renderFormattedMarkdown(
  text?: string | null,
  boldClassName = 'text-slate-950 font-bold',
  style?: React.CSSProperties
): React.ReactNode {
  if (!text) return null;

  // Split by markdown bold delimiter: (**content**)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const content = part.slice(2, -2);
      return (
        <strong key={index} className={boldClassName} style={style}>
          {content}
        </strong>
      );
    }
    return part;
  });
}

/**
 * Dynamically resolves technical values in Project Summary Paragraph 1
 * ensuring that panel count, kWp, annual generation, coverage %, and client name
 * always remain 100% synchronized with the simulation store even if custom text was saved.
 */
export function resolveDynamicProjectSummaryParagraph1(
  customText: string | undefined | null,
  defaultText: string,
  project: { specs: { panelCount: number; panelBrandModel?: string; panelPowerW?: number } },
  summary: { systemCapacityKWp: number; annualProductionKWh: number; annualConsumptionKWh: number; energyCoveragePct: number },
  clientName: string,
  panelModel: string
): string {
  if (!customText || !customText.trim()) {
    return defaultText;
  }

  let text = customText.trim();
  const rawModel = panelModel.replace(/^m[oó]dulos?\s+/i, '').trim();
  const modLabel = project.specs.panelCount > 1 ? 'Módulos' : 'Módulo';
  const formattedPanelDesc = `${modLabel} ${rawModel}`;

  // 1. Support explicit placeholders:
  text = text
    .replace(/{clientName}/gi, clientName)
    .replace(/{panelCount}/gi, String(project.specs.panelCount))
    .replace(/{panelModel}/gi, formattedPanelDesc)
    .replace(/{systemCapacityKWp}/gi, `${summary.systemCapacityKWp.toFixed(2)} kWp`)
    .replace(/{annualProductionKWh}/gi, `${summary.annualProductionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`)
    .replace(/{annualConsumptionKWh}/gi, `${summary.annualConsumptionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`)
    .replace(/{energyCoveragePct}/gi, `${summary.energyCoveragePct.toFixed(1)}%`);

  // 2. Dynamically update numeric values if paragraph follows standard proposal wording:
  text = text.replace(
    /\*\*\s*\d+\s+(?:M[oó]dulos?\s+)?[^*]+\*\*/i,
    `**${project.specs.panelCount} ${formattedPanelDesc}**`
  );

  text = text.replace(
    /potencia\s+DC\s+instalada\s+de\s+\*\*[^*]+\*\*/i,
    `potencia DC instalada de **${summary.systemCapacityKWp.toFixed(2)} kWp**`
  );

  text = text.replace(
    /producción\s+energética\s+estimada\s+para\s+este\s+sistema\s+es\s+de\s+\*\*[^*]+\*\*/i,
    `producción energética estimada para este sistema es de **${summary.annualProductionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh anuales**`
  );

  text = text.replace(
    /representando\s+el\s+\*\*[^*]+\*\*\s+del\s+consumo/i,
    `representando el **${summary.energyCoveragePct.toFixed(1)}%** del consumo`
  );

  text = text.replace(
    /representando\s+el\s+\*\*[^*]+\*\*\s+de\s+cobertura/i,
    `representando el **${summary.energyCoveragePct.toFixed(1)}%** de cobertura`
  );

  text = text.replace(
    /(consumo\s+promedio\s+anual\s+de\s+\*\*[^*]+\*\*\s+es\s+de\s+)\*\*[^*]+\*\*/i,
    `$1**${summary.annualConsumptionKWh.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh**`
  );

  return text;
}

/**
 * Dynamically resolves technical values in Project Summary Paragraph 2
 * ensuring inverter count, inverter model, battery count, and battery model stay synced.
 */
export function resolveDynamicProjectSummaryParagraph2(
  customText: string | undefined | null,
  defaultText: string,
  project: { specs: { inverterCount?: number; hasBattery?: boolean; batteryCapacityKWh?: number; batteryCount?: number } },
  inverterModel: string,
  batteryModel: string,
  scopeText: string
): string {
  if (!customText || !customText.trim()) {
    return defaultText;
  }

  let text = customText.trim();
  const invCount = project.specs.inverterCount || 1;
  const batCount = project.specs.batteryCount || 1;

  const rawInverter = inverterModel.replace(/^inversores?\s+/i, '').trim();
  const invLabel = invCount > 1 ? 'Inversores' : 'Inversor';
  const formattedInverterDesc = `${invLabel} ${rawInverter}`;

  const rawBattery = batteryModel.replace(/^bater[íi]as?\s+/i, '').trim();
  const batLabel = batCount > 1 ? 'Baterías' : 'Batería';
  const formattedBatteryDesc = `${batLabel} ${rawBattery}`;

  // 1. Support placeholders:
  text = text
    .replace(/{inverterCount}/gi, String(invCount))
    .replace(/{inverterModel}/gi, formattedInverterDesc)
    .replace(/{batteryCount}/gi, String(batCount))
    .replace(/{batteryModel}/gi, formattedBatteryDesc)
    .replace(/{scopeText}/gi, scopeText);

  // 2. Keep inverter count and model synchronized:
  text = text.replace(
    /instalación\s+de\s+\*\*\s*\d+\s+(?:Inversores?\s+)?[^*]+\*\*/i,
    `instalación de **${invCount} ${formattedInverterDesc}**`
  );

  // 3. Keep battery count and model synchronized if has battery:
  if (project.specs.hasBattery && (project.specs.batteryCapacityKWh || 0) > 0) {
    if (/Bater[íi]a/i.test(text)) {
      text = text.replace(
        /y\s+\*\*\s*\d+\s+(?:Bater[íi]as?\s+)?[^*]+\*\*/i,
        `y **${batCount} ${formattedBatteryDesc}**`
      );
    }
  }

  return text;
}
