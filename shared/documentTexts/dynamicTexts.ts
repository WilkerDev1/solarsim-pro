import { getTariffDisplayName } from '../proposalPresentation';
import { resolveGridConnection } from '../gridConnection';
import { hasSavingsComparison, resolveGeneratorCostPerKWh, resolveSavingsBasis, supplyPresentation } from '../offGridSupply';
import { FACTORY_TEXTS } from './factoryTexts';
import type { DocumentTextContext } from './context';
import { tariffChargeKind } from '../tariffRules';
import { chargeRoundsToZero, factoryGridUseCharge, isValidGridUseCharge, resolveNetMeteringRegime } from '../netMetering';
import { resolveDynamicProjectSummaryParagraph1, resolveDynamicProjectSummaryParagraph2 } from './projectSummary';

const kwh = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Nota regulatoria según tarifa, distribuidora, inyección cero, retención y baterías. Orden de decisión: sistema
 * aislado (textos por alternativa de suministro, sin medición neta) → inyección cero → régimen SIE-007-2026 (cargo por
 * kWh o «no aplica» en tarifas con potencia) → régimen anterior (retención) → edición `legacy` de enlaces antiguos.
 */
export function regulatoryNoteDefault(ctx: DocumentTextContext): string {
  const connection = resolveGridConnection(ctx);
  if (connection === 'off_grid') return offGridRegulatoryNote(ctx);
  const zeroExport = connection === 'zero_export';
  // Los enlaces publicados antes (edición `legacy`) conservan exactamente su nota de inyección cero.
  if (zeroExport && ctx.regulatoryNoteEdition === 'legacy') return legacyZeroExportRegulatoryNote(ctx);
  const distributor = ctx.distributor || 'EDES';
  const isCEPM = distributor === 'CEPM';
  const tariff = ctx.tariffCode || (isCEPM ? 'RBT-1' : 'BTS2');
  const tariffDisplayName = getTariffDisplayName(distributor, tariff);
  const exportFee = ctx.gridExportFeePct;

  const p1 = zeroExport
    ? 'El sistema fotovoltaico está diseñado para el autoconsumo y una mayor independencia de la red eléctrica: opera en modalidad de Inyección Cero, con limitador antivertido, de modo que la energía solar abastece directamente los consumos del inmueble y reduce la energía que se compra a la distribuidora, sin enviar energía a la red de distribución.'
    : `La energía generada mensualmente se descontará del consumo tomado de la red de ${isCEPM ? 'CEPM' : 'la distribuidora eléctrica (EDES)'}. Cuando la producción supere el consumo, el excedente se acreditará como descuento en su factura eléctrica bajo el régimen de Medición Neta.`;
  const p2 = zeroExport
    ? 'La presente propuesta se basa en criterios técnicos y en el historial de consumo del cliente. El sistema opera en paralelo con la red de la distribuidora, que sigue abasteciendo los consumos que la producción solar no cubre.'
    : 'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.';
  const p3 = 'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.';
  const p4 = zeroExport
    ? `Al operar con limitador antivertido${ctx.hasBattery ? ' y almacenamiento en baterías de litio' : ''}, la producción solar se ajusta a la demanda del inmueble${ctx.hasBattery ? ' y la energía que no se consume al momento se guarda para usarla más tarde' : ''}: toda la energía aprovechada se destina al autoconsumo, el ahorro proviene únicamente de la energía que se deja de comprar a la distribuidora y el proyecto no paga cargos por la energía que se envía a la red, porque no envía ninguna.`
    : gridUseChargeParagraph(ctx, distributor, tariff, tariffDisplayName, exportFee);
  return [p1, p2, p3, p4].join('\n\n');
}

