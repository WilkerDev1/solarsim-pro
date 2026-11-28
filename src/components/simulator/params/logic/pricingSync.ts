/** Precio por Wp ↔ por kWp y margen % ↔ factor: las reglas viven en el dominio desde F2b (`src/domain/rules/pricingRules.ts`). */
export {
  kwpPricePatch, marginPctFromMultiplier, multiplierFromMarginInput, multiplierFromQuickMargin, pricePerKWpFromWatt, pricePerWattFromKWp,
  roundedWattPrice, suggestedWattPrice, wattPricePatch, wholeMarginPctFromMultiplier,
} from '../../../../domain/rules/pricingRules';
