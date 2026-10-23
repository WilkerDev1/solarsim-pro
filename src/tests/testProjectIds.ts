import assert from "node:assert/strict";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { createProjectId } from "../utils/projectId";

// Congela el reloj: los ids deben seguir siendo únicos dentro del mismo milisegundo.
const realNow = Date.now;
Date.now = () => 1_700_000_000_000;
try {
  const ids = Array.from({ length: 500 }, () => createProjectId());
  assert.equal(new Set(ids).size, ids.length, "createProjectId repite ids");
  assert.ok(ids.every((id) => id.startsWith("proj-") && id.length <= 128));
  assert.ok(createProjectId("proj-imported").startsWith("proj-imported-"));

  // Sin crypto.randomUUID se usa el respaldo monotónico.
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    const fallback = Array.from({ length: 500 }, () => createProjectId());
    assert.equal(new Set(fallback).size, fallback.length, "el respaldo repite ids");
    assert.ok(fallback.every((id) => id.startsWith("proj-")));
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  }

  const api = store.getState();
  api.createNewProject({ name: "Cliente A" });
  const first = store.getState().activeProjectId;
  api.createNewProject({ name: "Cliente B" });
  const second = store.getState().activeProjectId;
  assert.notEqual(first, second, "createNewProject repite id");

  const copyA = store.getState().duplicateProject(second);
  const copyB = store.getState().duplicateProject(second);
  assert.ok(copyA && copyB && copyA !== copyB, "duplicateProject repite id");

  const sample = store.getState().projects.find((p) => p.id === second)!;
  const draft = (name: string) => ({ ...sample, id: "", client: { ...sample.client, name } });
  const result = store
    .getState()
    .importProjectsFromJSON([draft("Importado 1"), draft("Importado 2"), draft("Importado 3")]);
  assert.ok(result.success);
  const all = store.getState().projects.map((p) => p.id);
  assert.equal(new Set(all).size, all.length, "la importación genera ids duplicados");
  console.log("testProjectIds OK");
} finally {
  Date.now = realNow;
}
