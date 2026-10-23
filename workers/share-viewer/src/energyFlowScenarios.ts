// Pure model behind the proposal's energy-flow diagram. Every number is an approximate visual guide
// derived from the proposal's headline figures (never a simulation result), so it works for old links too.

// The proposal does not record whether the inverter can form an island, so backup is stated as a condition.
const BACKUP_NOTE = 'El respaldo durante un apagón requiere un inversor híbrido con salida de respaldo (backup) y cubre las cargas conectadas a esa salida.';

export type EnergyFlowMode = 'day' | 'batteryFull' | 'night' | 'outage' | 'outageDay' | 'outageNight';
export type FlowColor = 'o' | 'g' | 'b'; // solar (orange), battery (green), grid (blue)
export type FlowSpeed = 's1' | 's2' | 's3';
export type PillTone = 'green' | 'indigo' | 'amber';
export type BatteryState = 'charging' | 'discharging' | 'idle' | 'full';
export type GridState = 'export' | 'import' | 'idle' | 'disconnected';

export interface EnergyFlowScenarioInput {
  hybrid: boolean;
  isZeroExport: boolean;
  systemCapacityKWp: number;
  annualConsumptionKWh: number;
  totalBESSKWh: number;
  /** Total AC rating of the installed inverters; unknown or 0 means no cap. */
  inverterPowerKW?: number;
}

export interface FlowLine {
  active: boolean;
  color: FlowColor;
  speed: FlowSpeed;
  /** Minor contribution next to a dominant flow (e.g. the grid completing a battery-fed house). */
  thin: boolean;
  /** Grid line: true when energy travels from the grid towards the house. Battery line: true when discharging. */
  reverse: boolean;
}

export interface ModeScenario {
  mode: EnergyFlowMode;
  label: string;
  title: string;
  description: string;
  note?: string;
  pill: { text: string; tone: PillTone };
  night: boolean;
  inverterState: 'on' | 'standby' | 'off';
  gridState: GridState;
  batteryState?: BatteryState;
  /** kW values rounded to one decimal. `houseKW` is what the house actually receives. */
  productionKW: number;
  houseKW: number;
  gridKW: number;
  batteryKW: number;
  lines: { sun: FlowLine; inverter: FlowLine; house: FlowLine; grid: FlowLine; battery?: FlowLine };
}

const MIDDAY_FACTOR = 0.75; // share of the nominal kWp delivered around noon
const MIN_LOAD_KW = 0.3;
const round1 = (v: number) => Math.round(v * 10) / 10;
const safe = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

interface Flows { production: number; solarHouse: number; solarBattery: number; exported: number; batteryHouse: number; gridHouse: number }

function loads(input: EnergyFlowScenarioInput, productionKW: number): { day: number; night: number } {
  const consumption = safe(input.annualConsumptionKWh);
  if (consumption <= 0) return { day: Math.max(MIN_LOAD_KW, productionKW * 0.4), night: 0.5 };
  const average = consumption / 8760;
  return { day: Math.max(MIN_LOAD_KW, average * 1.2), night: Math.max(MIN_LOAD_KW, average * 0.8) };
}

// Hybrid diagrams never draw energy from the grid: the battery covers the house at night and on shortfalls.
interface SolveOptions { zeroExport: boolean; gridConnected: boolean; gridImport: boolean }

// `inverter` caps the AC output (house + export); DC-coupled battery charging is not limited by it.
function solveDay(load: number, potential: number, batteryLimit: number, inverter: number, o: SolveOptions): Flows {
  const solarHouse = Math.min(potential, load, inverter);
  const surplus = potential - solarHouse;
  const canExport = o.gridConnected && !o.zeroExport;
  const solarBattery = Math.min(surplus, batteryLimit);
  // Zero export (and any island) trims production instead of sending the rest anywhere.
  const exported = canExport ? Math.min(surplus - solarBattery, inverter - solarHouse) : 0;
  const deficit = load - solarHouse;
  const batteryHouse = Math.max(0, Math.min(batteryLimit, deficit, inverter - solarHouse - exported));
  const gridHouse = o.gridConnected && o.gridImport ? deficit - batteryHouse : 0;
  return { production: solarHouse + solarBattery + exported, solarHouse, solarBattery, exported, batteryHouse, gridHouse };
}

function solveNight(load: number, batteryLimit: number, gridImport: boolean, inverter: number): Flows {
  const batteryHouse = Math.min(batteryLimit, load, inverter);
  return { production: 0, solarHouse: 0, solarBattery: 0, exported: 0, batteryHouse, gridHouse: gridImport ? load - batteryHouse : 0 };
}

