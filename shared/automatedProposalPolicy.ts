// Every automated proposal flow (AI proposal assistant, general assistant, MCP agents) quotes in
// "Simple (Catálogo IA)" mode: real catalog equipment priced from supplier offers through the cost matrix.
// Per-W pricing remains available only as a manual choice in the simulator.

export const AUTOMATED_PRICING = { isDetailed: false, pricingMode: 'cost_matrix' } as const;

export function enforceAutomatedPricing<T extends { isDetailed: boolean; pricingMode?: 'cost_matrix' | 'direct_watt' }>(specs: T): T {
  return { ...specs, ...AUTOMATED_PRICING };
}
