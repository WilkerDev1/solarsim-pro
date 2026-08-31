import { ProjectSimulation } from '../types';

export const INITIAL_PROJECTS: ProjectSimulation[] = [];

export function generateNextProjectSequence(
  existingProjects: ProjectSimulation[],
  targetYear?: number
): { projectId: string; quoteNumber: string } {
  const currentYear = targetYear || new Date().getFullYear();
  let maxSeq = 0;

  for (const p of existingProjects) {
    if (!p.client) continue;

    if (p.client.projectId) {
      const match = p.client.projectId.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }

    if (p.client.quoteNumber) {
      const match = p.client.quoteNumber.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  const nextNum = maxSeq + 1;
  const formattedProj = `SP-${currentYear}-${nextNum.toString().padStart(3, '0')}`;
  const formattedQuote = `C-${nextNum.toString().padStart(4, '0')}`;

  return {
    projectId: formattedProj,
    quoteNumber: formattedQuote,
  };
}

export function generateDuplicateProjectIdentifiers(
  target: ProjectSimulation,
  existingProjects: ProjectSimulation[]
): { cleanName: string; projectId: string; quoteNumber: string; versionSuffix: string } {
  const rawName = target.client?.name || 'Cliente';
  const cleanName = rawName.replace(/\s*\((?:Copia|Copia Importada|COPIA|V\d+|C\d+)\)\s*/gi, '').trim();

  const rawProjId = target.client?.projectId || 'SP-2026-001';
  const baseProjId = rawProjId.replace(/-(?:V|C)\d+$/i, '').trim();

  const rawQuote = target.client?.quoteNumber || 'C-0001';
  const baseQuote = rawQuote.replace(/-(?:V|C)\d+$/i, '').trim();

  let maxVersion = 1;
  for (const p of existingProjects) {
    if (!p.client?.projectId) continue;
    if (p.client.projectId.startsWith(baseProjId)) {
      const match = p.client.projectId.match(/-(?:V|C)(\d+)$/i);
      if (match) {
        const v = parseInt(match[1], 10);
        if (!isNaN(v) && v > maxVersion) {
          maxVersion = v;
        }
      }
    }
    if (p.client?.quoteNumber && p.client.quoteNumber.startsWith(baseQuote)) {
      const matchQ = p.client.quoteNumber.match(/-(?:V|C)(\d+)$/i);
      if (matchQ) {
        const vq = parseInt(matchQ[1], 10);
        if (!isNaN(vq) && vq > maxVersion) {
          maxVersion = vq;
        }
      }
    }
  }

  const nextVersion = maxVersion + 1;
  const versionSuffix = `-V${nextVersion}`;
  const newProjectId = `${baseProjId}${versionSuffix}`;
  const newQuoteNumber = `${baseQuote}${versionSuffix}`;

  return {
    cleanName,
    projectId: newProjectId,
    quoteNumber: newQuoteNumber,
    versionSuffix,
  };
}

export function findDuplicateProjectInfo(
  projectId: string,
  quoteNumber: string,
  currentInternalId: string,
  projects: ProjectSimulation[]
): { isProjectIdDuplicate: boolean; isQuoteDuplicate: boolean; duplicateProjectName?: string } {
  const normalizedProjId = projectId?.trim().toLowerCase();
  const normalizedQuote = quoteNumber?.trim().toLowerCase();

  let isProjectIdDuplicate = false;
  let isQuoteDuplicate = false;
  let duplicateProjectName: string | undefined;

  for (const p of projects) {
    if (p.id === currentInternalId) continue;

    if (normalizedProjId && p.client?.projectId?.trim().toLowerCase() === normalizedProjId) {
      isProjectIdDuplicate = true;
      duplicateProjectName = p.client.name;
    }
    if (normalizedQuote && p.client?.quoteNumber?.trim().toLowerCase() === normalizedQuote) {
      isQuoteDuplicate = true;
      if (!duplicateProjectName) duplicateProjectName = p.client.name;
    }
  }

  return { isProjectIdDuplicate, isQuoteDuplicate, duplicateProjectName };
}
