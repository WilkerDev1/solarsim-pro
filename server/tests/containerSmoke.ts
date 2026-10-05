import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Explicit image smoke test, isolated from production and cleaned in finally.
const suffix = randomUUID();
const network = `solarsim-qa-${suffix}`;
const database = `solarsim-qa-pg-${suffix}`;
const api = `solarsim-qa-api-${suffix}`;
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const pause = () => new Promise((resolve) => setTimeout(resolve, 300));
try {
  const password = randomUUID();
  docker("network", "create", network);
  docker(
    "run",
    "-d",
    "--name",
    database,
    "--network",
    network,
    "-e",
    "POSTGRES_USER=qa_user",
    "-e",
    "POSTGRES_DB=qa_db",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:16-alpine",
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      docker(
        "exec",
        database,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "qa_user",
        "-d",
        "qa_db",
      );
      ready = true;
      break;
    } catch {
      await pause();
    }
  }
  assert.ok(ready, "Isolated PostgreSQL TCP listener must become ready");
  docker(
    "run",
    "-d",
    "--name",
    api,
    "--network",
    network,
    "-p",
    "127.0.0.1::3000",
    "-e",
    `DB_HOST=${database}`,
    "-e",
    "DB_USER=qa_user",
    "-e",
    "DB_NAME=qa_db",
    "-e",
    `DB_PASSWORD=${password}`,
    "-e",
    `JWT_SECRET=${randomUUID()}${randomUUID()}`,
    "solarsim-api:qa-modular",
  );
  const base = `http://${docker("port", api, "3000").split("\n")[0]}`;
  ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup wait, never touch another container. */
    }
    await pause();
  }
  if (!ready) console.error(docker("logs", "--tail", "10", api));
  assert.ok(ready, "Built Node24 image must start and connect to PostgreSQL");
  assert.notEqual(docker("exec", api, "id", "-u"), "0");
  const loginPassword = randomUUID();
  const loginEmail = `${suffix}@example.invalid`;
  const registration = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Synthetic QA",
      email: loginEmail,
      password: loginPassword,
      organizationName: "Isolated QA",
    }),
  });
  assert.equal(registration.status, 200);
  const auth = (await registration.json()) as { token: string };
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
  };
  const policy = (await (
    await fetch(`${base}/api/organization/features`, { headers })
  ).json()) as {
    settings: { selfConsumptionProjection: boolean };
    version: number;
  };
  assert.equal(policy.settings.selfConsumptionProjection, false);
  const changed = await fetch(`${base}/api/organization/features`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      baseVersion: policy.version,
      settings: { selfConsumptionProjection: true },
    }),
  });
  assert.equal(changed.status, 200);
  assert.equal(
    ((await changed.json()) as typeof policy).settings
      .selfConsumptionProjection,
    true,
  );
  // Rehearse coordinated DB/JWT rotation on this disposable database and API only.
  const nextPassword = randomUUID();
  const nextSecret = randomUUID() + randomUUID();
  docker(
    "exec",
    database,
    "psql",
    "-U",
    "qa_user",
    "-d",
    "qa_db",
    "-c",
    `ALTER ROLE qa_user PASSWORD '${nextPassword}'`,
  );
  assert.equal(
    docker(
      "exec",
      api,
      "node",
      "--input-type=module",
      "-e",
      "import pg from 'pg'; const client=new pg.Client({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});try {await client.connect(); process.exitCode=1;} catch {console.log('previous_database_credential_rejected');}finally{await client.end();}",
    ),
    "previous_database_credential_rejected",
  );
  docker("rm", "-f", api);
  docker(
    "run",
    "-d",
    "--name",
    api,
    "--network",
    network,
    "-p",
    "127.0.0.1::3000",
    "-e",
    `DB_HOST=${database}`,
    "-e",
    "DB_USER=qa_user",
    "-e",
    "DB_NAME=qa_db",
    "-e",
    `DB_PASSWORD=${nextPassword}`,
    "-e",
    `JWT_SECRET=${nextSecret}`,
    "solarsim-api:qa-modular",
  );
  const rotatedBase = `http://${docker("port", api, "3000").split("\n")[0]}`;
  ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (
        (
          await fetch(rotatedBase + "/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await pause();
  }
  assert.ok(ready, "Rotated image reconnects using new database credential");
  assert.equal(
    (await fetch(rotatedBase + "/api/organization/features", { headers }))
      .status,
    401,
    "Old JWT is revoked",
  );
  assert.equal(
    (
      await fetch(rotatedBase + "/api/auth/refresh", {
        method: "POST",
        headers,
      })
    ).status,
    401,
    "Old JWT cannot refresh after rotation",
  );
  const loggedIn = await fetch(rotatedBase + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: loginEmail, password: loginPassword }),
  });
  assert.equal(loggedIn.status, 200);
  const renewed = (await loggedIn.json()) as { token: string };
  const retained = await fetch(rotatedBase + "/api/organization/features", {
    headers: { Authorization: `Bearer ${renewed.token}` },
  });
  assert.equal(retained.status, 200);
  assert.equal(
    ((await retained.json()) as typeof policy).settings
      .selfConsumptionProjection,
    true,
    "Rotation preserves business data",
  );
  console.log(
    "Built image smoke passed: Node24 ESM contracts, non-root, PostgreSQL health, registration, feature CAS and DB/JWT rotation.",
  );
} finally {
  for (const name of [api, database]) {
    try {
      // These UUID-named containers belong to this smoke; remove their anonymous volumes too.
      docker("rm", "-f", "-v", name);
    } catch {
      /* Nothing created. */
    }
  }
  try {
    docker("network", "rm", network);
  } catch {
    /* Nothing created. */
  }
}
