import React, { useEffect, useRef, useState } from 'react';
import type { ProjectSimulation } from '../../../types';
import { canWrite } from '../../../../shared/permissions';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { applyAnnexPlan, planDatasheetAnnexes, unresolvedEquipmentIds, workspaceCatalog } from '../../../utils/proposalAnnexes';
import { resolveProposalAttachmentBytes } from '../../../services/proposalAttachmentResolver';
import { PDFMergeService } from '../../../services/pdfMergeService';
import { annexAttemptKey, annexesToCount, releaseFailedAttempt } from '../../../utils/annexPageCountAttempts';

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
  // Bumped when connectivity returns so annexes whose bytes failed to load are tried again.
  const [onlineTick, setOnlineTick] = useState(0);
  useEffect(() => {
    const onOnline = () => setOnlineTick((tick) => tick + 1);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const isTarget = () => {
    const state = useSimulationStore.getState();
    const current = state.projects.find((p) => p.id === live.id);
    return state.activeProjectId === live.id && state.sessionGeneration === sessionGeneration && !!current && !current.isDeleted;
  };

  useEffect(() => {
    if (!allowed || !isTarget()) return;
    const visible = workspaceCatalog(catalog, serverUrl, user?.organizationId);
    const plan = planDatasheetAnnexes(live, visible);
    // Equipment still missing from the catalog (it may be mid-sync) keeps its annex until the proposal stops using it.
    const result = applyAnnexPlan(live.customization ?? {}, plan, new Date().toISOString(), unresolvedEquipmentIds(live, visible));
    if (result.changed) useSimulationStore.getState().updateDocumentCustomization({ attachedPdfs: result.attachedPdfs });
  }, [allowed, live.id, live.specs, attachedPdfs, dismissed, catalog, serverUrl, user?.organizationId, sessionGeneration]);

  // Page count and size of new automatic annexes, once their bytes reach this device.
  useEffect(() => {
    if (!allowed) return;
    const attempt = annexAttemptKey;
    const pending = annexesToCount(attachedPdfs, counted.current);
    if (!pending.length) return;
    let cancelled = false;
    const started = new Set<string>();
    void (async () => {
      for (const annex of pending) {
        if (cancelled) return;
        started.add(attempt(annex));
        counted.current.add(attempt(annex));
        const bytes = await resolveProposalAttachmentBytes(annex);
        if (cancelled) return;
        if (!bytes) { started.delete(attempt(annex)); releaseFailedAttempt(counted.current, annex); continue; } // retried on catalog/attachment change or when back online
        const pageCount = await PDFMergeService.getPdfPageCount(bytes.slice(0)).catch(() => 1);
        if (cancelled) return;
        started.delete(attempt(annex));
        if (!isTarget()) return;
        const latest = useSimulationStore.getState().projects.find((p) => p.id === live.id)?.customization?.attachedPdfs ?? [];
        if (!latest.some((att) => att.id === annex.id && att.pageCountPending)) continue;
        useSimulationStore.getState().updateDocumentCustomization({
          attachedPdfs: latest.map((att) => (att.id === annex.id ? { ...att, pageCount: Math.max(1, pageCount), fileSize: bytes.byteLength, pageCountPending: false } : att)),
        });
      }
    })();
    // A cancelled run hands its unfinished annexes to the next run, which starts right after this cleanup.
    return () => { cancelled = true; started.forEach((key) => counted.current.delete(key)); };
  }, [allowed, live.id, attachedPdfs, catalog, onlineTick]);

  return null;
};
