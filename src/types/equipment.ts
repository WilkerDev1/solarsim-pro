export type EquipmentType = 'panel' | 'inverter' | 'battery';

export interface SolarEquipmentItem {
  id: string;
  type: EquipmentType;
  brand: string;
  modelSeries: string;
  displayName: string;           // Ejem: "Módulos JAM72S30-550/MR (550W)" o "Inversor SOLIS S6-GR1P5K 5K (5.0Kw)"
  powerW?: number;               // Para paneles en Watts (ej: 550)
  powerKW?: number;              // Para inversores en Kilowatts (ej: 5.0)
  efficiencyPct?: number;        // Eficiencia del módulo % (ej: 21.3)
  tempCoeff?: number;            // Coeficiente de temperatura Pmax %/°C (ej: -0.35)
  category?: string;             // 'Monocristalino N-Type', 'Híbrido', 'String', 'Microinversor', etc.
  voltageMPPT?: string;          // Rango de voltaje MPPT (ej: "120-550V")
  voc?: number;                  // Voltaje de circuito abierto (V)
  isc?: number;                  // Corriente de cortocircuito (A)
  vmp?: number;                  // Voltaje de máxima potencia (V)
  imp?: number;                  // Corriente de máxima potencia (A)
  maxAcPowerKW?: number;         // Potencia máxima AC del inversor (kW)
  mpptCount?: number;            // Cantidad de seguidores MPPT
  dimensions?: string;           // ej: "2278 x 1134 x 30 mm"
  weightKg?: number;             // ej: 27.5
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
  modelCode: string;             // ej: "JAM72S30-550/MR" o "S6-GR1P5K"
  displayName: string;           // ej: "Módulos JAM72S30-550/MR (550W)"
  powerW?: number;               // Para paneles (ej: 550)
  powerKW?: number;              // Para inversores (ej: 5.0)
  efficiencyPct?: number;        // ej: 21.3
  tempCoeff?: number;            // ej: -0.35
  voc?: number;
  isc?: number;
  vmp?: number;
  imp?: number;
  maxAcPowerKW?: number;
  voltageMPPT?: string;
  mpptCount?: number;
  selected?: boolean;            // Checkbox en el modal de importación
}
