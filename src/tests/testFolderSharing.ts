import assert from "node:assert/strict";
import { useSimulationStore as store } from "../store/useSimulationStore";
import { serializeSimulationStore } from "../store/persistence/serializeSimulationStore";
import type { ProjectFolder, SyncSettings } from "../types";
const serverUrl = "https://folders-qa.invalid";
const session = (id: string, organizationId = "qa-org"): SyncSettings => ({
  serverUrl,
  authToken: "synthetic-token",
  autoSyncEnabled: false,
  lastSyncTimestamp: null,
  currentUser: {
    id,
    name: id,
    email: `${id}@example.test`,
    role: "ADMIN",
    organizationId,
  },
});
const folder = (
  id: string,
  visibility: "public" | "private" = "public",
  owner = "owner",
): ProjectFolder => ({
  id,
  name: id,
  visibility,
  createdById: owner,
  organizationId: "qa-org",
  color: "#10b981",
  description: "",
  createdAt: new Date().toISOString(),
  version: 1,
  baseVersion: 1,
});
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
async function run() {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error("Real network forbidden");
    };
    store.getState().setSyncSettings(session("owner"));
    store.setState({ folders: [], folderChanges: {}, folderDeletionQueue: [] });
    const publicFolder = store.getState().createFolder("Pública")!;
    const privateFolder = store
      .getState()
      .createFolder("Privada", "#10b981", "", false, "private")!;
    assert.equal(publicFolder.visibility, "public");
    assert.equal(privateFolder.createdById, "owner");
    const serialized = serializeSimulationStore(store.getState());
    assert.ok(serialized.folderChanges[publicFolder.id]);
    assert.equal(serialized.folderChanges[privateFolder.id].ownerId, "owner");
    store.getState().setSyncSettings(session("member"));
    assert.ok(store.getState().folders.some((f) => f.id === publicFolder.id));
    assert.ok(!store.getState().folders.some((f) => f.id === privateFolder.id));
    store.getState().setSyncSettings(session("owner"));
    assert.ok(store.getState().folders.some((f) => f.id === privateFolder.id));
    store.getState().setSyncSettings(session("owner", "foreign-org"));
    assert.equal(store.getState().folders.length, 0);
    store.getState().setSyncSettings(session("owner"));
    assert.ok(store.getState().folders.some((f) => f.id === publicFolder.id));

    // An authoritative snapshot removes a folder made private by another member.
    store.setState({
      folders: [folder("previously-public")],
      folderChanges: {},
      folderDeletionQueue: [],
    });
    globalThis.fetch = async () =>
      json({ success: true, folders: [], deletedIds: [] });
    assert.equal(
      (await store.getState().syncFoldersWithServer()).success,
      true,
    );
    assert.equal(store.getState().folders.length, 0);

    // A delayed response from a previous account cannot restore its private folder.
    store.setState({ folders: [], folderChanges: {}, folderDeletionQueue: [] });
    let release!: (value: Response) => void;
    globalThis.fetch = async () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const pending = store.getState().syncFoldersWithServer();
    while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
    store.getState().setSyncSettings(session("member"));
    release(
      json({
        success: true,
        folders: [folder("stale-private", "private")],
        deletedIds: [],
      }),
    );
    assert.equal((await pending).success, false);
    assert.ok(!store.getState().folders.some((f) => f.id === "stale-private"));

    // Tombstones beat a pending edit and cannot be republished automatically.
    store.setState({
      folders: [folder("retired")],
      folderChanges: {
        retired: { revision: "edit", ownerId: "member", baseVersion: 1 },
      },
      folderDeletionQueue: [],
    });
    let puts = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "PUT") {
        puts++;
        return new Response(JSON.stringify({ error: "deleted" }), {
          status: 409,
        });
      }
      return json({ success: true, folders: [], deletedIds: ["retired"] });
    };
    await store.getState().syncFoldersWithServer();
    assert.equal(store.getState().folders.length, 0);
    assert.equal(store.getState().folderChanges.retired, undefined);
    assert.ok(puts <= 1);
    // CAS conflicts preserve local edits until the user explicitly accepts/rebases.
    store.setState({
      folders: [folder("conflicted")],
      folderChanges: {
        conflicted: {
          revision: "local-edit",
          ownerId: "member",
          baseVersion: 1,
        },
      },
      folderDeletionQueue: [],
    });
    globalThis.fetch = async (_url, init) =>
      init?.method === "PUT"
        ? new Response(
            JSON.stringify({
              folder: {
                ...folder("conflicted"),
                name: "Servidor",
                version: 2,
                baseVersion: 2,
              },
            }),
            { status: 409 },
          )
        : json({
            success: true,
            folders: [{ ...folder("conflicted"), name: "Servidor", version: 2, baseVersion: 2 }],
            deletedIds: [],
          });
    assert.equal(
      (await store.getState().syncFoldersWithServer()).success,
      false,
    );
    assert.equal(store.getState().folders[0].name, "conflicted");
    assert.equal(
      store.getState().folderChanges.conflicted.serverFolder?.name,
      "Servidor",
    );
    store.getState().resolveFolderConflict("conflicted", "keep_local");
    assert.equal(store.getState().folderChanges.conflicted.baseVersion, 2);
    assert.equal(
      store.getState().folderChanges.conflicted.serverFolder,
      undefined,
    );
    await store.getState().syncFoldersWithServer();
    store.getState().resolveFolderConflict("conflicted", "accept_server");
    assert.equal(store.getState().folders[0].name, "Servidor");
    assert.equal(store.getState().folderChanges.conflicted, undefined);

    // Delete during a creation PUT uses the acknowledged version when retrying.
    store.setState({ folders: [], folderChanges: {}, folderDeletionQueue: [] });
    const racing = store.getState().createFolder("Pendiente")!;
    let remoteFolder: ProjectFolder | null = null,
      releasePut!: () => void;
    let deleteVersion: string | null = null;
    globalThis.fetch = async (url, init) => {
      if (init?.method === "PUT") {
        await new Promise<void>((resolve) => {
          releasePut = resolve;
        });
        remoteFolder = { ...racing, version: 1, baseVersion: 1 };
        return json({ success: true, folder: remoteFolder });
      }
      if (init?.method === "DELETE") {
        deleteVersion = new URL(String(url)).searchParams.get("baseVersion");
        remoteFolder = null;
        return json({ success: true });
      }
      return json({
        success: true,
        folders: remoteFolder ? [remoteFolder] : [],
        deletedIds: [],
      });
    };
    const creating = store.getState().syncFoldersWithServer();
    while (!releasePut) await new Promise((resolve) => setTimeout(resolve, 0));
    store.getState().deleteFolder(racing.id);
    releasePut();
    await creating;
    assert.equal(store.getState().folderDeletionQueue[0].baseVersion, 1);
    await store.getState().syncFoldersWithServer();
    assert.equal(deleteVersion, "1");
    assert.equal(store.getState().folderDeletionQueue.length, 0);

    // Auto-sync drains an edit received while the original PUT is still running.
    store.setState({ folders: [], folderChanges: {}, folderDeletionQueue: [] });
    const editing = store.getState().createFolder("Primera edición")!;
    store.setState((state) => ({
      syncSettings: { ...state.syncSettings, autoSyncEnabled: true },
    }));
    let persisted: ProjectFolder | null = null,
      releaseEdit!: () => void,
      putCount = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method === "PUT") {
        const data = JSON.parse(String(init.body));
        putCount++;
        if (putCount === 1)
          await new Promise<void>((resolve) => {
            releaseEdit = resolve;
          });
        persisted = { ...data, version: putCount, baseVersion: putCount };
        return json({ success: true, folder: persisted });
      }
      return json({
        success: true,
        folders: persisted ? [persisted] : [],
        deletedIds: [],
      });
    };
    const firstEdit = store.getState().syncFoldersWithServer();
    while (!releaseEdit) await new Promise((resolve) => setTimeout(resolve, 0));
    store.getState().updateFolder(editing.id, { name: "Edición más reciente" });
    releaseEdit();
    await firstEdit;
    for (let i = 0; i < 100 && store.getState().folderChanges[editing.id]; i++)
      await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(putCount, 2);
    assert.equal(store.getState().folderChanges[editing.id], undefined);
    assert.equal(store.getState().folders[0].name, "Edición más reciente");
    console.log(
      "✅ Folder sharing: public default, durable queues, account/tenant isolation, privacy snapshot and stale-session/tombstone protection",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
