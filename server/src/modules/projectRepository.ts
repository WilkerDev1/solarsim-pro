import type { PoolClient } from "pg";
import type { AuthUser } from "../dependencies.js";
export interface ProjectRow {
  id: string;
  organization_id: string;
  version: number;
  data_json: Record<string, any>;
  created_by_id: string;
  created_by_name: string;
  created_by_email: string;
  last_modified_by_name: string;
  updated_at: Date;
  created_at: Date;
  is_deleted: boolean;
  deleted_at: Date | null;
  deleted_by: string | null;
  system_capacity_kwp: number;
}
export function canonicalProject(row: ProjectRow) {
  return {
    ...row.data_json,
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    baseVersion: row.version,
    authorId: row.created_by_id,
    authorName: row.created_by_name,
    authorEmail: row.created_by_email,
    lastModifiedBy: row.last_modified_by_name,
    lastModifiedAt: row.updated_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    syncStatus: "synced",
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    deletedBy: row.deleted_by,
  };
}
export async function lockOrganization(
  client: PoolClient,
  organizationId: string,
) {
  // All project mutations and pull use this transaction lock, giving the returned delta cursor a coherent cut.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `solarsim-projects:${organizationId}`,
  ]);
}
export async function checkpoint(
  client: PoolClient,
  row: ProjectRow,
  label = `Versión v${row.version}`,
) {
  await client.query(
    `INSERT INTO project_version_history (id, project_id, version_number, label, notes, type, author_id, author_name, author_email, system_capacity_kwp, net_investment_usd, data_json) VALUES ($1,$2,$3,$4,$5,'auto',$6,$7,$8,$9,0,$10)`,
    [
      `snap-${crypto.randomUUID()}`,
      row.id,
      row.version,
      label,
      "Checkpoint previo a modificación",
      row.created_by_id,
      row.last_modified_by_name,
      row.created_by_email,
      row.system_capacity_kwp,
      JSON.stringify(canonicalProject(row)),
    ],
  );
}
export async function notify(
  client: PoolClient,
  user: AuthUser,
  project: Record<string, any>,
  action: string,
) {
  await client.query(
    `INSERT INTO team_notifications (id,organization_id,user_id,project_id,project_code,client_name,author_name,action,message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `notif-${crypto.randomUUID()}`,
      user.organizationId,
      user.id,
      project.id,
      project.client?.projectId ?? "",
      project.client?.name ?? "Cliente",
      user.name,
      action,
      `${user.name}: ${action.toLowerCase()} de propuesta ${project.client?.name ?? project.id}`,
    ],
  );
}
export async function saveProject(
  client: PoolClient,
  user: AuthUser,
  input: Record<string, any>,
  existing?: ProjectRow,
) {
  const version = existing ? existing.version + 1 : 1;
  // Server-controlled attribution cannot be supplied by a client and foreign company documents cannot be uploaded accidentally.
  const data = {
    ...input,
    id: input.id,
    organizationId: user.organizationId,
    version,
    baseVersion: version,
    authorId: existing?.created_by_id ?? user.id,
    authorName: existing?.created_by_name ?? user.name,
    authorEmail: existing?.created_by_email ?? user.email,
    lastModifiedBy: user.name,
    syncStatus: "synced",
  };
  delete (data as any).forceOverwrite;
  delete (data as any).forceNewVersion;
  const capacity = Array.isArray(input.specs?.panelGroups)
    ? input.specs.panelGroups.reduce(
        (sum: number, group: any) =>
          sum +
          ((Number(group.panelPowerW) || 0) * (Number(group.panelCount) || 0)) /
            1000,
        0,
      )
    : ((Number(input.specs?.panelPowerW) || 0) *
        (Number(input.specs?.panelCount) || 0)) /
      1000;
  const deleted = input.isDeleted === true;
  const deletedAt = deleted ? (existing?.deleted_at ?? new Date()) : null;
  if (existing) await checkpoint(client, existing);
  const result = existing
    ? await client.query<ProjectRow>(
        `UPDATE projects SET last_modified_by_id=$1,last_modified_by_name=$2,client_name=$3,project_code=$4,system_capacity_kwp=$5,version=$6,data_json=$7,is_deleted=$8,deleted_at=$9,deleted_by=$10,updated_at=clock_timestamp() WHERE id=$11 AND organization_id=$12 AND version=$13 RETURNING *`,
        [
          user.id,
          user.name,
          input.client?.name ?? "Cliente",
          input.client?.projectId ?? "",
          capacity,
          version,
          JSON.stringify(data),
          deleted,
          deletedAt,
          deleted ? user.name : null,
          input.id,
          user.organizationId,
          existing.version,
        ],
      )
    : await client.query<ProjectRow>(
        `INSERT INTO projects (id,organization_id,created_by_id,created_by_name,created_by_email,last_modified_by_id,last_modified_by_name,client_name,project_code,system_capacity_kwp,version,data_json,is_deleted,deleted_at,deleted_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$3,$4,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp(),clock_timestamp()) RETURNING *`,
        [
          input.id,
          user.organizationId,
          user.id,
          user.name,
          user.email,
          input.client?.name ?? "Cliente",
          input.client?.projectId ?? "",
          capacity,
          version,
          JSON.stringify(data),
          deleted,
          deletedAt,
          deleted ? user.name : null,
        ],
      );
  if (!result.rows.length)
    throw new Error("Concurrent project change rejected");
  const project = canonicalProject(result.rows[0]);
  await notify(client, user, project, existing ? "UPDATE" : "CREATE");
  return project;
}
export async function hardDelete(
  client: PoolClient,
  user: AuthUser,
  filter: "expired" | "trash" | "id",
  id?: string,
): Promise<string[]> {
  const condition =
    filter === "expired"
      ? "is_deleted = TRUE AND deleted_at < clock_timestamp() - INTERVAL '30 days'"
      : filter === "trash"
        ? "is_deleted = TRUE"
        : "id = $2";
  const params =
    filter === "id" ? [user.organizationId, id] : [user.organizationId];
  const deleted = await client.query<{ id: string }>(
    `WITH removed AS (DELETE FROM projects WHERE organization_id=$1 AND ${condition} RETURNING id,organization_id) INSERT INTO project_tombstones (id,organization_id,deleted_at) SELECT id,organization_id,clock_timestamp() FROM removed ON CONFLICT(id) DO UPDATE SET deleted_at=EXCLUDED.deleted_at RETURNING id`,
    params,
  );
  return deleted.rows.map((r) => r.id);
}
