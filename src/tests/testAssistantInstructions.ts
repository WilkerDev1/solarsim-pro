// F3c: instrucciones del asistente en tres capas (plan «Instrucciones en tres capas»), compuestas por un constructor puro.
//  · Capa 1: los invariantes compartidos con los agentes externos = AGENT_RULES_ES tal cual, byte a byte, y el mismo prefijo
//    que recibe el servicio remoto (REMOTE_INSTRUCTIONS).
//  · Capa 2: guía de herramientas GENERADA de las declaraciones y del registro de campos: determinista y en orden estable
//    (el prefijo cacheable no cambia entre turnos), con instantánea dorada.
//  · Capa 3: la conducta del asistente de la app: proactivo, no se rinde, crea con valores por defecto y lo dice, supuestos
//    solo de una lista cerrada, nunca inventa precios, español y breve.
// Los agentes externos reciben solo la capa 1 mientras el contrato esté congelado (docs/AGENT_CONTRACT_FREEZE.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AGENT_RULES_ES } from '../../shared/agentTools/rules';
import { REMOTE_INSTRUCTIONS } from '../../mcp-remote/src/protocol';
import { findAgentTool } from '../../shared/agentTools/definitions';
import { appAssistantToolDefinitions, APP_ASSISTANT_TOOLSET } from '../features/agentTools/appAssistant/definitions';
import {
  INSTRUCTION_LAYER_SEPARATOR, RULES_TOOL_ALIASES, appAssistantConductLayer, buildSystemInstruction, instructionLayers, sharedInvariantsLayer, toolGuideLayer,
} from '../features/agentTools/appAssistant/instructions';
import { ASSUMPTION_SOURCES, ASSUMPTION_SOURCE_LABELS } from '../features/agentTools/appAssistant/assumptions';
import { NEW_PROPOSAL_DEFAULTS } from '../domain/newProposal';
import { SIZING_ASSUMPTIONS } from '../domain/sizing';
import { PROJECT_FIELDS } from '../domain/projectFields';
import { DEFAULT_TARGET_MARGIN_PCT } from '../store/defaultSimulationSettings';
import { assertGolden } from './support/golden';

const goldenText = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ── 1. Capa 1: AGENT_RULES_ES sin tocar, la misma que reciben el MCP local y el remoto ─────────────────────────────────
assert.equal(sharedInvariantsLayer(), AGENT_RULES_ES, 'la capa 1 es AGENT_RULES_ES tal cual');
assert.equal(sharedInvariantsLayer(), goldenText('./golden/agent-rules-es.txt'), 'y coincide byte a byte con su copia dorada de F0');
assert.ok(REMOTE_INSTRUCTIONS.startsWith(`${sharedInvariantsLayer()} `), 'el remoto recibe la misma capa 1 como prefijo');
assert.ok(goldenText('../../mcp-remote/tests/golden/remote-instructions.txt').startsWith(`${sharedInvariantsLayer()} `), 'y su copia dorada también');
const app = buildSystemInstruction('app-assistant');
assert.ok(app.startsWith(`${AGENT_RULES_ES}${INSTRUCTION_LAYER_SEPARATOR}`), 'la instrucción de la app empieza por la capa 1 intacta');
assert.equal(Buffer.compare(Buffer.from(app.slice(0, AGENT_RULES_ES.length)), Buffer.from(AGENT_RULES_ES)), 0, 'byte a byte');

// Los agentes externos: solo la capa 1 (contrato congelado). Es exactamente lo que el MCP local anuncia hoy.
assert.equal(buildSystemInstruction('mcp'), AGENT_RULES_ES, 'superficie externa: solo los invariantes compartidos');
assert.equal(buildSystemInstruction('mcp', { tools: appAssistantToolDefinitions() }), AGENT_RULES_ES, 'ni con herramientas cambia');

