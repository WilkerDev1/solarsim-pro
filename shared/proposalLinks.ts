/** Visual relationships only: never merge proposal content, folders or commercial decisions. */
export interface ProposalLink {
  parentId: string | null;
  color?: string;
}
export const PROPOSAL_GROUP_COLORS = [
  "#087b58",
  "#2563b8",
  "#8852b5",
  "#bb6320",
  "#b53660",
  "#397b87",
] as const;
export function isProposalLink(value: unknown): value is ProposalLink {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const link = value as ProposalLink;
  return (
    (link.parentId === null ||
      (typeof link.parentId === "string" &&
        link.parentId.length > 0 &&
        link.parentId.length <= 128)) &&
    (link.color === undefined || /^#[0-9a-f]{6}$/i.test(link.color))
  );
}
export function proposalGroupColor(id: string) {
  let hash = 0;
  for (const letter of id) hash = (hash * 31 + letter.charCodeAt(0)) | 0;
  return PROPOSAL_GROUP_COLORS[Math.abs(hash) % PROPOSAL_GROUP_COLORS.length];
}
