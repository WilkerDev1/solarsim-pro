// Fields that change what the customer pays or how the price is computed. Shared by the planner and the agent guard.
import type { AssistantAction } from './types';

export const PRICING_FIELDS: Record<string, readonly string[]> = {
  specs: ['saleMarginMultiplier', 'installationUnitPriceUSD', 'panelUnitPriceUSD', 'inverterUnitPriceUSD', 'batteryUnitPriceUSD', 'batteryCostUSD',
    'autoSupplierPricing', 'panels', 'inverters', 'batteries',
    // Calculation mode and price basis: switching them changes the contract price.
    'pricingMode', 'isDetailed', 'directPriceSurplusTarget', 'pricePerWattUSD', 'dopExchangeRate',
    // Scalar sizing of legacy proposals: capacity drives the price (per watt, per unit, battery cost).
    'panelPowerW', 'panelCount', 'inverterPowerKW', 'inverterCount', 'hasBattery', 'batteryCapacityKWh', 'batteryCount', 'autoCalculatePanels'],
  rates: ['usdExchangeRate'],
  financials: ['customItems', 'customDiscounts', 'applyITBISExemption', 'applyLey5707'],
};
export const touchesPricingEdits = (edits: readonly { section: string; field: string }[]): boolean =>
  edits.some((e) => PRICING_FIELDS[e.section]?.includes(e.field));
export const touchesPricing = (action: AssistantAction): boolean => action.kind === 'project' && touchesPricingEdits(action.edits);
