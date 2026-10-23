import type { AttachedPDFDocument, DocumentCustomization, ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { datasheetFileName, proposalDatasheets } from './proposalDatasheets';
import { getProjectPanels, getProjectInverters, getProjectBatteries } from './equipmentSpecsUtils';
import { resolveGroupCatalogItem } from './equipmentGroups';

/**
 * Automatic datasheet annexes. Every equipment group in use (count > 0) whose catalog item has a PDF
 * datasheet stored on the server gets one enabled annex with `origin: 'catalog'`; variants sharing one
 * asset get a single annex. Annexes the user removed are remembered in `dismissedDatasheetKeys`, annexes
 * of equipment no longer in the proposal are dropped, and manual annexes are never touched.
 */
export interface PlannedDatasheetAnnex {
  key: string;
  assetId: string;
  catalogItemId: string;
  title: string;
  fileName: string;
}

export function planDatasheetAnnexes(project: ProjectSimulation, catalog: SolarEquipmentItem[]): PlannedDatasheetAnnex[] {
  return proposalDatasheets(project, catalog)
    .filter(({ key, item }) => item.datasheetAssetId === key)
    .map(({ key, item }) => ({
      key,
      assetId: key,
      catalogItemId: item.id,
      title: `Ficha técnica — ${item.displayName}`,
      fileName: datasheetFileName(item.displayName),
    }));
}

/** Catalog items visible in the current workspace (local items, or this server and organization). */
export function workspaceCatalog(catalog: SolarEquipmentItem[], serverUrl: string, organizationId?: string): SolarEquipmentItem[] {
  const server = serverUrl.replace(/\/+$/, '');
  return catalog.filter((item) =>
    (!item.organizationId || item.organizationId === organizationId) &&
    (!item.syncServerUrl || item.syncServerUrl.replace(/\/+$/, '') === server));
}

/**
 * Catalog item ids whose automatic annexes must be kept because some equipment in use (count > 0) is not
 * resolved in the catalog yet, typically a proposal pulled before the equipment catalog finished syncing.
 * The datasheet of an unresolved item is unknown, so it cannot be tied to one annex (variants share assets,
 * legacy groups have no catalogItemId): while anything in use is unresolved, every automatic annex is kept.
 * A group the user rewrote by hand (`manualModel`) is not pending: it will never resolve, so its old annex goes.
 * This is transient: once the catalog resolves everything, the exact plan applies again.
 */
export function unresolvedEquipmentIds(project: ProjectSimulation, catalog: SolarEquipmentItem[]): Set<string> {
  const groups = [
    ...getProjectPanels(project.specs).map((group) => ({ group, kind: 'panel' as const })),
    ...getProjectInverters(project.specs).map((group) => ({ group, kind: 'inverter' as const })),
    ...getProjectBatteries(project.specs).map((group) => ({ group, kind: 'battery' as const })),
  ];
  const unresolvedGroups = groups.filter(({ group, kind }) => group.count > 0 && !group.manualModel && !resolveGroupCatalogItem(group, kind, catalog));
  const ids = new Set<string>();
  if (!unresolvedGroups.length) return ids;
  // Catalog items a group was detached from by hand (stored explicitly), unless another group still uses them.
  const detached = new Set<string>();
  for (const { group } of groups) if (group.manualModel && group.detachedCatalogItemId) detached.add(group.detachedCatalogItemId);
  const inUse = new Set<string>();
  for (const { group, kind } of groups) {
    if (group.count <= 0) continue;
    const item = resolveGroupCatalogItem(group, kind, catalog);
    if (item) inUse.add(item.id);
    else if (!group.manualModel) [group.id, group.catalogItemId].forEach((id) => id && inUse.add(id));
  }
  for (const att of project.customization?.attachedPdfs ?? []) {
    if (att.origin !== 'catalog' || !att.catalogItemId) continue;
    if (detached.has(att.catalogItemId) && !inUse.has(att.catalogItemId)) continue;
    ids.add(att.catalogItemId);
  }
  return ids;
}

/** Same id on every device, so two devices syncing one proposal never duplicate an annex. */
export function catalogAnnexId(key: string): string {
  return `att-catalog-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

type AnnexState = Pick<DocumentCustomization, 'attachedPdfs' | 'dismissedDatasheetKeys'>;

/**
 * Reconciles the annex list with the plan. `changed: false` returns the same array (nothing to write).
 * `pendingItemIds` (see `unresolvedEquipmentIds`) protects automatic annexes whose equipment is still in use
 * but not resolved in the catalog: they are neither removed nor recreated, so their edits survive.
 */
export function applyAnnexPlan(
  state: AnnexState,
  plan: PlannedDatasheetAnnex[],
  nowIso: string,
  pendingItemIds: ReadonlySet<string>,
): { attachedPdfs: AttachedPDFDocument[]; changed: boolean } {
  const current = state.attachedPdfs ?? [];
  const dismissed = new Set(state.dismissedDatasheetKeys ?? []);
  const wanted = plan.filter((annex) => !dismissed.has(annex.key));
  const wantedKeys = new Set(wanted.map((annex) => annex.key));
  const kept = current.filter((att) => att.origin !== 'catalog'
    || (att.sourceDatasheetKey !== undefined && wantedKeys.has(att.sourceDatasheetKey))
    || (att.catalogItemId !== undefined && pendingItemIds.has(att.catalogItemId)));
  const present = new Set(kept.map((att) => att.sourceDatasheetKey).filter(Boolean));
  const additions: AttachedPDFDocument[] = wanted
    .filter((annex) => !present.has(annex.key))
    .map((annex) => ({
      id: catalogAnnexId(annex.key),
      origin: 'catalog',
      sourceDatasheetKey: annex.key,
      assetId: annex.assetId,
      catalogItemId: annex.catalogItemId,
      fileName: annex.fileName,
      fileSize: 0,
      pageCount: 1,
      pageCountPending: true,
      title: annex.title,
      uploadedAt: nowIso,
      enabled: true,
      addToTableOfContents: false,
    }));
  if (kept.length === current.length && !additions.length) return { attachedPdfs: current, changed: false };
  return { attachedPdfs: [...kept, ...additions], changed: true };
}

/** Removing an automatic annex dismisses its datasheet; removing a manual one only removes it. */
export function dismissAnnex(state: AnnexState, attachmentId: string): { attachedPdfs: AttachedPDFDocument[]; dismissedDatasheetKeys?: string[] } {
  const current = state.attachedPdfs ?? [];
  const target = current.find((att) => att.id === attachmentId);
  const attachedPdfs = current.filter((att) => att.id !== attachmentId);
  if (target?.origin !== 'catalog' || !target.sourceDatasheetKey) return { attachedPdfs };
  return { attachedPdfs, dismissedDatasheetKeys: [...new Set([...(state.dismissedDatasheetKeys ?? []), target.sourceDatasheetKey])] };
}

/** «Restaurar fichas»: the next sync re-adds every dismissed datasheet still in use. */
export function restoreDismissedAnnexes(): Partial<AnnexState> {
  return { dismissedDatasheetKeys: [] };
}
