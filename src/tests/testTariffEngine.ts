import { DEFAULT_RD_TARIFF_MATRIX, getReferenceEnergyRateUSD } from '../data/rdTariffs';
import {
  getDistributorTariffOptions,
  getTariffDisplayName,
  mapTariffCodeOnDistributorChange,
} from '../types/tariffs';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

console.log('🧪 =========================================================');
console.log('🧪 SUITE: Validación de Tarifas SIE y Nomenclatura CEPM vs EDES');
console.log('🧪 =========================================================\n');

// 1. Opciones de tarifas por distribuidora
const cepmOptions = getDistributorTariffOptions('CEPM');
assert(cepmOptions.length >= 4, 'CEPM debe tener al menos 4 opciones de tarifas');
assert(cepmOptions.some((o) => o.value === 'RBT-1'), 'CEPM incluye RBT-1');
assert(cepmOptions.some((o) => o.value === 'RBT-2'), 'CEPM incluye RBT-2');
assert(cepmOptions.some((o) => o.value === 'ESTRBT-2'), 'CEPM incluye ESTRBT-2');
assert(cepmOptions.some((o) => o.value === 'RMT-1'), 'CEPM incluye RMT-1');
assert(!cepmOptions.some((o) => o.value === 'BTS1'), 'CEPM no debe listar BTS1 directamente');

const edeOptions = getDistributorTariffOptions('EDEESTE');
assert(edeOptions.some((o) => o.value === 'BTS1'), 'EDEESTE incluye BTS1');
assert(edeOptions.some((o) => o.value === 'BTS2'), 'EDEESTE incluye BTS2');
assert(edeOptions.some((o) => o.value === 'BTD'), 'EDEESTE incluye BTD');
assert(!edeOptions.some((o) => o.value === 'RBT-1'), 'EDEESTE no debe listar RBT-1');

// 2. Nombres legibles (Display Name)
assert(
  getTariffDisplayName('CEPM', 'RBT-1').includes('RBT-1'),
  'CEPM RBT-1 display name contiene RBT-1'
);
assert(
  getTariffDisplayName('CEPM', 'RBT-2').includes('RBT-2'),
  'CEPM RBT-2 display name contiene RBT-2'
);
assert(
  getTariffDisplayName('CEPM', 'BTS1').includes('RBT-1'),
  'CEPM BTS1 legacy se mapea visualmente a RBT-1'
);
assert(
  getTariffDisplayName('EDEESTE', 'BTS1').includes('BTS1'),
  'EDEESTE BTS1 display name contiene BTS1'
);

// 3. Mapeo inteligente al cambiar distribuidora
assert(
  mapTariffCodeOnDistributorChange('EDEESTE', 'CEPM', 'BTS1') === 'RBT-1',
  'Cambio EDEESTE (BTS1) a CEPM resulta en RBT-1'
);
assert(
  mapTariffCodeOnDistributorChange('EDEESTE', 'CEPM', 'BTD') === 'RBT-2',
  'Cambio EDEESTE (BTD) a CEPM resulta en RBT-2'
);
assert(
  mapTariffCodeOnDistributorChange('EDEESTE', 'CEPM', 'MTD1') === 'RMT-1',
  'Cambio EDEESTE (MTD1) a CEPM resulta en RMT-1'
);
assert(
  mapTariffCodeOnDistributorChange('CEPM', 'EDESUR', 'RBT-1') === 'BTS2',
  'Cambio CEPM (RBT-1) a EDESUR resulta en BTS2'
);
assert(
  mapTariffCodeOnDistributorChange('CEPM', 'EDENORTE', 'RBT-2') === 'BTD',
  'Cambio CEPM (RBT-2) a EDENORTE resulta en BTD'
);

// 4. Cálculo de costo de referencia en USD
const rateCepmRbt1 = getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'RBT-1', 900, 60.0);
console.log(`CEPM RBT-1 a 60 DOP/USD: $${rateCepmRbt1.toFixed(3)} USD/kWh`);
assert(Math.abs(rateCepmRbt1 - 0.382) < 0.005, 'RBT-1 debe equivaler a ~0.382 USD/kWh (22.90 DOP / 60)');

const rateCepmRbt2 = getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'RBT-2', 900, 60.0);
console.log(`CEPM RBT-2 a 60 DOP/USD: $${rateCepmRbt2.toFixed(3)} USD/kWh`);
assert(Math.abs(rateCepmRbt2 - 0.235) < 0.005, 'RBT-2 debe equivaler a ~0.235 USD/kWh (14.1278 DOP / 60)');

// 5. Retrocompatibilidad: CEPM con BTS1 en matriz
const rateLegacyCepm = getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'CEPM', 'BTS1', 900, 60.0);
assert(Math.abs(rateLegacyCepm - 0.382) < 0.005, 'CEPM con código legacy BTS1 debe resolver a tarifa de RBT-1');

// 6. EDEESTE bajo Resolución SIE-176-2025-TF
assert(
  DEFAULT_RD_TARIFF_MATRIX.resolutionCode === 'SIE-176-2025-TF',
  'Resolución oficial es SIE-176-2025-TF'
);
const rateEdeesteBts2 = getReferenceEnergyRateUSD(DEFAULT_RD_TARIFF_MATRIX, 'EDEESTE', 'BTS2', 900, 60.0);
console.log(`EDEESTE BTS2 a 60 DOP/USD: $${rateEdeesteBts2.toFixed(3)} USD/kWh`);
assert(rateEdeesteBts2 > 0.20 && rateEdeesteBts2 < 0.25, 'EDEESTE BTS2 está en rango esperado (~0.220 USD/kWh)');

console.log('\n🎉 ¡Todas las pruebas de tarifas SIE y CEPM pasaron con éxito!\n');
