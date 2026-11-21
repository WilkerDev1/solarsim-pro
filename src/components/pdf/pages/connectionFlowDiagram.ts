import { PDF_FLOW_DIAGRAM_BASE64 } from '../../../assets/pdfGraphicAssets';
import type { GridConnectionMode } from '../../../../shared/gridConnection';

/**
 * Diagrama de la «Descripción Técnica» según el tipo de conexión. El de red muestra la medición bidireccional
 * (importación y exportación, medición neta). Inyección cero no envía energía a la red: el limitador antivertido
 * ajusta la producción al consumo, toda la energía aprovechada es autoconsumo y la red solo cubre el déficit.
 * Se genera como SVG (vectorial, mismo tamaño 1024×400 que la imagen de red) para que html2canvas lo pinte nítido.
 */
const RED = '#d32f2f';
const BLUE = '#1e63b5';
const INK = '#111827';
const MUTED = '#374151';

const label = (x: number, y: number, text: string, size = 15, weight = 800, color = INK, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${text}</text>`;
const lines = (x: number, y: number, rows: string[], size = 12.5, color = MUTED) =>
  rows.map((row, i) => label(x, y + i * (size + 3), row, size, 500, color)).join('');
const arrow = (x1: number, y1: number, x2: number, y2: number, color: string, id: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4" marker-end="url(#${id})"/>`;

function zeroExportSvg(hasBattery: boolean): string {
  const sunRays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return `<line x1="${70 + Math.cos(a) * 42}" y1="${95 + Math.sin(a) * 42}" x2="${70 + Math.cos(a) * 56}" y2="${95 + Math.sin(a) * 56}" stroke="#f5a623" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');
  const panelCells = Array.from({ length: 12 }, (_, i) =>
    `<rect x="${250 + (i % 4) * 22}" y="${68 + Math.floor(i / 4) * 22}" width="19" height="19" fill="#1f3c88"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="400" viewBox="0 0 1024 400">
<defs>
<marker id="r" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="13" refY="8" orient="auto"><path d="M0,1 L16,8 L0,15 z" fill="${RED}"/></marker>
<marker id="b" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="13" refY="8" orient="auto"><path d="M0,1 L16,8 L0,15 z" fill="${BLUE}"/></marker>
</defs>
<rect width="1024" height="400" fill="#ffffff"/>
<circle cx="70" cy="95" r="34" fill="#f8c537"/>${sunRays}
${label(185, 80, 'RADIACIÓN', 13)}${arrow(140, 95, 232, 95, BLUE, 'b')}${label(185, 122, 'CONVERSIÓN', 13)}
${label(294, 45, 'PANELES SOLARES (CC)')}<rect x="244" y="62" width="100" height="74" fill="#d8e3f5" stroke="#1f3c88" stroke-width="2"/>${panelCells}
${arrow(352, 95, 448, 95, BLUE, 'b')}${label(400, 86, 'CC', 14, 800, BLUE)}
${label(510, 45, 'INVERSOR (CA)')}<rect x="458" y="60" width="104" height="72" rx="8" fill="#ffffff" stroke="${INK}" stroke-width="3"/>
<line x1="462" y1="128" x2="558" y2="64" stroke="${INK}" stroke-width="2"/>${label(487, 92, 'DC', 16)}${label(533, 120, 'AC', 16)}
${lines(510, 152, ['Transforma CC a corriente alterna (CA)', 'y gestiona el flujo de energía.'])}
${label(510, 190, 'LIMITADOR ANTIVERTIDO ACTIVO', 12.5, 800)}
${arrow(570, 95, 680, 95, RED, 'r')}${label(625, 86, 'AC', 14, 800, RED)}
${label(760, 45, 'USO DOMÉSTICO')}
<path d="M700 100 L760 58 L820 100 L820 150 L700 150 Z" fill="#ffffff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<circle cx="745" cy="118" r="9" fill="none" stroke="${INK}" stroke-width="3"/><rect x="770" y="110" width="18" height="22" rx="3" fill="none" stroke="${INK}" stroke-width="3"/>
${lines(760, 172, ['Toda la energía solar aprovechada', 'se consume en el inmueble.'])}
${label(760, 208, 'AUTOCONSUMO', 14)}
${hasBattery ? `${label(195, 245, 'ALMACENAMIENTO (CA)')}
<rect x="160" y="262" width="70" height="78" rx="6" fill="#ffffff" stroke="${INK}" stroke-width="4"/>
<line x1="170" y1="288" x2="220" y2="288" stroke="${INK}" stroke-width="3"/><line x1="170" y1="312" x2="220" y2="312" stroke="${INK}" stroke-width="3"/>
${lines(98, 280, ['Guarda la energía', 'que no se consume', 'al momento.'], 12, MUTED)}
${label(195, 372, 'MAYOR INDEPENDENCIA', 13)}
<polyline points="510,198 510,300 240,300" fill="none" stroke="${RED}" stroke-width="4" marker-end="url(#r)"/>${label(375, 292, 'AC', 14, 800, RED)}` : ''}
${label(600, 245, 'MEDIDOR + LIMITADOR', 14)}${label(600, 262, 'ANTIVERTIDO', 14)}
<rect x="566" y="276" width="68" height="62" rx="12" fill="#ffffff" stroke="${INK}" stroke-width="4"/><rect x="580" y="292" width="40" height="16" fill="none" stroke="${INK}" stroke-width="2"/>
${lines(600, 360, ['Mide el consumo de la red y evita', 'enviar energía a la red.'], 12)}
<polyline points="760,214 760,290 636,290" fill="none" stroke="${MUTED}" stroke-width="3"/>
${arrow(858, 312, 642, 312, BLUE, 'b')}${label(750, 330, 'IMPORTACIÓN', 12, 800, BLUE)}${label(750, 346, 'solo cuando falta energía', 11.5, 600, MUTED)}
${label(925, 245, 'RED ELÉCTRICA (CA)', 14)}
<line x1="925" y1="262" x2="925" y2="360" stroke="${INK}" stroke-width="5"/><line x1="896" y1="276" x2="954" y2="276" stroke="${INK}" stroke-width="4"/><line x1="902" y1="294" x2="948" y2="294" stroke="${INK}" stroke-width="4"/>
${lines(925, 378, ['Respaldo: cubre lo que', 'la producción solar no alcanza.'], 11.5)}
</svg>`;
}

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
// Con baterías se dibuja el almacenamiento; sin ellas, la producción simplemente se limita a la demanda.
const ZERO_EXPORT_DIAGRAM = { withBattery: svgDataUrl(zeroExportSvg(true)), withoutBattery: svgDataUrl(zeroExportSvg(false)) };

export interface FlowDiagram {
  src: string;
  alt: string;
}

export function connectionFlowDiagram(connection: GridConnectionMode, options: { hasBattery?: boolean } = {}): FlowDiagram {
  return connection === 'zero_export'
    ? { src: options.hasBattery === false ? ZERO_EXPORT_DIAGRAM.withoutBattery : ZERO_EXPORT_DIAGRAM.withBattery, alt: 'Diagrama de flujo del sistema solar de autoconsumo con inyección cero' }
    : { src: PDF_FLOW_DIAGRAM_BASE64, alt: 'Diagrama de flujo del sistema solar fotovoltaico' };
}
