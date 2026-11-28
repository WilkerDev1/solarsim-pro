// Soporte de pruebas (no entra en el bundle). Forma de los fixtures REST de las suites de escáneres y del adaptador:
// una función que recibe la petición (URL, cuerpo JSON, cabeceras, plazo, señal) y devuelve el JSON de la respuesta, o lanza
// un `GeminiRequestError` con el estado HTTP. `transportAsFetch` la convierte en el `fetch` falso que el SDK usa de verdad.
// (Antes vivía en el transporte REST de `shared/`, que F6 retiró: ya nada de producción lo usa.)
export type GeminiTransport = (url: string, body: unknown, headers: Record<string, string>, timeoutMs: number, signal?: AbortSignal) => Promise<any>;

/** Error HTTP del fixture: `transportAsFetch` lo devuelve como la respuesta de error de Google con ese estado. */
export class GeminiRequestError extends Error {
  constructor(message: string, public statusCode?: number) { super(message); this.name = 'GeminiRequestError'; }
}