/** Nota de inyección cero tal como la mostraban los enlaces publicados antes de orientarla al autoconsumo. */
function legacyZeroExportRegulatoryNote(ctx: DocumentTextContext): string {
  return [
    'El sistema fotovoltaico operará bajo la modalidad de Inyección Cero (Zero-Export con limitador antivertido), suministrando energía prioritariamente a los consumos internos del inmueble y evitando cualquier inyección de excedentes hacia la red eléctrica de distribución.',
    'La presente propuesta ha sido elaborada conforme a la Resolución SIE-007-2026-REG y se basa en criterios técnicos y el historial de consumo del cliente.',
    'Los ahorros indicados son estimados y pueden variar según los hábitos de consumo, el perfil de carga y las condiciones reales de operación del sistema.',
    `Al operar con limitador antivertido (inyección cero)${ctx.hasBattery ? ' y almacenamiento en baterías de litio' : ''}, la totalidad de la energía solar se aprovecha internamente, por lo que el proyecto no genera cargos por derecho de uso de la red bajo la normativa vigente.`,
  ].join('\n\n');
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

/**
 * Texto que cambia según el tipo de conexión (`resolveGridConnection`). Todas las variantes son de fábrica: una
 * propuesta que guardó cualquiera de ellas sigue al modo actual en vez de quedar congelada; lo editado se respeta.
 * Sin variante propia, aislado usa la de inyección cero y esta la de red.
 */
export function connectionAwareText(variants: { grid: string; zeroExport?: string; offGrid?: string }) {
  const pick = (ctx: DocumentTextContext): string => {
    const connection = resolveGridConnection(ctx);
    if (connection === 'off_grid') return variants.offGrid ?? variants.zeroExport ?? variants.grid;
    if (connection === 'zero_export') return variants.zeroExport ?? variants.grid;
    return variants.grid;
  };
  return {
    defaultText: pick,
    knownFactoryValues: [...new Set([variants.grid, variants.zeroExport, variants.offGrid].filter((value): value is string => !!value))] as readonly string[],
  };
}

/**
 * Servicios gestionados. Aislado: sin medición neta ni interconexión. Inyección cero: sin medición neta (no hay
 * intercambio con la red); se configura el limitador antivertido. Cada servicio sin comas internas: se parten en viñetas.
 */
export const SERVICES_INCLUDED_OFF_GRID = 'Permisos y Tramitación ante CNE, Planos Eléctricos, Instalación Certificada y Puesta en Marcha.';
export const SERVICES_INCLUDED_ZERO_EXPORT = 'Permisos y Tramitación ante CNE y Distribuidora, Planos Eléctricos, Configuración del Limitador Antivertido (Inyección Cero), Instalación Certificada y Puesta en Marcha.';
export const servicesIncludedText = connectionAwareText({ grid: FACTORY_TEXTS.servicesIncludedText, zeroExport: SERVICES_INCLUDED_ZERO_EXPORT, offGrid: SERVICES_INCLUDED_OFF_GRID });
export function servicesIncludedDefault(ctx: DocumentTextContext): string {
  return servicesIncludedText.defaultText(ctx);
}

/** Nota al pie del cuadro resumen: régimen de conexión. */
export const EXECUTIVE_FOOTNOTE_RIGHT_GRID = 'Régimen de Medición Neta • Certificación CNE / SIE';
export const EXECUTIVE_FOOTNOTE_RIGHT_ZERO_EXPORT = 'Autoconsumo con inyección cero • Sin exportación a la red';
export const EXECUTIVE_FOOTNOTE_RIGHT_OFF_GRID = 'Sistema aislado (modo isla) • Sin conexión a la red';
export const executiveFootnoteRightText = connectionAwareText({ grid: EXECUTIVE_FOOTNOTE_RIGHT_GRID, zeroExport: EXECUTIVE_FOOTNOTE_RIGHT_ZERO_EXPORT, offGrid: EXECUTIVE_FOOTNOTE_RIGHT_OFF_GRID });
export function executiveFootnoteRightDefault(ctx: DocumentTextContext): string {
  return executiveFootnoteRightText.defaultText(ctx);
}

/**
 * Párrafo del cargo por uso de la red. El Reglamento SIE-007-2026-REG solo lo cobra a las tarifas de un solo
 * precio por kWh (BTS-1, BTS-2, RBT-1); en las que tienen cargo de potencia (BTD, BTH, MTD, MTH, RBT-2) se
 * dice que no aplica y se declara el criterio que usa hoy el cálculo (la retención no cambia hasta la fase 3).
 * Tarifas sin clasificar y la edición `legacy` (enlaces ya publicados) conservan el texto anterior.
 */
function gridUseChargeParagraph(ctx: DocumentTextContext, distributor: string, tariff: string, tariffDisplayName: string, exportFee: number): string {
  const batteryHint = ctx.hasBattery ? '' : ' Cuando resulte conveniente, se recomendará la incorporación de baterías de litio para incrementar el aprovechamiento directo de la energía generada.';
  if (resolveNetMeteringRegime(ctx.netMeteringRegime) === 'sie007_2026') return sie007GridUseChargeParagraph(ctx, distributor, tariff, tariffDisplayName, batteryHint);
  if (ctx.regulatoryNoteEdition !== 'legacy' && tariffChargeKind(distributor, tariff) === 'demand') {
    const criterion = exportFee > 0 ? ` Como criterio conservador, el análisis económico descuenta un ${exportFee}% de la energía excedente exportada.` : '';
    return `Para la tarifa ${tariffDisplayName}, que incluye cargo por potencia, no aplica el cargo por derecho de uso de la red: el Reglamento de Generación Distribuida (Resolución SIE-007-2026-REG) lo reserva a las tarifas de un solo precio por kWh.${criterion} El sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${batteryHint}`;
  }
  return `Para la tarifa ${tariffDisplayName}, el análisis económico considera el cargo por derecho de uso de la red, equivalente al ${exportFee}% del valor de la energía excedente exportada, conforme al régimen de Medición Neta y la normativa vigente (Resolución SIE-007-2026-REG). Por esta razón, el sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${batteryHint}`;
}

/**
 * Párrafo del cargo por uso de la red en el régimen SIE-007-2026: medición neta sin retención y cargo de RD$/kWh
 * inyectado solo en las tarifas de un solo precio (art. 19.1.e). Se declara como estimado mientras no se haya
 * contrastado con facturas. Función aparte para no mezclarla con el texto del régimen anterior.
 */
function sie007GridUseChargeParagraph(ctx: DocumentTextContext, distributor: string, tariff: string, tariffDisplayName: string, batteryHint: string): string {
  if (tariffChargeKind(distributor, tariff) === 'demand') {
    return `Para la tarifa ${tariffDisplayName}, que incluye cargo por potencia, no aplica el cargo por derecho de uso de la red: el Reglamento de Generación Distribuida (Resolución SIE-007-2026-REG) lo reserva a las tarifas de un solo precio por kWh. El sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${batteryHint}`;
  }
  const factory = factoryGridUseCharge(distributor);
  const charge = isValidGridUseCharge(ctx.gridUseChargeDOPPerKWh) ? ctx.gridUseChargeDOPPerKWh : factory.dopPerKWh;
  if (chargeRoundsToZero(charge)) {
    return `Para la tarifa ${tariffDisplayName}, el análisis económico no considera cargo por derecho de uso de la red sobre la energía inyectada, aunque el Reglamento de Generación Distribuida (Resolución SIE-007-2026-REG, art. 19.1.e) lo prevé para las tarifas de un solo precio. El sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${batteryHint}`;
  }
  const source = charge === factory.dopPerKWh ? ` (Resolución ${factory.resolutionCode}, ${factory.period})` : '';
  return `Para la tarifa ${tariffDisplayName}, el análisis económico considera el cargo por derecho de uso de la red que el Reglamento de Generación Distribuida (Resolución SIE-007-2026-REG, art. 19.1.e) aplica a las tarifas de un solo precio: RD$${charge.toFixed(2)} por kWh inyectado a la red${source}. Es un valor estimado, no verificado con facturas de la distribuidora, que la SIE revisa periódicamente. Por esta razón, el sistema se diseña para maximizar el autoconsumo y optimizar la inyección de energía, obteniendo así el mayor retorno de inversión posible.${batteryHint}`;
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
