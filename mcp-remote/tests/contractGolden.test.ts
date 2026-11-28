import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REMOTE_INSTRUCTIONS } from "../src/protocol.js";
import { REMOTE_TOOL_NAMES, remoteTools } from "../src/tools.js";

/**
 * F0: copias doradas de lo que ve un cliente del MCP remoto (docs/MCP_REMOTE.md): las instrucciones del servicio y las 12
 * herramientas con nombre, título, descripción y esquema de entrada. Una diferencia de un solo byte hace fallar la prueba.
 * Regenerar a propósito: UPDATE_GOLDEN=1 npm --prefix mcp-remote test, y justificar el diff en el PR.
 * (Las copias de las herramientas y reglas del MCP local están en src/tests/golden/ de la raíz.)
 */
const UPDATE = process.env.UPDATE_GOLDEN === "1";
const goldenUrl = (name: string) =>
  new URL(`./golden/${name}`, import.meta.url);

function firstDifference(expected: string, actual: string): string {
  const a = expected.split("\n");
  const b = actual.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const line = (value: string | undefined, other: string | undefined) => {
      if (value === undefined) return "(no existe)";
      let at = 0;
      while (at < value.length && value[at] === other?.[at]) at++;
      const from = Math.max(0, at - 50);
      return `${from > 0 ? "…" : ""}${JSON.stringify(value.slice(from, at + 70))} (diferencia en el carácter ${at + 1})`;
    };
    return `línea ${i + 1}:\n    golden: ${line(a[i], b[i])}\n    actual: ${line(b[i], a[i])}`;
  }
  return "(sin diferencias de línea)";
}

function assertGolden(name: string, actual: string, what: string) {
  if (UPDATE) {
    mkdirSync(fileURLToPath(new URL("./golden/", import.meta.url)), {
      recursive: true,
    });
    writeFileSync(goldenUrl(name), actual, "utf8");
    return;
  }
  assert.ok(
    existsSync(goldenUrl(name)),
    `Falta la copia dorada mcp-remote/tests/golden/${name} (${what}). Genérala con: UPDATE_GOLDEN=1 npm --prefix mcp-remote test`,
  );
  const expected = readFileSync(goldenUrl(name), "utf8");
  assert.ok(
    expected === actual,
    `${what} cambió respecto de la copia dorada mcp-remote/tests/golden/${name}.\n  ${firstDifference(expected, actual)}\n` +
      `  tamaño: golden ${Buffer.byteLength(expected)} bytes, actual ${Buffer.byteLength(actual)} bytes\n` +
      "Si el cambio es intencionado (lo ven los clientes MCP remotos y exige redesplegar mcp-remote), regenera con: " +
      "UPDATE_GOLDEN=1 npm --prefix mcp-remote test y justifica el diff en el PR; si no, revierte el cambio.",
  );
}

test("REMOTE_INSTRUCTIONS no cambia sin una copia dorada nueva", () => {
  assertGolden(
    "remote-instructions.txt",
    REMOTE_INSTRUCTIONS,
    "REMOTE_INSTRUCTIONS (instrucciones del servicio MCP remoto)",
  );
});

test("las 12 herramientas del MCP remoto no cambian sin una copia dorada nueva", () => {
  // Concesión de escritura de un ADMIN: lista las doce (las de lectura y las de escritura).
  const tools = remoteTools({ scope: "write", role: "ADMIN" }).map((tool) => ({
    name: tool.definition.name,
    title: tool.definition.title,
    kind: tool.definition.kind,
    scope: tool.scope,
    description: tool.definition.description,
    inputSchema: tool.definition.inputSchema,
  }));
  assert.equal(tools.length, 12);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    REMOTE_TOOL_NAMES,
  );
  assertGolden(
    "remote-tools.json",
    `${JSON.stringify(tools, null, 2)}\n`,
    "Las 12 herramientas del MCP remoto (nombre, título, descripción y inputSchema)",
  );
});

test("una concesión de solo lectura ve únicamente las herramientas de lectura", () => {
  const names = remoteTools({ scope: "read", role: "LECTOR" }).map(
    (tool) => tool.definition.name,
  );
  assertGolden(
    "remote-read-only-tool-names.json",
    `${JSON.stringify(names, null, 2)}\n`,
    "La lista de herramientas de una concesión de solo lectura",
  );
});

test(
  "el mensaje de fallo dice qué cambió y cómo regenerar",
  { skip: UPDATE },
  () => {
    assert.throws(
      () =>
        assertGolden(
          "remote-instructions.txt",
          `${REMOTE_INSTRUCTIONS} `,
          "REMOTE_INSTRUCTIONS",
        ),
      (error: Error) =>
        /REMOTE_INSTRUCTIONS cambió respecto de la copia dorada/.test(
          error.message,
        ) &&
        /tamaño: golden \d+ bytes, actual \d+ bytes/.test(error.message) &&
        /UPDATE_GOLDEN=1 npm --prefix mcp-remote test/.test(error.message),
    );
  },
);
