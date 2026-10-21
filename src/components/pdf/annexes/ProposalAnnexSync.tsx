import React, { useEffect, useRef } from 'react';
import type { ProjectSimulation } from '../../../types';
import { canWrite } from '../../../../shared/permissions';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { applyAnnexPlan, planDatasheetAnnexes, workspaceCatalog } from '../../../utils/proposalAnnexes';
import { resolveProposalAttachmentBytes } from '../../../services/proposalAttachmentResolver';
import { PDFMergeService } from '../../../services/pdfMergeService';

export interface ProposalAnnexSyncProps {
  project: ProjectSimulation;
}

/**
 * Keeps the catalog datasheets of the proposal's equipment attached as PDF annexes (utils/proposalAnnexes),
 * when the PDF view opens and whenever the equipment, the catalog or the dismissed list change. Readers,
 * proposals in the trash and proposals in sync conflict are left untouched. Renders nothing.
 */
export const ProposalAnnexSync: React.FC<ProposalAnnexSyncProps> = ({ project }) => {
  const live = useSimulationStore((state) => state.projects.find((p) => p.id === project.id)) ?? project;
  const catalog = useSimulationStore((state) => state.equipmentCatalog);
  const serverUrl = useSimulationStore((state) => state.syncSettings.serverUrl);
  const user = useSimulationStore((state) => state.syncSettings.currentUser);
  const sessionGeneration = useSimulationStore((state) => state.sessionGeneration);
  const allowed = canWrite(user) && !live.isDeleted && live.syncStatus !== 'conflict';
  const attachedPdfs = live.customization?.attachedPdfs;
  const dismissed = live.customization?.dismissedDatasheetKeys;
  const counted = useRef(new Set<string>());

  const isTarget = () => {
    const state = useSimulationStore.getState();
    const current = state.projects.find((p) => p.id === live.id);
    return state.activeProjectId === live.id && state.sessionGeneration === sessionGeneration && !!current && !current.isDeleted;
  };

  useEffect(() => {
    if (!allowed || !isTarget()) return;
    const plan = planDatasheetAnnexes(live, workspaceCatalog(catalog, serverUrl, user?.organizationId));
    const result = applyAnnexPlan(live.customization ?? {}, plan, new Date().toISOString());
    if (result.changed) useSimulationStore.getState().updateDocumentCustomization({ attachedPdfs: result.attachedPdfs });
  }, [allowed, live.id, live.specs, attachedPdfs, dismissed, catalog, serverUrl, user?.organizationId, sessionGeneration]);

  // Page count and size of new automatic annexes, once their bytes reach this device.
  useEffect(() => {
    if (!allowed) return;
    // Keyed by id and creation time: a dismissed annex that is restored later is counted again.
    const attempt = (att: { id: string; uploadedAt: string }) => `${att.id}|${att.uploadedAt}`;
    const pending = (attachedPdfs ?? []).filter((att) => att.origin === 'catalog' && att.pageCountPending && !counted.current.has(attempt(att)));
    if (!pending.length) return;
    let cancelled = false;
    void (async () => {
      for (const annex of pending) {
        if (cancelled) return;
        counted.current.add(attempt(annex));
        const bytes = await resolveProposalAttachmentBytes(annex);
        // A newer run takes over; this annex is still pending for it. A failure is not retried until remount.
        if (cancelled) { counted.current.delete(attempt(annex)); return; }
        if (!bytes) continue;
        const pageCount = await PDFMergeService.getPdfPageCount(bytes.slice(0)).catch(() => 1);
        if (cancelled) { counted.current.delete(attempt(annex)); return; }
        if (!isTarget()) return;
        const latest = useSimulationStore.getState().projects.find((p) => p.id === live.id)?.customization?.attachedPdfs ?? [];
        if (!latest.some((att) => att.id === annex.id && att.pageCountPending)) continue;
        useSimulationStore.getState().updateDocumentCustomization({
          attachedPdfs: latest.map((att) => (att.id === annex.id ? { ...att, pageCount: Math.max(1, pageCount), fileSize: bytes.byteLength, pageCountPending: false } : att)),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, live.id, attachedPdfs]);

  return null;
};
