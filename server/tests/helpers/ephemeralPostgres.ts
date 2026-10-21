import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

const exec = promisify(execFile);

export interface EphemeralPostgres {
  pool: pg.Pool;
  stop: () => Promise<void>;
}

/** Starts a throwaway postgres:16-alpine container bound to 127.0.0.1 and waits until it accepts queries. */
export async function startEphemeralPostgres(
  name: string,
): Promise<EphemeralPostgres> {
  const container = `${name}-${crypto.randomUUID()}`;
  await exec("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    container,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    "POSTGRES_USER=solarsim_test",
    "--env",
    "POSTGRES_PASSWORD=isolated-test-only",
    "--env",
    "POSTGRES_DB=solarsim_test",
    "postgres:16-alpine",
  ]);
  const stop = async () => {
    await pool?.end().catch(() => {});
    await exec("docker", ["rm", "-f", container]).catch(() => {});
  };
  let pool: pg.Pool | undefined;
  try {
    const mapped = (
      await exec("docker", ["port", container, "5432/tcp"])
    ).stdout.trim();
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: Number(mapped.split(":").at(-1)),
      user: "solarsim_test",
      password: "isolated-test-only",
      database: "solarsim_test",
      connectionTimeoutMillis: 1000,
    });
    for (let attempt = 0; ; attempt++) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch {
        if (attempt === 49)
          throw new Error("Isolated PostgreSQL did not start");
        await delay(100);
      }
    }
    return { pool, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
