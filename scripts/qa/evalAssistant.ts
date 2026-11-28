// Evaluación del asistente con el modelo REAL de Gemini (F7a). Comprobación manual, fuera de CI, con la clave de quien la ejecuta.
//
// Monta la sesión real del asistente de la app sobre un almacén EN MEMORIA con un catálogo sintético (sin tocar datos del usuario ni
// la red de SolarSim; la única red es la API de Gemini) y corre una lista de peticiones en español («crea una propuesta»,
// «ponle baterías», «sube la cobertura al 90 %», «cambia la distribuidora», «¿cuánto cuesta?», «deshaz eso»…). Por cada una dice las
// herramientas llamadas, si el estado final cumple su aserción, los pasos (llamadas al modelo) y la duración.
//
// Uso (factura peticiones reales con tu clave; la clave solo se lee de la variable de entorno y nunca se imprime):
//   GEMINI_API_KEY=… npx tsx scripts/qa/evalAssistant.ts --model gemini-4-hydrogen --model gemini-3.8-flash
//   GEMINI_API_KEY=… npx tsx scripts/qa/evalAssistant.ts --only crea-propuesta,deshaz-eso --timeout 120 --json
//   npx tsx scripts/qa/evalAssistant.ts --list        (no necesita clave)
// Opciones: --model <id> (repetible; sin ella, el modelo base de la app), --only <ids> (separados por comas), --timeout <s> por
// petición (180), --json (informe en JSON), --list (muestra las peticiones).
// Salida: 0 todas las aserciones se cumplen; 1 alguna no se cumple; 2 argumento inválido o falta la clave; 3 alguna petición no se
// pudo evaluar (clave inválida, cuota, red, plazo): no es un fallo del asistente.
//
// Un modelo da resultados distintos cada vez: una aserción que falla de vez en cuando es una señal para mirar la respuesta, no un
// error de la prueba. Corre con el mismo modelo varias veces antes de concluir.

export {};

// El almacén de la app guarda en `localStorage`: en Node se sustituye por uno en memoria ANTES de importar nada que lo use, así que
// ningún estado de la evaluación llega a disco aunque este Node traiga su propio `localStorage`.
const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, String(value)); },
    removeItem: (key: string) => { memory.delete(key); },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() { return memory.size; },
  },
});

const { EVAL_CASES, EXIT_ERROR, EXIT_OK, EXIT_USAGE, exitCodeFor, formatReport, formatResult, parseEvalArgs, runEvalSuite } = await import('./assistantEvalRunner');

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log('Uso: GEMINI_API_KEY=… npx tsx scripts/qa/evalAssistant.ts [--model <id>]… [--only <ids>] [--timeout <s>] [--json] [--list]');
  process.exit(EXIT_OK);
}
const parsed = parseEvalArgs(argv);
if (!parsed.ok) { console.error(parsed.error); process.exit(EXIT_USAGE); }
if (parsed.list) {
  for (const evalCase of EVAL_CASES) console.log(`${evalCase.id}\n    ${evalCase.turns.map((t) => `«${t}»`).join(' → ')}\n    ${evalCase.assertion}`);
  process.exit(EXIT_OK);
}
const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) { console.error('Falta GEMINI_API_KEY en el entorno.'); process.exit(EXIT_USAGE); }

const { createGeminiLlmClient } = await import('../../src/services/llm/geminiAdapter');
const client = createGeminiLlmClient({ apiKey });
if (!parsed.json) console.log(`Evaluando ${parsed.only.length || EVAL_CASES.length} peticiones con ${parsed.models.join(', ')} (plazo ${parsed.timeoutSec} s por petición)…\n`);
const report = await runEvalSuite({
  models: parsed.models, cases: EVAL_CASES, only: parsed.only, secrets: [apiKey], timeoutMs: parsed.timeoutSec * 1000,
  clientFor: () => client,
  // En vivo, una por una: una evaluación completa tarda minutos.
  onResult: parsed.json ? undefined : (result) => console.log(formatResult(result)),
});
if (parsed.json) console.log(JSON.stringify(report, null, 2));
else console.log(`\n${formatReport(report)}`);
const code = exitCodeFor(report);
if (code === EXIT_ERROR && !parsed.json) console.error('\nAlguna petición no se pudo evaluar (clave, cuota, red o plazo): revisa el motivo arriba; no cuenta como fallo del asistente.');
process.exit(code);
