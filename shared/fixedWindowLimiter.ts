/**
 * Limitador de tasa en memoria por ventana fija. TypeScript puro, reloj inyectable. Vive en un solo proceso:
 * con varias réplicas, el límite efectivo se multiplica (ver docs/MCP_REMOTE.md).
 *
 * Con el mapa lleno se desaloja la clave más antigua: llenarlo con claves inventadas nunca bloquea a los demás
 * (como mucho, devuelve su cupo a la clave desalojada).
 */
export class FixedWindowLimiter {
  /** Orden de inserción = orden de inicio de ventana (una ventana nueva se reinserta al final). */
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10000,
    private readonly now: () => number = Date.now,
  ) {}

  private current(key: string) {
    const entry = this.hits.get(key);
    return entry && entry.resetAt > this.now() ? entry : undefined;
  }

  /** Cuenta un intento; `false` si la clave superó el límite en la ventana actual. */
  take(key: string): boolean {
    let entry = this.current(key);
    if (!entry) {
      this.hits.delete(key);
      while (this.hits.size >= this.maxKeys) this.hits.delete(this.hits.keys().next().value as string);
      entry = { count: 0, resetAt: this.now() + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  /** ¿Ya superó el límite? Sin contar un intento (para limitar solo los fallos). */
  exceeded(key: string): boolean {
    return (this.current(key)?.count ?? 0) >= this.limit;
  }

  /** Segundos hasta que la clave vuelva a tener cupo (para `Retry-After`). */
  retryAfter(key: string): number {
    const entry = this.current(key);
    return entry ? Math.max(1, Math.ceil((entry.resetAt - this.now()) / 1000)) : 1;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }
}
