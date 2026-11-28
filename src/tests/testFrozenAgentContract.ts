// F3c: prueba guardiana del contrato congelado con los agentes externos (docs/AGENT_CONTRACT_FREEZE.md).
//
// Mientras el asistente único se construye (F3–F7), lo que ven los agentes externos no cambia ni un byte, y por eso la 2.11.0
// es solo de cliente (sin redesplegar mcp-remote, la API ni el visor):
//  · AGENT_RULES_ES (instrucciones del MCP local y prefijo de las del remoto);
//  · REMOTE_INSTRUCTIONS y las 12 herramientas del MCP remoto (nombre, título, tipo, alcance, descripción y esquema);
//  · la definición de propose_project_update (la fachada que los agentes externos siguen usando una versión más);
//  · los tipos de herramienta: read, draft y guarded (uno nuevo hace que electron/mcp descarte la lista entera).
//
// A diferencia de las copias doradas de F0, esta prueba NO se regenera con UPDATE_GOLDEN=1: las huellas viven aquí y solo se
// cambian a mano, en el mismo PR que descongela el contrato y prevé el despliegue de mcp-remote (ver el documento).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AGENT_RULES_ES } from '../../shared/agentTools/rules';
import { AGENT_TOOL_DEFINITIONS, findAgentTool } from '../../shared/agentTools/definitions';
import { REMOTE_INSTRUCTIONS } from '../../mcp-remote/src/protocol';
import { REMOTE_TOOL_NAMES, remoteTools } from '../../mcp-remote/src/tools';
import { appAssistantToolDefinitions } from '../features/agentTools/appAssistant/definitions';
import { buildSystemInstruction, sharedInvariantsLayer } from '../features/agentTools/appAssistant/instructions';

/** El contrato congelado. Cambiar una huella es descongelarlo: ver docs/AGENT_CONTRACT_FREEZE.md antes de tocarla. */
const FROZEN = {
  agentRulesSha256: '8bda52494d73838c3a3663915f2ed99c02a55c5420fcc623b593bafa8bde08b8',
  remoteInstructionsSha256: 'c8124085d5873c34e18c36a8130f7a30dbec51232a3499b41644664f79255788',
  /** El JSON de las 12 herramientas remotas con el mismo formato que mcp-remote/tests/golden/remote-tools.json. */
  remoteToolsSha256: '9fc8253041458158afdacc196c1cb00bb4a97ef6bf91c80ebb427c6eb582874d',
  proposeProjectUpdateSha256: '0f883503ae04cbfd173643e39e88da4a91d00f1c708ccc0d45bee54a81f81301',
  remoteToolNames: [
    'search_projects', 'get_project', 'search_equipment', 'get_equipment', 'get_price_history', 'list_supplier_offers',
    'get_tariffs', 'search_clients', 'get_client', 'create_client', 'update_client', 'link_proposal_to_client',
  ],
  kinds: ['read', 'draft', 'guarded'],
} as const;

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const file = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const remoteToolsJson = () => `${JSON.stringify(remoteTools({ scope: 'write', role: 'ADMIN' }).map((tool) => ({
  name: tool.definition.name, title: tool.definition.title, kind: tool.definition.kind, scope: tool.scope,
  description: tool.definition.description, inputSchema: tool.definition.inputSchema,
})), null, 2)}\n`;
const thaw = 'Es el contrato congelado con los agentes externos: si el cambio es a propósito, sigue docs/AGENT_CONTRACT_FREEZE.md (descongelar = desplegar mcp-remote y avisar en las notas de versión) y actualiza la huella en esta prueba.';

