// F0: copias doradas del contrato de herramientas y de las instrucciones que leen los modelos y los clientes MCP.
//  · AGENT_RULES_ES: instrucciones del MCP local y prefijo de las del remoto y del prompt del asistente.
//  · ASSISTANT_SYSTEM_PROMPT: prompt del asistente flotante antiguo (F3c dejó las instrucciones nuevas en tres capas,
//    `buildSystemInstruction`, con su propia instantánea; F4 cambia el flotante a ellas y retira este prompt).
//  · lista de herramientas por superficie (mcp, app-assistant, proposal-assistant) con su kind.
//  · tools/list completo del MCP local (nombre, título, descripción, kind, categoría y esquemas).
// Las 12 herramientas del MCP remoto y REMOTE_INSTRUCTIONS están en `mcp-remote/tests/contractGolden.test.ts`; además, el
// contrato congelado (huellas que no regenera UPDATE_GOLDEN) lo vigila testFrozenAgentContract, que importa el código remoto.
import assert from 'node:assert/strict';
import { useSimulationStore } from '../store/useSimulationStore';
import { DEFAULT_AGENT_POLICY } from '../store/slices/agentSlice';
import { listAgentTools } from '../features/agentTools/registry';
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agentTools/definitions';
import { AGENT_RULES_ES, ASSISTANT_SYSTEM_PROMPT } from '../../shared/agentTools/rules';
import type { AgentSource } from '../../shared/agentTools/types';
import { assertGolden, describeGoldenDiff, goldenJson, GOLDEN_ENV } from './support/golden';

useSimulationStore.setState({ agentPolicy: DEFAULT_AGENT_POLICY });

assertGolden('agent-rules-es.txt', AGENT_RULES_ES, 'AGENT_RULES_ES (instrucciones del MCP local y prefijo del remoto y del asistente)');
assertGolden('assistant-system-prompt.txt', ASSISTANT_SYSTEM_PROMPT, 'ASSISTANT_SYSTEM_PROMPT (prompt del asistente flotante)');

const SURFACES: AgentSource[] = ['mcp', 'app-assistant', 'proposal-assistant'];
const bySurface = Object.fromEntries(SURFACES.map((source) => [source, listAgentTools(source).map((tool) => ({ name: tool.name, kind: tool.kind }))]));
assertGolden('agent-tools-by-surface.json', goldenJson(bySurface), 'La lista de herramientas por superficie (nombre y kind)');
// Cada herramienta declarada aparece al menos en una superficie y la política por defecto no oculta ninguna.
assert.equal(new Set(SURFACES.flatMap((source) => bySurface[source].map((t) => t.name))).size, AGENT_TOOL_DEFINITIONS.length);

assertGolden('mcp-local-tools.json', goldenJson(listAgentTools('mcp')), 'El tools/list del MCP local (lo que anuncia connectMcpBridge)');

// El mensaje de fallo dice qué cambió y cómo regenerar (no se ejecuta al regenerar: escribiría el texto alterado).
if (process.env[GOLDEN_ENV] !== '1') {
  const failure = (actual: string) => {
    try {
      assertGolden('agent-rules-es.txt', actual, 'AGENT_RULES_ES');
    } catch (error) {
      return (error as Error).message;
    }
    return '';
  };
  const message = failure(`${AGENT_RULES_ES}!`);
  assert.match(message, /AGENT_RULES_ES cambió respecto de la copia dorada src\/tests\/golden\/agent-rules-es\.txt/);
  assert.match(message, /línea 1:[\s\S]*golden:[\s\S]*actual:/);
  assert.match(message, /UPDATE_GOLDEN=1 npm test -- Golden/);
  // Un solo byte (un espacio) basta.
  assert.match(failure(`${AGENT_RULES_ES} `), /tamaño: golden \d+ bytes, actual \d+ bytes/);
  assert.notEqual(failure(AGENT_RULES_ES.replace('Eres', 'eres')), '');
  assert.match(describeGoldenDiff('a\nb', 'a\nc'), /línea 2/);
}

console.log('PASS: agent contract goldens: rules, assistant prompt, tools by surface and local MCP tools/list.');
