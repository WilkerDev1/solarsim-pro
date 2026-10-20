import { isWriterRole } from '../../../shared/permissions';
import { SimulationSlice, FolderSlice } from "../types";
import { ProjectFolder } from "../../types";
import { fetchWithSessionRetry } from "../../services/syncService";
import { ownsProject } from "../sync/projectReconciliation";
import { contentEqual } from "../sync/projectDifferences";

// Compare the editable definition, excluding server attribution and receipt metadata.
const folderContent = (folder: ProjectFolder) => ({
  name: folder.name,
  color: folder.color || "#10b981",
  description: folder.description || "",
  hideFromGeneral: folder.hideFromGeneral ?? false,
  visibility: folder.visibility ?? "public",
});

export const createFolderSlice: SimulationSlice<FolderSlice> = (set, get) => {
  let running: {
    generation: number;
    rerun: boolean;
    promise: Promise<{ success: boolean; message: string }>;
  } | null = null;
  const writable = () =>
    !get().syncSettings.currentUser ||
    isWriterRole(get().syncSettings.currentUser!.role);
  const dirty = (id: string, baseVersion: number) => ({
    ...get().folderChanges,
    [id]: {
      revision: crypto.randomUUID(),
      ownerId: get().syncSettings.currentUser?.id,
      baseVersion,
    },
  });
  const sync = () => {
    if (get().syncSettings.authToken && get().syncSettings.autoSyncEnabled)
      void get().syncFoldersWithServer();
  };
  return {
    folders: [],
    folderChanges: {},
    folderDeletionQueue: [],
    folderSyncFeedback: null,
    activeFolderId: null,
    activeTeamMemberFilter: null,
    setActiveFolderId: (id) =>
      set({ activeFolderId: id, activeTeamMemberFilter: null }),
    setActiveTeamMemberFilter: (member) =>
      set({ activeTeamMemberFilter: member, activeFolderId: null }),
    createFolder: (
      name,
      color = "#10b981",
      description = "",
      hideFromGeneral = false,
      visibility = "public",
    ) => {
      if (!writable() || !name.trim()) return null;
      const user = get().syncSettings.currentUser;
      const folder: ProjectFolder = {
        id: `folder-${crypto.randomUUID()}`,
        name: name.trim(),
        color,
        description,
        hideFromGeneral,
        visibility,
        createdAt: new Date().toISOString(),
        createdBy: user?.name || "Local",
        createdById: user?.id,
        organizationId: user?.organizationId,
        baseVersion: 0,
      };
      set((state) => ({
        folders: [...state.folders, folder],
        folderChanges: dirty(folder.id, 0),
        saveFeedbackMessage: `Carpeta "${folder.name}" creada.`,
      }));
      sync();
      return folder;
    },
    updateFolder: (id, updates) => {
      const state = get(),
        existing = state.folders.find((f) => f.id === id);
      if (
        !writable() ||
        !existing ||
        (existing.visibility === "private" &&
          existing.createdById &&
          existing.createdById !== state.syncSettings.currentUser?.id)
      )
        return;
      if (
        updates.visibility === "private" &&
        existing.createdById &&
        existing.createdById !== state.syncSettings.currentUser?.id
      ) {
        set({
          folderSyncFeedback:
            "Solo el creador puede hacer privada esta carpeta.",
        });
        return;
      }
      const {
        name = existing.name,
        color = existing.color,
        description = existing.description,
        hideFromGeneral = existing.hideFromGeneral,
        visibility = existing.visibility,
      } = updates;
      if (!name.trim()) return;
      set({
        folders: state.folders.map((f) =>
          f.id === id
            ? {
                ...f,
                name: name.trim(),
                color,
                description,
                hideFromGeneral,
                visibility,
              }
            : f,
        ),
        folderChanges: dirty(
          id,
          state.folderChanges[id]?.baseVersion ??
            existing.baseVersion ??
            existing.version ??
            0,
        ),
      });
      sync();
    },
    deleteFolder: (id) => {
      const state = get(),
        folder = state.folders.find((f) => f.id === id);
      if (
        !writable() ||
        !folder ||
        (folder.visibility === "private" &&
          folder.createdById &&
          folder.createdById !== state.syncSettings.currentUser?.id)
      )
        return;
      const changes = { ...state.folderChanges };
      delete changes[id];
      set({
        folders: state.folders.filter((f) => f.id !== id),
        folderChanges: changes,
        folderDeletionQueue: [
          ...state.folderDeletionQueue.filter((c) => c.id !== id),
          {
            id,
            ownerId: state.syncSettings.currentUser?.id,
            baseVersion: folder.baseVersion ?? folder.version ?? 0,
          },
        ],
        activeFolderId:
          state.activeFolderId === id ? null : state.activeFolderId,
        projects: state.projects.map((p) =>
          p.folderId === id
            ? {
                ...p,
                folderId: undefined,
                syncStatus: "pending",
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
        saveFeedbackMessage: "Carpeta eliminada; los proyectos se conservan.",
      });
      sync();
    },
    moveProjectToFolder: (projectId, targetFolderId) => {
      const state = get(),
        project = state.projects.find((p) => p.id === projectId),
        user = state.syncSettings.currentUser;
      if (
        !writable() ||
        !project ||
        project.isDeleted ||
        (user &&
          !ownsProject(
            project,
            state.syncSettings.serverUrl,
            user.organizationId,
          )) ||
        (targetFolderId && !state.folders.some((f) => f.id === targetFolderId))
      )
        return;
      set({
        projects: state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                folderId: targetFolderId || undefined,
                syncStatus: "pending",
                updatedAt: new Date().toISOString(),
              }
            : p,
        ),
      });
      state.triggerAutoSync(false);
    },
    resolveFolderConflict: (id, resolution) => {
      const state = get(),
        change = state.folderChanges[id];
      if (
        !writable() ||
        !change?.serverFolder ||
        (change.ownerId &&
          change.ownerId !== state.syncSettings.currentUser?.id)
      )
        return;
      const changes = { ...state.folderChanges };
      if (resolution === "accept_server") {
        delete changes[id];
        set({
          folders: state.folders.map((f) =>
            f.id === id ? change.serverFolder! : f,
          ),
          folderChanges: changes,
          folderSyncFeedback: null,
        });
      } else {
        changes[id] = {
          revision: crypto.randomUUID(),
          ownerId: change.ownerId,
          baseVersion:
            change.serverFolder.baseVersion ?? change.serverFolder.version ?? 0,
        };
        set({ folderChanges: changes, folderSyncFeedback: null });
        sync();
      }
    },
    syncFoldersWithServer: () => {
      const initial = get(),
        generation = initial.sessionGeneration,
        user = initial.syncSettings.currentUser;
      if (running?.generation === generation) {
        running.rerun = true;
        return running.promise;
      }
      if (!user || !initial.syncSettings.authToken)
        return Promise.resolve({
          success: false,
          message: "Inicia sesión para sincronizar carpetas.",
        });
      const current = () =>
        get().sessionGeneration === generation &&
        get().syncSettings.currentUser?.id === user.id &&
        get().syncSettings.serverUrl === initial.syncSettings.serverUrl;
      const request = (path: string, init: RequestInit = {}) =>
        fetchWithSessionRetry(
          `${initial.syncSettings.serverUrl.replace(/\/+$/, "")}/api/folders${path}`,
          {
            ...init,
            headers: {
              Authorization: `Bearer ${get().syncSettings.authToken}`,
              "Content-Type": "application/json",
            },
          },
        );
      const promise = (async () => {
        try {
          // Load before publishing legacy local definitions: never overwrite an existing shared folder blindly.
          const response = await request("");
          const data = await response.json();
          if (!response.ok || !data.success || !Array.isArray(data.folders))
            throw new Error(
              data.error || "El servidor no admite sincronización de carpetas.",
            );
          if (!current())
            return { success: false, message: "La sesión cambió." };
          const remote = new Map<string, ProjectFolder>(
            data.folders.map((f: ProjectFolder) => [f.id, f]),
          );
          const deleted = new Set<string>(data.deletedIds || []);
          // Existing local folders are explicitly in this organization workspace; keep their IDs and publish once.
          for (const f of get().folders)
            if (
              !f.version &&
              !remote.has(f.id) &&
              !deleted.has(f.id) &&
              !get().folderChanges[f.id] &&
              writable()
            )
              set({ folderChanges: dirty(f.id, 0) });
          let failures = 0;
          for (const command of [...get().folderDeletionQueue]) {
            if (!current())
              return { success: false, message: "La sesión cambió." };
            if (command.ownerId && command.ownerId !== user.id) continue;
            if (
              deleted.has(command.id) ||
              (!remote.has(command.id) && command.baseVersion === 0)
            ) {
              set((s) => ({
                folderDeletionQueue: s.folderDeletionQueue.filter(
                  (v) => v.id !== command.id,
                ),
              }));
              continue;
            }
            const r = await request(
              `/${encodeURIComponent(command.id)}?baseVersion=${command.baseVersion}`,
              { method: "DELETE" },
            );
            if (!current())
              return { success: false, message: "La sesión cambió." };
            if (r.ok) {
              remote.delete(command.id);
              deleted.add(command.id);
              set((s) => ({
                folderDeletionQueue: s.folderDeletionQueue.filter(
                  (v) => v.id !== command.id,
                ),
              }));
            } else {
              failures++;
              const body = await r.json();
              if (!current())
                return { success: false, message: "La sesión cambió." };
              if (r.status === 409 && body.folder)
                set((s) => ({
                  folders: [
                    ...s.folders.filter((f) => f.id !== command.id),
                    body.folder,
                  ],
                  folderDeletionQueue: s.folderDeletionQueue.filter(
                    (v) => v.id !== command.id,
                  ),
                  folderChanges: {
                    ...s.folderChanges,
                    [command.id]: {
                      revision: crypto.randomUUID(),
                      ownerId: user.id,
                      baseVersion: command.baseVersion,
                      serverFolder: body.folder,
                    },
                  },
                }));
            }
          }
          for (const [id, change] of Object.entries(get().folderChanges)) {
            if (!current())
              return { success: false, message: "La sesión cambió." };
            if (change.ownerId && change.ownerId !== user.id) continue;
            const f = get().folders.find((v) => v.id === id);
            if (!f || deleted.has(id)) continue;
            if (change.serverFolder) {
              failures++;
              continue;
            }
            const serverFolder = remote.get(id);
            if (serverFolder && contentEqual(folderContent(serverFolder), folderContent(f))) {
              // Recover a lost PUT receipt only from identical authoritative content.
              set((s) => {
                const changes = { ...s.folderChanges };
                delete changes[id];
                return { folderChanges: changes };
              });
              continue;
            }
            if (serverFolder && change.baseVersion === 0) {
              // A lost creation ACK or legacy definition must not discard divergent local work.
              failures++;
              set((s) => ({ folderChanges: {
                ...s.folderChanges,
                [id]: { ...s.folderChanges[id], serverFolder },
              } }));
              continue;
            }
            const r = await request(`/${encodeURIComponent(id)}`, {
              method: "PUT",
              body: JSON.stringify({ ...f, baseVersion: change.baseVersion }),
            });
            const saved = await r.json();
            if (!current())
              return { success: false, message: "La sesión cambió." };
            if (!r.ok || !saved.folder) {
              failures++;
              if (r.status === 409 && saved.folder)
                set((s) => ({
                  folderChanges: {
                    ...s.folderChanges,
                    [id]: {
                      ...s.folderChanges[id],
                      serverFolder: saved.folder,
                    },
                  },
                }));
              continue;
            }
            remote.set(id, saved.folder);
            set((s) => {
              const changes = { ...s.folderChanges };
              if (changes[id]?.revision === change.revision) delete changes[id];
              else if (changes[id])
                changes[id] = {
                  ...changes[id],
                  baseVersion: saved.folder.version,
                };
              return {
                folderChanges: changes,
                folderDeletionQueue: s.folderDeletionQueue.map((command) =>
                  command.id === id
                    ? { ...command, baseVersion: saved.folder.version }
                    : command,
                ),
              };
            });
          }
          if (!current())
            return { success: false, message: "La sesión cambió." };
          set((s) => {
            const pending = s.folders.filter(
              (f) => s.folderChanges[f.id] && !deleted.has(f.id),
            );
            const hiddenDeletes = new Set(
              s.folderDeletionQueue.map((c) => c.id),
            );
            const folders = [
              ...pending,
              ...[...remote.values()].filter(
                (f) =>
                  !pending.some((p) => p.id === f.id) &&
                  !hiddenDeletes.has(f.id),
              ),
            ];
            const changes = Object.fromEntries(
              Object.entries(s.folderChanges).filter(
                ([id]) => !deleted.has(id),
              ),
            );
            return {
              folders,
              folderChanges: changes,
              activeFolderId: folders.some((f) => f.id === s.activeFolderId)
                ? s.activeFolderId
                : null,
              folderSyncFeedback:
                failures || Object.values(changes).some((c) => c.serverFolder)
                  ? `${failures} carpeta(s) pendientes: hay cambios o permisos distintos. Sincroniza y revisa.`
                  : null,
            };
          });
          return {
            success: failures === 0,
            message: failures
              ? get().folderSyncFeedback!
              : "Carpetas sincronizadas.",
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "No se pudieron sincronizar las carpetas.";
          if (current()) set({ folderSyncFeedback: message });
          return { success: false, message };
        }
      })().finally(() => {
        if (running?.promise !== promise) return;
        const rerun = running.rerun;
        running = null;
        // Repeat only when local edits arrived during this successful pass; errors require review.
        if (rerun && current() && !get().folderSyncFeedback)
          queueMicrotask(() => {
            if (current()) void get().syncFoldersWithServer();
          });
      });
      running = { generation, promise, rerun: false };
      return promise;
    },
  };
};
