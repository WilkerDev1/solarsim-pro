export type EquipmentType = 'panel' | 'inverter' | 'battery';

export interface SolarEquipmentItem {
  id: string;
  type: EquipmentType;
  brand: string;
  modelSeries: string;
  displayName: string;           // Ejem: "Módulos JAM72S30-550/MR (550W)", "Inversor SOLIS S6-GR1P5K 5K (5.0Kw)" o "Batería HinaESS PowerGem Max (16.08kWh)"
  
  // Parámetros de Paneles
  powerW?: number;               // Para paneles en Watts (ej: 550)
  efficiencyPct?: number;        // Eficiencia del módulo % (ej: 22.8)
  tempCoeff?: number;            // Coeficiente de temperatura Pmax %/°C (ej: -0.29)
  annualDegradation?: number;    // % degradación anual posterior al año 1 (ej: 0.4)
  cellType?: string;             // 'TOPCon N-Type', 'PERC', 'Heterounión HJT', etc.
  bifacialityPct?: number;       // Bifacialidad % (ej: 80)
  voc?: number;                  // Voltaje de circuito abierto (V)
  isc?: number;                  // Corriente de cortocircuito (A)
  vmp?: number;                  // Voltaje de máxima potencia (V)
  imp?: number;                  // Corriente de máxima potencia (A)

  // Parámetros de Inversores
  powerKW?: number;              // Para inversores en Kilowatts (ej: 8.0)
  maxAcPowerKW?: number;         // Potencia máxima de salida AC (kW)
  maxPvPowerKW?: number;         // Potencia máxima del arreglo fotovoltaico DC (kW)
  maxEfficiencyPct?: number;     // Eficiencia máxima % (ej: 97.5)
  mpptEfficiencyPct?: number;    // Eficiencia MPPT % (ej: 99.9)
  voltageMPPT?: string;          // Rango de voltaje MPPT (ej: "120-500V")
  mpptCount?: number;            // Cantidad de seguidores MPPT (ej: 2)
  batteryVoltageRange?: string;  // Compatibilidad de batería (ej: "40-60V (48V)")

  // Parámetros de Baterías / Almacenamiento
  capacityKWh?: number;          // Capacidad nominal total en kWh (ej: 16.08)
  capacityAh?: number;           // Capacidad en Amperios-hora (ej: 314)
  voltageV?: number;             // Voltaje nominal de batería en V (ej: 51.2)
  chargeVoltageV?: number;       // Voltaje de carga V (ej: 56.5)
  dodPct?: number;               // Profundidad de descarga / DoD % (ej: 90)
  batteryEfficiencyPct?: number; // Eficiencia de carga/descarga % (ej: 95)
  cycles?: number;               // Ciclos de vida útil garantizados (ej: 8000)
  chemistry?: string;            // 'LFP (LiFePO4)', 'NMC', etc.
  maxChargeCurrentA?: number;    // Corriente máxima de carga continua (A) (ej: 165)
  maxDischargeCurrentA?: number; // Corriente máxima de descarga continua (A) (ej: 165)

  // Parámetros Generales
  category?: string;             // 'Bifacial TOPCon', 'Híbrido Split Phase', 'Batería LFP', etc.
  dimensions?: string;           // ej: "2382 x 1134 x 30 mm" o "900 x 445 x 230 mm"
  weightKg?: number;             // ej: 33.6 o 120
  datasheetUrl?: string;
  isCustom?: boolean;            // Creado por el usuario / escaneado con IA
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedDatasheetData {
  equipmentType: EquipmentType;
  brand: string;
  modelSeries: string;
  documentTitle?: string;
  category?: string;
  specsSummary?: string;
  variants: ExtractedEquipmentVariant[];
}

export interface ExtractedEquipmentVariant {
  id: string;
  modelCode: string;             // ej: "CS6.1-72TB-600", "LXP-LB-US 8k" o "PowerGem Max"
  displayName: string;           // ej: "Módulos Canadian Solar TOPBiHiKu6 (600W)" o "Batería HinaESS PowerGem Max (16.08kWh)"
  
  // Paneles
  powerW?: number;
  efficiencyPct?: number;
  tempCoeff?: number;
  annualDegradation?: number;
  voc?: number;
  isc?: number;
  vmp?: number;
  imp?: number;

  // Inversores
  powerKW?: number;
  maxAcPowerKW?: number;
  maxPvPowerKW?: number;
  maxEfficiencyPct?: number;
  voltageMPPT?: string;
  mpptCount?: number;

  // Baterías
  capacityKWh?: number;
  capacityAh?: number;
  voltageV?: number;
  dodPct?: number;
  batteryEfficiencyPct?: number;
  cycles?: number;
  chemistry?: string;
  maxChargeCurrentA?: number;

  // Dimensiones & Peso
  dimensions?: string;
  weightKg?: number;

  selected?: boolean;            // Checkbox en el modal de importación
}