// ── 2. Composición: tres capas, en orden, separadas siempre igual ───────────────────────────────────────────────────────
const layers = instructionLayers('app-assistant');
assert.deepEqual(layers.map((l) => l.id), ['shared-invariants', 'tool-guide', 'app-conduct']);
assert.equal(app, layers.map((l) => l.text).join(INSTRUCTION_LAYER_SEPARATOR));
assert.equal(layers[1].text, toolGuideLayer('app-assistant', appAssistantToolDefinitions()));
assert.equal(layers[2].text, appAssistantConductLayer());
for (const layer of layers) assert.ok(layer.text.trim().length > 0 && !layer.text.includes(INSTRUCTION_LAYER_SEPARATOR), `capa ${layer.id} sin separadores dentro`);

// ── 3. Pura y determinista: mismo resultado en cada llamada, sin reloj ni estado ─────────────────────────────────────────
assert.equal(buildSystemInstruction('app-assistant'), app);
assert.equal(buildSystemInstruction('app-assistant', { tools: appAssistantToolDefinitions() }), app, 'el conjunto por defecto es el de F3a');
assert.doesNotMatch(app, /\d{4}-\d{2}-\d{2}T|activeProjectId|"appContext":\{/, 'nada vivo (fecha, propuesta abierta) en las instrucciones: eso va al final del turno');

// ── 4. Capa 2 generada de las declaraciones: cada herramienta del conjunto una vez, en el orden del conjunto ─────────────
const guide = toolGuideLayer('app-assistant', appAssistantToolDefinitions());
const order = APP_ASSISTANT_TOOLSET.map((name) => guide.indexOf(`- ${name} `));
for (const [i, name] of APP_ASSISTANT_TOOLSET.entries()) {
  assert.ok(order[i] >= 0, `${name} aparece en la guía`);
  assert.equal(guide.split(`- ${name} `).length - 1, 1, `${name} aparece una sola vez`);
}
// Dentro de cada grupo (por tipo), el orden es el del conjunto declarado.
for (const kind of ['read', 'draft', 'guarded'] as const) {
  const names = APP_ASSISTANT_TOOLSET.filter((name) => appAssistantToolDefinitions().find((d) => d.name === name)!.kind === kind);
  const positions = names.map((name) => guide.indexOf(`- ${name} `));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, `grupo ${kind} en el orden del conjunto`);
}
// Lo que cambia el conjunto cambia la guía (y solo eso): quitar una herramienta la quita.
const withoutStatus = appAssistantToolDefinitions().filter((d) => d.name !== 'set_proposal_status');
const smaller = toolGuideLayer('app-assistant', withoutStatus);
assert.doesNotMatch(smaller, /- set_proposal_status /);
assert.equal(toolGuideLayer('app-assistant', withoutStatus), smaller, 'determinista también con otro conjunto');
// Una herramienta que no está declarada no aparece aunque la nombren las reglas: se traduce a la que sí está.
assert.doesNotMatch(guide, /- propose_project_update /);
for (const [ruleName, replacement] of Object.entries(RULES_TOOL_ALIASES)) {
  assert.ok(AGENT_RULES_ES.includes(ruleName), `${ruleName} lo nombra la capa 1`);
  assert.ok(findAgentTool(ruleName), `${ruleName} existe como herramienta compartida`);
  assert.ok(guide.includes(`${ruleName} → ${replacement}`), `la guía dice que en la app ${ruleName} es ${replacement}`);
}
// Toda herramienta que nombra la capa 1 está en el conjunto o tiene su equivalente declarado.
const named = [...new Set(AGENT_RULES_ES.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].filter((name) => findAgentTool(name));
assert.ok(named.length >= 3);
for (const name of named)
  assert.ok((APP_ASSISTANT_TOOLSET as readonly string[]).includes(name) || (RULES_TOOL_ALIASES[name] && (APP_ASSISTANT_TOOLSET as readonly string[]).includes(RULES_TOOL_ALIASES[name])), `${name}: en el conjunto o con equivalente`);
// El registro de campos: secciones con su número de rutas editables, sacadas de PROJECT_FIELDS.
const editable = PROJECT_FIELDS.filter((f) => !f.readOnly);
assert.match(guide, new RegExp(`${editable.length} rutas editables`), 'el total de rutas sale del registro');
for (const section of ['client', 'rates', 'specs', 'financials', 'monthlyConsumption'])
  assert.match(guide, new RegExp(`${section} \\(\\d+\\)`), `sección ${section} con su número de rutas`);
// Un conjunto sin edit_proposal no habla de rutas.
assert.doesNotMatch(toolGuideLayer('app-assistant', [findAgentTool('search_projects')!]), /rutas editables/);

// ── 5. Capa 3: la conducta, con la lista cerrada de supuestos y valores que salen del código ─────────────────────────────
const conduct = appAssistantConductLayer();
for (const source of ASSUMPTION_SOURCES) assert.ok(conduct.includes(ASSUMPTION_SOURCE_LABELS[source]), `la lista cerrada nombra «${ASSUMPTION_SOURCE_LABELS[source]}»`);
assert.match(conduct, /solo de esta lista/i, 'la lista es cerrada');
assert.match(conduct, new RegExp(`${String(NEW_PROPOSAL_DEFAULTS.monthlyConsumptionKWh).replace(/\B(?=(\d{3})+(?!\d))/g, '\\.')} kWh`), 'el consumo de fábrica sale de NEW_PROPOSAL_DEFAULTS');
assert.match(conduct, new RegExp(`${DEFAULT_TARGET_MARGIN_PCT} %`), 'el margen de fábrica sale de Ajustes de fábrica');
assert.match(conduct, new RegExp(`${String(SIZING_ASSUMPTIONS.targetDcAcRatio).replace('.', ',')}`), 'la relación DC/AC sale de SIZING_ASSUMPTIONS');
assert.match(conduct, new RegExp(`${Math.round(SIZING_ASSUMPTIONS.battery.peakDailyFraction * 100)} %`), 'la regla de baterías también');
assert.match(conduct, /no te rindes|no te rindas/i, 'no se rinde');
assert.match(conduct, /cambia de estrategia/i, 'si una herramienta falla cambia de estrategia');
assert.match(conduct, /exactamente qué falta/i, 'si no puede, dice exactamente qué falta');
assert.match(conduct, /valores por defecto/i, 'crea sin datos con los valores por defecto');
assert.match(conduct, /nunca inventes (un )?precio/i, 'nunca inventa precios');
assert.match(conduct, /precio genérico, sin proveedor/, 'el genérico se señala como tal (mismas palabras que la capa 1)');
assert.match(conduct, /español/i);
assert.match(conduct, /breve/i);
assert.match(conduct, /qué cambió, qué supusiste, qué falta/i, 'cierra el turno con su resumen');
assert.match(conduct, /una pregunta/i, 'pregunta solo una cosa y solo si hace falta');
// No contradice la capa 1: no ofrece cifras propias ni promete guardar sin confirmación.
assert.doesNotMatch(conduct, /USD\/W|\$\/W/, 'ningún precio por vatio en la conducta');
assert.doesNotMatch(conduct, /\b\d+(?:[.,]\d+)?\s*USD\b/, 'ningún importe en USD');

// ── 6. Instantánea: cambiar la guía o la conducta es un cambio consciente (y rompe la caché del prefijo) ─────────────────
assertGolden('app-assistant-system-instruction.txt', app, 'La instrucción de sistema del asistente de la app (tres capas)');
// Tamaño acotado: el prefijo viaja en cada ronda.
assert.ok(Buffer.byteLength(app) < 9000, `instrucción de ${Buffer.byteLength(app)} bytes`);

console.log('PASS: instrucciones del asistente en tres capas: capa 1 idéntica a la remota, guía generada estable, conducta con supuestos cerrados.');
