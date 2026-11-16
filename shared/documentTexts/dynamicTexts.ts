import { getTariffDisplayName } from '../proposalPresentation';
import { resolveGridConnection } from '../gridConnection';
import { hasSavingsComparison, resolveGeneratorCostPerKWh, resolveSavingsBasis, supplyPresentation } from '../offGridSupply';
import { FACTORY_TEXTS } from './factoryTexts';
import type { DocumentTextContext } from './context';
import { resolveDynamicProjectSummaryParagraph1, resolveDynamicProjectSummaryParagraph2 } from './projectSummary';

const kwh = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Nota regulatoria según tarifa, distribuidora, inyección cero, retención y baterías. */
export function regulatoryNoteDefault(ctx: DocumentTextContext): string {
  if (resolveGridConnection(ctx) === 'off_grid') return offGridRegulatoryNote(ctx);
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

/**
 * Sistema aislado (modo isla): sin medición neta, sin inyección y sin cargos de la distribuidora. La redacción del
 * ahorro depende de la alternativa de suministro (`shared/offGridSupply.ts`): tarifa (texto de siempre), generador
 * (se compara con el costo de generación propia indicado) o sin comparación (no se habla de ahorro).
 */
function offGridRegulatoryNote(ctx: DocumentTextContext): string {
  const storage = ctx.hasBatteryStorage ? ' y el banco de baterías' : '';
  const basis = resolveSavingsBasis(ctx);
  const uncovered = `El consumo que no cubran la producción solar${ctx.hasBatteryStorage ? ' ni las baterías' : ''} deberá atenderse con una fuente de respaldo (por ejemplo, una planta eléctrica) o gestionando las cargas${ctx.hasBatteryStorage ? '' : '; sin baterías, el sistema solo abastece consumos durante las horas de sol'}.`;
  const p1 = `El sistema fotovoltaico operará aislado de la red eléctrica (modo isla), sin acometida ni contrato con la distribuidora: la producción solar${storage} abastecerá${storage ? 'n' : ''} directamente los consumos del inmueble y no habrá intercambio de energía con la red de distribución.`;
  const p2 = 'La presente propuesta se basa en criterios técnicos y en el historial de consumo del cliente. Al no conectarse a la red, no le aplican los cargos ni las compensaciones de la distribuidora.';
  if (!hasSavingsComparison(basis)) {
    return [
      p1,
      p2,
      'Esta propuesta no incluye una comparación económica con un suministro actual: presenta la inversión, la energía que entregará el sistema, la energía no servida estimada y la autonomía de las baterías. Las cifras de energía son estimadas y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.',
      uncovered,
    ].join('\n\n');
  }
  const p3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';
  if (basis === 'generator') {
    const cost = (resolveGeneratorCostPerKWh(ctx) as number).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return [
      p1,
      p2,
      p3,
      `El ahorro estimado compara la energía que abastece el sistema con el costo de generación propia indicado por el cliente (planta eléctrica), de US$ ${cost} por kWh. ${uncovered}`,
    ].join('\n\n');
  }
  return [
    p1,
    p2,
    p3,
    `El ahorro estimado valora únicamente la energía que abastece el sistema, al costo de referencia por kWh de esta propuesta. ${uncovered}`,
  ].join('\n\n');
}

/**
 * Texto que solo cambia cuando no hay comparación de ahorro (sistema aislado «sin comparación» o generador sin
 * costo). Las dos variantes quedan como valores de fábrica conocidos: una propuesta que guardó cualquiera de ellas
 * no cuenta como personalizada y toma la que corresponda al modo actual.
 */
export function savingsAwareText(standard: string, withoutComparison: string) {
  return {
    defaultText: (ctx: DocumentTextContext) => (hasSavingsComparison(resolveSavingsBasis(ctx)) ? standard : withoutComparison),
    // Ambas variantes son de fábrica: si una quedó guardada, sigue al modo actual en vez de quedar congelada.
    knownFactoryValues: [standard, withoutComparison] as readonly string[],
  };
}

/** Servicios gestionados: un sistema aislado no tramita medición neta ni interconexión con la distribuidora. */
export function servicesIncludedDefault(ctx: DocumentTextContext): string {
  return resolveGridConnection(ctx) === 'off_grid'
    ? 'Permisos y Tramitación ante CNE, Planos Eléctricos, Instalación Certificada y Puesta en Marcha.'
    : FACTORY_TEXTS.servicesIncludedText;
}

/** Nota al pie del cuadro resumen: régimen de conexión. */
export const EXECUTIVE_FOOTNOTE_RIGHT_GRID = 'Régimen de Medición Neta • Certificación CNE / SIE';
export function executiveFootnoteRightDefault(ctx: DocumentTextContext): string {
  return resolveGridConnection(ctx) === 'off_grid' ? 'Sistema aislado (modo isla) • Sin conexión a la red' : EXECUTIVE_FOOTNOTE_RIGHT_GRID;
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

/**
 * Texto que nombra la distribuidora o su tarifa como suministro: solo se usa con red o con un sistema aislado comparado
 * con la tarifa. Con generador o «sin comparación» se usa la otra variante (no se nombra la distribuidora). Ambas son
 * valores de fábrica conocidos.
 */
export function supplyAwareText(utility: string, other: string) {
  return {
    defaultText: (ctx: DocumentTextContext) => (supplyPresentation(ctx).kind === 'utility' ? utility : other),
    knownFactoryValues: [utility, other] as readonly string[],
  };
}
