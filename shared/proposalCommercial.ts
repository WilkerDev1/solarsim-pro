/** Commercial decision, independent of Draft/Final/Archived and cloud sync status. */
export const PROPOSAL_DECISIONS = {
  pending: "En espera de aprobación",
  approved: "Aprobada",
  rejected: "Rechazada",
  test: "De prueba",
} as const;
export type ProposalDecision = keyof typeof PROPOSAL_DECISIONS;
export interface ProposalCommercialReport {
  id: string;
  projectId: string;
  status: ProposalDecision;
  note: string;
  ownerId?: string;
  ownerName?: string;
  createdAt: string;
  createdById?: string;
  createdByName?: string;
}
export type ProposalReportInput = Pick<
  ProposalCommercialReport,
  "status" | "note" | "ownerId" | "ownerName"
>;
export interface ProposalCommercial {
  reports?: ProposalCommercialReport[];
  status: ProposalDecision;
  note: string;
  ownerId?: string;
  ownerName?: string;
  updatedAt?: string;
  updatedById?: string;
  updatedByName?: string;
}
export type ProposalCommercialPatch = Partial<
  Pick<ProposalCommercial, "status" | "note" | "ownerId" | "ownerName">
>;
export function isProposalCommercial(
  value: unknown,
): value is ProposalCommercial {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.reports === undefined ||
      (Array.isArray(record.reports) &&
        record.reports.length <= 500 &&
        record.reports.every(isProposalCommercialReport) &&
        new Set(record.reports.map((report) => report.id)).size ===
          record.reports.length)) &&
    typeof record.status === "string" &&
    Object.hasOwn(PROPOSAL_DECISIONS, record.status) &&
    typeof record.note === "string" &&
    record.note.length <= 4000 &&
    ["ownerId", "ownerName", "updatedAt", "updatedById", "updatedByName"].every(
      (key) =>
        record[key] === undefined ||
        (typeof record[key] === "string" &&
          (record[key] as string).length <= (key.endsWith("Id") ? 128 : 255)),
    )
  );
}
export function commercialState(project: {
  commercial?: ProposalCommercial;
  authorId?: string;
  authorName?: string;
}): ProposalCommercial {
  return project.commercial && isProposalCommercial(project.commercial)
    ? project.commercial
    : {
        status: "pending",
        note: "",
        ownerId: project.authorId,
        ownerName: project.authorName,
      };
}
export function isProposalCommercialReport(
  value: unknown,
): value is ProposalCommercialReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as ProposalCommercialReport;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    row.id.length <= 160 &&
    typeof row.projectId === "string" &&
    row.projectId.length > 0 &&
    row.projectId.length <= 128 &&
    typeof row.status === "string" &&
    Object.hasOwn(PROPOSAL_DECISIONS, row.status) &&
    typeof row.note === "string" &&
    row.note.trim().length > 0 &&
    row.note.length <= 4000 &&
    typeof row.createdAt === "string" &&
    Number.isFinite(Date.parse(row.createdAt)) &&
    ["ownerId", "ownerName", "createdById", "createdByName"].every((key) => {
      const field = (row as unknown as Record<string, unknown>)[key];
      return (
        field === undefined ||
        (typeof field === "string" && field.length <= 255)
      );
    })
  );
}
export function reportContent(row: ProposalCommercialReport) {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    note: row.note,
    ownerId: row.ownerId || "",
    ownerName: row.ownerName || "",
  };
}
export function commercialContent(value: ProposalCommercial) {
  return {
    reports: (value.reports || [])
      .map(reportContent)
      .sort((a, b) => a.id.localeCompare(b.id)),
    status: value.status,
    note: value.note,
    ownerId: value.ownerId || "",
    ownerName: value.ownerName || "",
  };
}

export function commercialCopy(
  project: { commercial?: ProposalCommercial },
  owner?: { id?: string; name?: string },
): ProposalCommercial {
  return {
    status: project.commercial?.status === "test" ? "test" : "pending",
    note: "",
    ownerId: owner?.id,
    ownerName: owner?.name,
  };
}
