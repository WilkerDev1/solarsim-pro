import { getTariffDisplayName } from '../proposalPresentation';
import type { DocumentTextContext } from './context';
import { resolveDynamicProjectSummaryParagraph1, resolveDynamicProjectSummaryParagraph2 } from './projectSummary';

const kwh = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Nota regulatoria según tarifa, distribuidora, inyección cero, retención y baterías. */
export function regulatoryNoteDefault(ctx: DocumentTextContext): string {
  const distributor = ctx.distributor || 'EDES';
  const isCEPM = distributor === 'CEPM';
  const tariff = ctx.tariffCode || (isCEPM ? 'RBT-1' : 'BTS2');
  const tariffDisplayName = getTariffDisplayName(distributor, tariff);
  const exportFee = ctx.gridExportFeePct;

  const p1 = ctx.isZeroExport
    ? 'El sistema fotovoltaico operará bajo la modalidad de Inyección Cero (Zero-Export con limitador antivertido), suministrando energía prioritariamente a los consumos internos del inmueble y evitando cualquier inyección de excedentes hacia la red eléctrica de distribución.'
    : `La energía generada mensualmente se descontará del consumo tomado de la red de ${isCEPM ? 'CEPM' : 'la distribuidora eléctrica (EDES)'}. Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica bajo el régimen de Medición Neta.`;
  const p2 = 'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.';
  const p3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';
  const p4 = ctx.isZeroExport
    ? `Al operar con limitador antivertido (inyección cero)${ctx.hasBattery ? ' y almacenamiento en baterías de litio' : ''}, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.`
    : `Para la tarifa ${tariffDisplayName}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al ${exportFee}% del valor de la energía excedente exportada, conforme al régimen de Medición Neta y la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${ctx.hasBattery ? '' : ' Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento directo de la energía generada.'}`;
  return [p1, p2, p3, p4].join('\n\n');
}

export function projectSummaryParagraph1Default(ctx: DocumentTextContext): string {
  return `El consumo promedio anual de **${ctx.clientName}** es de **${kwh(ctx.annualConsumptionKWh)} kWh**, por lo que se le propone la instalación de **${ctx.panelsSummaryText}**, alcanzando una potencia DC instalada de **${ctx.systemCapacityKWp.toFixed(2)} kWp**. La producción energética estimada para este sistema es de **${kwh(ctx.annualProductionKWh)} kWh anuales**, representando el **${ctx.energyCoveragePct.toFixed(1)}%** del consumo total del cliente.`;
}

export function projectSummaryParagraph2Default(ctx: DocumentTextContext, scopeText: string): string {
  return `Adicionalmente, se contempla la instalación de **${ctx.invertersSummaryText}**${ctx.hasBatteryStorage ? ` y **${ctx.batteriesSummaryText}**` : ''} ${scopeText}`;
}

/** Párrafo 1 personalizado con los números de la simulación actual. */
export function syncProjectSummaryParagraph1(stored: string, ctx: DocumentTextContext): string {
  return resolveDynamicProjectSummaryParagraph1(
    stored,
    projectSummaryParagraph1Default(ctx),
    { panelCount: ctx.panelCount },
    ctx,
    ctx.clientName,
    ctx.panelModelText,
  );
}

export function syncProjectSummaryParagraph2(stored: string, ctx: DocumentTextContext, scopeText: string): string {
  return resolveDynamicProjectSummaryParagraph2(
    stored,
    projectSummaryParagraph2Default(ctx, scopeText),
    { inverterCount: ctx.inverterCount, hasBattery: ctx.hasBattery, batteryNominalKWh: ctx.batteryCapacityKWh, batteryCount: ctx.batteryCount },
    ctx.inverterModelText,
    ctx.batteryModelText,
    scopeText,
  );
}

/** Nota de validez de la cotización (sigue los días de validez). */
export function validityNoteDefault(ctx: DocumentTextContext): string {
  return `Precios sujetos a disponibilidad de inventario. Cotización válida por ${ctx.quoteValidityDays} días laborables.`;
}

/** Teléfonos de ejemplo de versiones antiguas que nunca deben imprimirse. */
export function isPlaceholderPhone(phone: string): boolean {
  return phone.includes('555-0199') || phone.includes('5550199') || phone === '+1 (809) 000-0000';
}
