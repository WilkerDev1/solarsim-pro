// Comprobación manual, fuera de CI: ¿acepta la API real de Gemini los esquemas de salida de los tres escáneres?
//
// Envía cada esquema (tarifas, fichas técnicas y listas de precios, como JSON Schema por `responseJsonSchema` a través del
// puerto LlmClient) a cada modelo indicado con una petición mínima sin documento, y dice cuáles acepta y cuáles rechaza con
// el mensaje del servidor. No sustituye una prueba con un documento real: solo verifica que el esquema es admisible.
//
// Uso (factura peticiones reales con tu clave; la clave solo se lee de la variable de entorno):
//   GEMINI_API_KEY=… npx tsx scripts/qa/checkScannerSchemas.ts --model gemini-4-hydrogen --model gemini-3.8-flash
// Sale con código 1 si algún modelo rechaza algún esquema (400), con 2 si falta la clave o un argumento y con 3 si la prueba
// no se pudo hacer (clave inválida, cuota, 403, modelo inexistente, 5xx, plazo o red). Una salida truncada o con JSON
// inválido no cuenta como rechazo: la API admitió el esquema.
import { DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL } from '../../src/services/llm/models';
import { createGeminiLlmClient } from '../../src/services/llm/geminiAdapter';
import { isLlmError } from '../../src/services/llm/errors';
import { DATASHEET_RESPONSE_SCHEMA } from '../../src/services/geminiDatasheetService';
import { PRICE_CATALOG_RESPONSE_SCHEMA } from '../../src/services/geminiPriceCatalogService';
import { TARIFF_RESPONSE_SCHEMA } from '../../src/services/geminiTariffService';

const SCHEMAS: Array<[string, unknown]> = [['tarifas', TARIFF_RESPONSE_SCHEMA], ['fichas', DATASHEET_RESPONSE_SCHEMA], ['precios', PRICE_CATALOG_RESPONSE_SCHEMA]];

const models: string[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--model' && argv[i + 1]) models.push(argv[++i]);
  else { console.error(`Argumento no reconocido: ${argv[i]}`); process.exit(2); }
}
if (!models.length) models.push(DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL);
const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) { console.error('Falta GEMINI_API_KEY en el entorno.'); process.exit(2); }

const llm = createGeminiLlmClient({ apiKey });
let rejected = 0;
for (const model of models) {
  for (const [name, schema] of SCHEMAS) {
    try {
      await llm.structured({
        model,
        contents: [{ role: 'user', parts: [{ type: 'text', text: 'Devuelve un ejemplo mínimo con datos ficticios que cumpla el esquema.' }] }],
        schema,
        thinkingLevel: 'low',
        maxOutputTokens: 2048,
      }, { timeoutMs: 60000 });
      console.log(`${model} · ${name}: ACEPTADO`);
    } catch (error) {
      if (isLlmError(error, 'malformed_response')) { console.log(`${model} · ${name}: ACEPTADO (salida truncada o inválida: el esquema se admitió)`); continue; }
      const message = isLlmError(error) ? `${error.kind}${error.status ? ` ${error.status}` : ''}: ${error.serverMessage ?? error.message}` : String(error);
      if (isLlmError(error, 'bad_request') && error.status === 400) { rejected++; console.log(`${model} · ${name}: RECHAZADO (${message})`); continue; }
      console.error(`\nAbortado. ${model} · ${name}: la prueba no se pudo hacer (${message}).`);
      process.exit(3);
    }
  }
}
console.log(rejected ? '\nHay esquemas rechazados.' : '\nTodos los esquemas fueron aceptados.');
process.exit(rejected ? 1 : 0);
