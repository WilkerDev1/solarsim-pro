// Reparto de suites entre trabajos paralelos de CI: `npm test -- --shard=2/3` ejecuta la segunda de tres partes.
export type Shard = { index: number; total: number };

export function parseShard(args: string[]): { shard: Shard | null; filters: string[] } {
  let shard: Shard | null = null;
  const filters: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith('--shard')) { filters.push(arg); continue; }
    if (shard) throw new Error(`--shard repetido: ${arg} (solo se admite uno)`);
    const match = /^--shard=(\d+)\/(\d+)$/.exec(arg);
    const index = Number(match?.[1]);
    const total = Number(match?.[2]);
    if (!match || total < 1 || index < 1 || index > total) throw new Error(`--shard inválido: ${arg} (formato --shard=i/n, 1 ≤ i ≤ n)`);
    shard = { index, total };
  }
  return { shard, filters };
}

// Reparto circular sobre la lista ordenada: disjunto, completo y estable aunque cambie el orden de entrada.
export function selectShard(suites: string[], shard: Shard): string[] {
  return [...suites].sort().filter((_, position) => position % shard.total === shard.index - 1);
}
