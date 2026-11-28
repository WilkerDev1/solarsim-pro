// Comprobación manual, fuera de CI: ¿acepta la API real de Gemini todas las declaraciones de herramientas?
//
// Envía las declaraciones de shared/agentTools/definitions.ts tal como las mandará el bucle nuevo (JSON Schema por
// parametersJsonSchema, a través del puerto LlmClient) a cada modelo indicado, primero todas juntas y, si el lote
// falla o se pide --each, una a una, e informa cuáles acepta y cuáles rechaza con el mensaje del servidor.
//
// Uso (factura peticiones reales con tu clave; la clave solo se lee de la variable de entorno):
//   GEMINI_API_KEY=… npx tsx scripts/qa/checkToolDeclarations.ts --model gemini-4-hydrogen --model gemini-3.8-flash
// Opciones:
//   --model <id>        modelo a probar (repetible; por defecto DEFAULT_GEMINI_MODEL y FALLBACK_GEMINI_MODEL)
//   --surface <nombre>  solo las herramientas de esa superficie (app-assistant, proposal-assistant, mcp)
//   --each              probar también cada herramienta por separado aunque el lote completo pase
//   --mode <modo>       modo de llamada a funciones: validated (por defecto, el del bucle nuevo), auto, any o none
// Sale con código 1 si algún modelo rechaza alguna declaración (o el lote), con 2 si falta la clave o un argumento y
// con 3 si la prueba no se pudo hacer. Solo un 400 cuenta como rechazo de declaración: ante clave inválida, cuota (429),
// 403 de permiso, modelo inexistente, 5xx, plazo o red se aborta sin contar rechazos ni lanzar la prueba una a una
// (serían decenas de peticiones facturadas inútiles).
// Las herramientas no se ejecutan nunca: si el modelo llama a alguna, la llamada se descarta.
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agentTools/definitions';
import type { AgentSource, AgentToolDefinition } from '../../shared/agentTools/types';
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from '../../shared/geminiTransport';
import { createGeminiLlmClient } from '../../src/services/llm/geminiAdapter';
import { isLlmError } from '../../src/services/llm/errors';
import type { LlmClient, LlmToolDeclaration, LlmToolMode } from '../../src/services/llm/types';

interface Options { models: string[]; surface?: AgentSource; each: boolean; mode: LlmToolMode }

function parseArgs(argv: string[]): Options {
  const options: Options = { models: [], each: false, mode: 'validated' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--model' && argv[i + 1]) options.models.push(argv[++i]);
    else if (arg === '--surface' && argv[i + 1]) options.surface = argv[++i] as AgentSource;
    else if (arg === '--each') options.each = true;
    else if (arg === '--mode' && ['auto', 'any', 'none', 'validated'].includes(argv[i + 1])) options.mode = argv[++i] as LlmToolMode;
    else { console.error(`Argumento no reconocido: ${arg}`); process.exit(2); }
  }
  if (!options.models.length) options.models = [DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL];
  return options;
}

/** Misma forma que usará el bucle del asistente: sin argumentos no se manda esquema. */
function toolDeclaration(definition: AgentToolDefinition): LlmToolDeclaration {
  const hasArgs = !!definition.inputSchema.properties && Object.keys(definition.inputSchema.properties).length > 0;
  return { name: definition.name, description: definition.description, ...(hasArgs ? { parameters: definition.inputSchema } : {}) };
}

type Verdict = { ok: true } | { ok: false; message: string };

/** Fallo que no dice nada de las declaraciones: se aborta la ejecución. */
class ProbeAborted extends Error {}
const isSchemaRejection = (error: unknown) => isLlmError(error, 'bad_request') && error.status === 400;
async function probe(llm: LlmClient, model: string, tools: LlmToolDeclaration[], mode: LlmToolMode): Promise<Verdict> {
  try {
    await llm.generate({
      model,
      contents: [{ role: 'user', parts: [{ type: 'text', text: 'Responde solo «ok». No llames a ninguna herramienta.' }] }],
      tools,
      toolMode: mode,
      thinkingLevel: 'low',
      maxOutputTokens: 256,
    }, { timeoutMs: 60000 });
    return { ok: true };
  } catch (error) {
    const message = isLlmError(error)
      ? `${error.kind}${error.status ? ` ${error.status}` : ''}: ${error.serverMessage ?? error.message}`
      : error instanceof Error ? error.message : String(error);
    if (isSchemaRejection(error)) return { ok: false, message };
    throw new ProbeAborted(`${model}: la prueba no se pudo hacer (${message}). No se cuenta como rechazo de declaraciones.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) { console.error('Falta GEMINI_API_KEY en el entorno.'); process.exit(2); }
  const definitions = AGENT_TOOL_DEFINITIONS.filter((d) => !options.surface || d.surfaces.includes(options.surface));
  const declarations = definitions.map(toolDeclaration);
  const llm = createGeminiLlmClient({ apiKey });
  let rejected = 0;
  console.log(`${declarations.length} declaraciones${options.surface ? ` de ${options.surface}` : ''}; modelos: ${options.models.join(', ')}`);
  for (const model of options.models) {
    const all = await probe(llm, model, declarations, options.mode);
    console.log(`\n${model}: lote completo ${all.ok ? 'ACEPTADO' : `RECHAZADO (${all.message})`}`);
    if (!all.ok) rejected++;
    if (all.ok && !options.each) continue;
    // Las rondas de verdad mandan el lote completo: con una sola rechazada falla todo, así que se aísla cuál es.
    for (const declaration of declarations) {
      const verdict = await probe(llm, model, [declaration], options.mode);
      if (!verdict.ok) rejected++;
      console.log(`  ${verdict.ok ? 'acepta ' : 'RECHAZA'} ${declaration.name}${verdict.ok ? '' : ` — ${verdict.message}`}`);
    }
  }
  console.log(rejected ? `\nHay declaraciones rechazadas.` : '\nTodas las declaraciones fueron aceptadas.');
  process.exit(rejected ? 1 : 0);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof ProbeAborted)) throw error;
  console.error(`\nAbortado. ${error.message}`);
  process.exit(3);
}
