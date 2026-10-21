import type { AttachedPDFDocument, DocumentCustomization, ProjectSimulation } from '../types';
import type { SolarEquipmentItem } from '../types/equipment';
import { datasheetFileName, proposalDatasheets } from './proposalDatasheets';

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

/** Same id on every device, so two devices syncing one proposal never duplicate an annex. */
export function catalogAnnexId(key: string): string {
  return `att-catalog-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

type AnnexState = Pick<DocumentCustomization, 'attachedPdfs' | 'dismissedDatasheetKeys'>;

/** Reconciles the annex list with the plan. `changed: false` returns the same array (nothing to write). */
export function applyAnnexPlan(state: AnnexState, plan: PlannedDatasheetAnnex[], nowIso: string): { attachedPdfs: AttachedPDFDocument[]; changed: boolean } {
  const current = state.attachedPdfs ?? [];
  const dismissed = new Set(state.dismissedDatasheetKeys ?? []);
  const wanted = plan.filter((annex) => !dismissed.has(annex.key));
  const wantedKeys = new Set(wanted.map((annex) => annex.key));
  const kept = current.filter((att) => att.origin !== 'catalog' || (att.sourceDatasheetKey !== undefined && wantedKeys.has(att.sourceDatasheetKey)));
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
