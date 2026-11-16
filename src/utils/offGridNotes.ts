/** Aviso de un sistema aislado (modo isla): el déficit es energía no servida, nunca importación de red. */
export function offGridUnservedNote(annualUnservedKWh: number, annualConsumptionKWh: number): string {
  if (annualUnservedKWh <= 0) {
    return 'Sistema aislado (modo isla): sin red de respaldo. La producción solar y las baterías cubren el consumo estimado; el excedente se recorta.';
  }
  const kwh = Math.round(annualUnservedKWh).toLocaleString('en-US');
  const share = annualConsumptionKWh > 0 ? Math.round((annualUnservedKWh / annualConsumptionKWh) * 1000) / 10 : 0;
  return `Sistema aislado (modo isla): ${kwh} kWh/año (${share}% del consumo) no los cubren el sol ni las baterías. Sin red de respaldo, esa energía queda sin servir o la cubre un respaldo externo (p. ej., una planta). Para reducirla, amplíe paneles o baterías.`;
}