const OFF: Omit<FlowLine, 'color'> = { active: false, speed: 's3', thin: false, reverse: false };

const join = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** Spanish copy built from the modeled flows, so the text never claims a flow the diagram does not draw. */
function describeFlows(prefix: string, f: Flows, trimmedForZeroExport: boolean): string {
  const helpers = [f.batteryHouse > 0 ? 'la batería' : '', f.gridHouse > 0 ? 'la red' : ''].filter(Boolean);
  const verb = (plural: string, singular: string) => (helpers.length > 1 ? plural : singular);
  let text = f.solarHouse > 0
    ? `sus paneles alimentan la casa${helpers.length ? `; ${join(helpers)} ${verb('completan', 'completa')} la diferencia` : ''}`
    : helpers.length ? `${join(helpers)} ${verb('alimentan', 'alimenta')} la casa` : 'la casa se queda sin energía';
  if (f.solarBattery > 0) text += f.exported > 0 ? ', el excedente carga la batería y una parte se inyecta a la red' : ' y el excedente carga la batería';
  else if (f.exported > 0) text += ' y el excedente se inyecta a la red';
  if (trimmedForZeroExport) text += '; con inyección cero el sistema ajusta su producción y no inyecta a la red';
  return `${prefix}${text}.`;
}

function buildLines(f: Flows, hybrid: boolean, gridConnected: boolean): ModeScenario['lines'] {
  const houseServed = f.solarHouse + f.batteryHouse + f.gridHouse;
  const values = {
    sun: f.solarHouse + f.solarBattery + f.exported,
    inverter: f.solarHouse + f.exported + f.batteryHouse,
    battery: f.solarBattery + f.batteryHouse,
    house: houseServed,
    grid: f.exported + f.gridHouse,
  };
  const max = Math.max(...Object.values(values), 0.0001);
  const line = (value: number, color: FlowColor, reverse = false): FlowLine => {
    const v = round1(value);
    if (v <= 0) return { ...OFF, color };
    const ratio = v / max;
    const speed: FlowSpeed = ratio >= 0.6 ? 's1' : ratio >= 0.3 ? 's2' : 's3';
    return { active: true, color, speed, thin: speed === 's3', reverse };
  };
  const houseColor: FlowColor = f.solarHouse > 0 ? 'o' : f.batteryHouse > 0 ? 'g' : 'b';
  const lines: ModeScenario['lines'] = {
    sun: line(values.sun, 'o'),
    inverter: line(values.inverter, f.solarHouse + f.exported > 0 ? 'o' : 'g'),
    house: line(values.house, houseColor),
    grid: gridConnected ? line(values.grid, f.exported > 0 ? 'o' : 'b', f.exported <= 0) : { ...OFF, color: 'b' },
  };
  // The house line is always the main flow: a lone grid feed is not "thin".
  if (lines.house.active && houseColor === 'b') lines.house.thin = false;
  if (lines.grid.active && f.exported <= 0 && houseColor === 'b') lines.grid.thin = false;
  if (hybrid) lines.battery = line(values.battery, 'g', f.batteryHouse > 0);
  return lines;
}