/** Comprobaciones del contrato sobre unos valores dados (las reales y, abajo, unas alteradas para probar la guarda). */
function checkFrozenContract(actual: { rules: string; remoteInstructions: string; remoteTools: string; proposeProjectUpdate: string; remoteNames: readonly string[]; kinds: readonly string[] }) {
  assert.equal(sha256(actual.rules), FROZEN.agentRulesSha256, `AGENT_RULES_ES cambió. ${thaw}`);
  assert.equal(sha256(actual.remoteInstructions), FROZEN.remoteInstructionsSha256, `REMOTE_INSTRUCTIONS cambió. ${thaw}`);
  assert.deepEqual([...actual.remoteNames], [...FROZEN.remoteToolNames], `La lista de herramientas del MCP remoto cambió. ${thaw}`);
  assert.equal(sha256(actual.remoteTools), FROZEN.remoteToolsSha256, `Alguna de las 12 herramientas del MCP remoto cambió (título, tipo, alcance, descripción o esquema). ${thaw}`);
  assert.equal(sha256(actual.proposeProjectUpdate), FROZEN.proposeProjectUpdateSha256, `La definición de propose_project_update cambió. ${thaw}`);
  for (const kind of actual.kinds) assert.ok((FROZEN.kinds as readonly string[]).includes(kind), `Tipo de herramienta nuevo «${kind}»: electron/mcp descartaría la lista entera. ${thaw}`);
}

const real = {
  rules: AGENT_RULES_ES,
  remoteInstructions: REMOTE_INSTRUCTIONS,
  remoteTools: remoteToolsJson(),
  proposeProjectUpdate: JSON.stringify(findAgentTool('propose_project_update')),
  remoteNames: REMOTE_TOOL_NAMES,
  kinds: [...AGENT_TOOL_DEFINITIONS, ...appAssistantToolDefinitions()].map((d) => d.kind),
};
checkFrozenContract(real);

// Las copias doradas de F0 dicen lo mismo que el código (una regeneración también cambiaría su huella y la detectaría esto).
assert.equal(file('./golden/agent-rules-es.txt'), AGENT_RULES_ES);
assert.equal(file('../../mcp-remote/tests/golden/remote-instructions.txt'), REMOTE_INSTRUCTIONS);
assert.equal(file('../../mcp-remote/tests/golden/remote-tools.json'), real.remoteTools);
assert.equal(sha256(file('./golden/agent-rules-es.txt')), FROZEN.agentRulesSha256);
assert.equal(sha256(file('../../mcp-remote/tests/golden/remote-tools.json')), FROZEN.remoteToolsSha256);
// El remoto se compone así: la capa 1 de las instrucciones nuevas, un espacio y su párrafo propio.
assert.ok(REMOTE_INSTRUCTIONS.startsWith(`${sharedInvariantsLayer()} `));
// Los agentes externos reciben solo la capa 1 mientras dure el congelamiento.
assert.equal(buildSystemInstruction('mcp'), AGENT_RULES_ES);

// La guarda salta con un solo byte en cualquiera de las piezas, y dice qué hacer.
const breaks = (patch: Partial<typeof real>, pattern: RegExp) =>
  assert.throws(() => checkFrozenContract({ ...real, ...patch }), (error: Error) => pattern.test(error.message) && error.message.includes('AGENT_CONTRACT_FREEZE.md'));
breaks({ rules: `${AGENT_RULES_ES} ` }, /AGENT_RULES_ES cambió/);
breaks({ rules: AGENT_RULES_ES.replace('nunca inventes un precio', 'no inventes un precio') }, /AGENT_RULES_ES cambió/);
breaks({ remoteInstructions: REMOTE_INSTRUCTIONS.replace('remoto', 'Remoto') }, /REMOTE_INSTRUCTIONS cambió/);
breaks({ remoteTools: real.remoteTools.replace('"Máximo 12', '"Máximo 13') }, /12 herramientas del MCP remoto cambió/);
breaks({ remoteTools: real.remoteTools.replace('"required": [\n        "id"', '"required": [\n        "projectId"') }, /12 herramientas del MCP remoto cambió/);
breaks({ remoteNames: [...REMOTE_TOOL_NAMES, 'propose_project_update'] }, /lista de herramientas del MCP remoto/);
breaks({ proposeProjectUpdate: JSON.stringify({ ...findAgentTool('propose_project_update')!, description: 'Obsoleta.' }) }, /propose_project_update cambió/);
breaks({ kinds: ['read', 'live'] }, /Tipo de herramienta nuevo «live»/);
assert.notEqual(real.remoteTools.replace('"Máximo 12', '"Máximo 13'), real.remoteTools, 'la alteración de prueba sí cambia el texto');

console.log('PASS: contrato congelado con los agentes externos: AGENT_RULES_ES, REMOTE_INSTRUCTIONS, las 12 herramientas remotas, propose_project_update y los kinds.');
