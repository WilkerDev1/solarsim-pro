/**
 * Limitador de tasa en memoria por ventana fija. TypeScript puro, reloj inyectable. Vive en un solo proceso:
 * con varias réplicas, el límite efectivo se multiplica (ver docs/MCP_REMOTE.md).
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Cuenta un intento; `false` si la clave superó el límite en la ventana actual. */
  take(key: string): boolean {
    const now = this.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (!entry && this.hits.size >= this.maxKeys) this.sweep(now);
      // Still full after sweeping: fail closed rather than grow without bound.
      if (!entry && this.hits.size >= this.maxKeys) return false;
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  /** Segundos hasta que la clave vuelva a tener cupo (para `Retry-After`). */
  retryAfter(key: string): number {
    const entry = this.hits.get(key);
    return entry ? Math.max(1, Math.ceil((entry.resetAt - this.now()) / 1000)) : 1;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
