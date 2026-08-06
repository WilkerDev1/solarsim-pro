import { validateReferenceCase } from './referenceCase';

const result = validateReferenceCase();

console.log('=== BENCHMARK VALIDATION RESULT ===');
console.log('Pass status:', result.pass ? 'PASSED SUCCESSFUL ✅' : 'FAILED ❌');
console.log('--- Summary Metrics ---');
console.log('Capacidad DC:', result.summary.systemCapacityKWp, 'kWp');
console.log('Producción Anual:', result.summary.annualProductionKWh, 'kWh');
console.log('Cobertura Solar:', result.summary.energyCoveragePct, '%');
console.log('Inversión Neta (Ley 57-07):', '$' + result.summary.netInvestmentUSD);
console.log('Payback:', result.summary.paybackYears, 'años');
console.log('TIR (IRR):', result.summary.irrPct, '%');
console.log('VAN (NPV):', '$' + result.summary.npvUSD);
console.log('ROI 25 Años:', result.summary.roi25YrPct, '%');
console.log('CO2 Evitado:', result.summary.co2AvoidedTonsPerYear, 'tons/año');

if (result.diffs.length > 0) {
  console.log('--- Differences Detected ---');
  result.diffs.forEach(d => console.log(' -', d));
}