export function energyFlowScenarios(input: EnergyFlowScenarioInput): ModeScenario[] {
  const { hybrid, isZeroExport } = input;
  const potential = safe(input.systemCapacityKWp) * MIDDAY_FACTOR;
  const batteryLimit = hybrid ? Math.max(1, safe(input.totalBESSKWh) * 0.5) : 0;
  const load = loads(input, potential);
  const inverter = safe(input.inverterPowerKW ?? 0) || Infinity;

  const make = (mode: EnergyFlowMode, f: Flows, o: {
    label: string; title: string; description: string; note?: string; pill: ModeScenario['pill'];
    night: boolean; gridConnected: boolean; inverterState: ModeScenario['inverterState']; batteryFull?: boolean;
  }): ModeScenario => {
    const house = f.solarHouse + f.batteryHouse + f.gridHouse;
    const batteryState: BatteryState | undefined = !hybrid ? undefined : o.batteryFull ? 'full'
      : f.batteryHouse > 0 ? 'discharging' : f.solarBattery > 0 ? 'charging' : 'idle';
    const gridState: GridState = !o.gridConnected ? 'disconnected'
      : f.exported > 0 ? 'export' : f.gridHouse > 0 ? 'import' : 'idle';
    return {
      mode, label: o.label, title: o.title, description: o.description, note: o.note, pill: o.pill,
      night: o.night, inverterState: o.inverterState, gridState, batteryState,
      productionKW: round1(f.production), houseKW: round1(house), gridKW: round1(f.exported + f.gridHouse),
      batteryKW: round1(f.solarBattery + f.batteryHouse),
      lines: buildLines(f, hybrid, o.gridConnected),
    };
  };

  const day = solveDay(load.day, potential, batteryLimit, inverter, { zeroExport: isZeroExport, gridConnected: true, gridImport: !hybrid });
  const night = solveNight(load.night, batteryLimit, !hybrid, inverter);
  const dayPill = (f: Flows): ModeScenario['pill'] => ({
    text: f.solarBattery > 0 ? 'Cargando batería' : f.batteryHouse > 0 ? 'Batería apoyando' : isZeroExport ? 'Inyección cero' : 'En operación',
    tone: 'green',
  });

  if (!hybrid) {
    return [
      make('day', day, {
        label: 'De día', title: 'De día', night: false, gridConnected: true, inverterState: 'on',
        description: describeFlows('De día, ', day, isZeroExport && potential - day.production > 0.05),
        pill: { text: isZeroExport ? 'Inyección cero' : 'En operación', tone: 'green' },
      }),
      make('night', night, {
        label: 'De noche', title: 'De noche', night: true, gridConnected: true, inverterState: 'standby',
        description: 'De noche no hay producción solar: la casa consume energía de la red eléctrica, igual que antes de instalar el sistema.',
        pill: { text: 'Sin producción solar', tone: 'indigo' },
      }),
      make('outage', solveNight(0, 0, false, inverter), {
        label: 'Apagón', title: 'Apagón', night: false, gridConnected: false, inverterState: 'off',
        description: 'Cuando falla la red, el inversor se apaga por seguridad y la casa se queda sin energía hasta que regrese el servicio.',
        note: 'Por normativa, un sistema de inyección sin baterías se desconecta cuando falla la red. Un sistema híbrido con baterías y salida de respaldo sí puede mantener la casa con energía.',
        pill: { text: 'Inversor apagado por seguridad', tone: 'amber' },
      }),
    ];
  }

  // A full battery takes no charge: the surplus covers the house and goes to the grid (unless zero export).
  const full = solveDay(load.day, potential, 0, inverter, { zeroExport: isZeroExport, gridConnected: true, gridImport: false });
  const island = solveDay(load.day, potential, batteryLimit, inverter, { zeroExport: true, gridConnected: false, gridImport: false });
  const islandNight = solveNight(load.night, batteryLimit, false, inverter);
  const capped = (f: Flows, wanted: number) => (wanted - (f.solarHouse + f.batteryHouse) > 0.05
    ? ' La potencia disponible es limitada, por lo que conviene priorizar los equipos esenciales.' : '');
  return [
    make('day', day, {
      label: 'De día', title: 'De día', night: false, gridConnected: true, inverterState: 'on',
      description: describeFlows('De día, ', day, isZeroExport && potential - day.production > 0.05),
      pill: dayPill(day),
    }),
    make('batteryFull', full, {
      label: 'Batería llena', title: 'Batería llena', night: false, gridConnected: true, inverterState: 'on', batteryFull: true,
      description: describeFlows('Cuando la batería está llena, ', full, isZeroExport && potential - full.production > 0.05),
      pill: { text: isZeroExport ? 'Inyección cero' : 'Batería llena', tone: 'green' },
    }),
    make('night', night, {
      label: 'De noche', title: 'De noche', night: true, gridConnected: true, inverterState: 'on',
      description: describeFlows('De noche, sin producción solar, ', night, false),
      pill: night.batteryHouse > 0 ? { text: 'Batería descargando', tone: 'indigo' } : { text: 'Sin producción solar', tone: 'indigo' },
    }),
    make('outageDay', island, {
      label: 'Apagón de día', title: 'Apagón de día', night: false, gridConnected: false, inverterState: 'on',
      note: BACKUP_NOTE,
      description: describeFlows('Sin red, el sistema pasa a modo isla: ', island, false) + capped(island, load.day),
      pill: { text: 'Modo isla', tone: 'amber' },
    }),
    make('outageNight', islandNight, {
      label: 'Apagón de noche', title: 'Apagón de noche', night: true, gridConnected: false, inverterState: 'on',
      note: BACKUP_NOTE,
      description: describeFlows('Sin red y sin sol, en modo isla ', islandNight, false) + capped(islandNight, load.night),
      pill: { text: 'Modo isla', tone: 'amber' },
    }),
  ];
}
