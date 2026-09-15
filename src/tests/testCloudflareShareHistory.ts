import {
  ShareProposalService,
  SharedProposalRecord,
  DEFAULT_WORKER_URL,
  STORAGE_SHARED_HISTORY_KEY,
} from '../services/shareProposalService';

// Polyfill localStorage para entorno Node si no está disponible
if (typeof localStorage === 'undefined' || !localStorage.getItem) {
  const store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] || null,
  };
}

console.log('=====================================================');
console.log('🧪 RUNNING CLOUDFLARE SHARE HISTORY TEST SUITE');
console.log('=====================================================\n');

// Limpiar estado inicial
localStorage.clear();

// --- TEST 1: Default Worker URL and Custom URL ---
console.log('--- TEST 1: Worker URL Management ---');
const defaultUrl = ShareProposalService.getWorkerUrl();
console.log(`Default Worker URL: "${defaultUrl}"`);
if (defaultUrl !== DEFAULT_WORKER_URL) {
  throw new Error(`❌ Expected default URL "${DEFAULT_WORKER_URL}", got "${defaultUrl}"`);
}

const customTestUrl = 'https://custom-worker.solarsim.dev/';
ShareProposalService.setWorkerUrl(customTestUrl);
const sanitizedUrl = ShareProposalService.getWorkerUrl();
console.log(`Custom Worker URL (sanitized): "${sanitizedUrl}"`);
if (sanitizedUrl !== 'https://custom-worker.solarsim.dev') {
  throw new Error(`❌ Expected trailing slash to be removed, got "${sanitizedUrl}"`);
}

// Restablecer
ShareProposalService.setWorkerUrl('');
if (ShareProposalService.getWorkerUrl() !== DEFAULT_WORKER_URL) {
  throw new Error('❌ Clearing worker URL should revert to DEFAULT_WORKER_URL');
}
console.log(' ✅ PASS: Configuración y normalización de URL de Worker correcta\n');

// --- TEST 2: Save and Retrieve Shared Records ---
console.log('--- TEST 2: Save and Retrieve Shared History Records ---');
const now = new Date();
const sampleRecord1: SharedProposalRecord = {
  id: 'prop-abc1',
  projectId: 'proj-101',
  projectCode: 'SP-2026-101-V1',
  quoteNumber: 'C-0001',
  clientName: 'Residencial Juan Bosch',
  companyName: 'Constructora Bisonó',
  location: 'Santo Domingo Este, RD',
  systemKWp: 12.3,
  shareUrl: 'https://propuesta.electsun.net/p/prop-abc1',
  createdAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 7 * 86400 * 1000).toISOString(),
  validityDays: 7,
  workerUrl: DEFAULT_WORKER_URL,
};

const sampleRecord2: SharedProposalRecord = {
  id: 'prop-xyz2',
  projectId: 'proj-102',
  projectCode: 'SP-2026-102-V1',
  quoteNumber: 'C-0002',
  clientName: 'Ing. Carlos Gómez',
  location: 'Santiago, RD',
  systemKWp: 8.5,
  shareUrl: 'https://propuesta.electsun.net/p/prop-xyz2',
  createdAt: new Date(now.getTime() - 2 * 86400 * 1000).toISOString(),
  expiresAt: new Date(now.getTime() + 5 * 86400 * 1000).toISOString(),
  validityDays: 7,
  workerUrl: DEFAULT_WORKER_URL,
};

ShareProposalService.saveSharedRecord(sampleRecord1);
ShareProposalService.saveSharedRecord(sampleRecord2);

const retrievedHistory = ShareProposalService.getSharedHistory();
console.log(`History count: ${retrievedHistory.length}`);

if (retrievedHistory.length !== 2) {
  throw new Error(`❌ Expected 2 history records, got ${retrievedHistory.length}`);
}

const found1 = retrievedHistory.find((r) => r.id === 'prop-abc1');
if (!found1 || found1.clientName !== 'Residencial Juan Bosch' || found1.systemKWp !== 12.3) {
  throw new Error('❌ Failed to retrieve sampleRecord1 correctly');
}

console.log(' ✅ PASS: Guardado y recuperación de propuestas compartidas verificado\n');

// --- TEST 3: Remaining Time Calculation for Active Proposals ---
console.log('--- TEST 3: Remaining Time Calculation (Active Proposals) ---');
const activeCreated = new Date(now.getTime() - 1 * 86400 * 1000).toISOString();
const activeExpires = new Date(now.getTime() + 6 * 86400 * 1000).toISOString();

const activeTimeInfo = ShareProposalService.getRemainingTime(activeCreated, activeExpires);
console.log(`Active proposal timeInfo:`, activeTimeInfo);

if (activeTimeInfo.isExpired) {
  throw new Error('❌ Expected proposal to be active (isExpired: false)');
}

if (activeTimeInfo.days < 5 || activeTimeInfo.days > 6) {
  throw new Error(`❌ Expected approximately 5-6 days remaining, got ${activeTimeInfo.days}`);
}

if (!activeTimeInfo.formattedText.includes('restantes')) {
  throw new Error(`❌ Expected formattedText to include "restantes", got "${activeTimeInfo.formattedText}"`);
}

if (activeTimeInfo.color !== 'emerald') {
  throw new Error(`❌ Expected color "emerald" for >3 days remaining, got "${activeTimeInfo.color}"`);
}

console.log(' ✅ PASS: Cálculo de tiempo restante activo verificado\n');

// --- TEST 4: Remaining Time Calculation for Expired Proposals ---
console.log('--- TEST 4: Remaining Time Calculation (Expired Proposals) ---');
const expiredCreated = new Date(now.getTime() - 10 * 86400 * 1000).toISOString();
const expiredExpires = new Date(now.getTime() - 3 * 86400 * 1000).toISOString();

const expiredTimeInfo = ShareProposalService.getRemainingTime(expiredCreated, expiredExpires);
console.log(`Expired proposal timeInfo:`, expiredTimeInfo);

if (!expiredTimeInfo.isExpired) {
  throw new Error('❌ Expected proposal to be expired (isExpired: true)');
}

if (expiredTimeInfo.formattedText !== 'Expirado') {
  throw new Error(`❌ Expected formattedText "Expirado", got "${expiredTimeInfo.formattedText}"`);
}

if (expiredTimeInfo.percentRemaining !== 0) {
  throw new Error(`❌ Expected percentRemaining to be 0 for expired proposal, got ${expiredTimeInfo.percentRemaining}`);
}

if (expiredTimeInfo.color !== 'rose') {
  throw new Error(`❌ Expected color "rose" for expired proposal, got "${expiredTimeInfo.color}"`);
}

console.log(' ✅ PASS: Detección y formato de propuestas expiradas verificado\n');

// --- TEST 5: Auto-migration of Legacy solarsim_last_share_* Keys ---
console.log('--- TEST 5: Auto-migration of Legacy localStorage Keys ---');
// Inyectar una clave antigua en localStorage
const legacyProjectId = 'proj-legacy-999';
localStorage.setItem(
  `solarsim_last_share_${legacyProjectId}`,
  JSON.stringify({
    id: 'legacy-hash-777',
    shareUrl: 'https://propuesta.electsun.net/p/legacy-hash-777',
    expiresAt: new Date(now.getTime() + 4 * 86400 * 1000).toISOString(),
    validityDays: 7,
    savedAt: new Date().toISOString(),
    clientName: 'Cliente Migrado Automático',
    projectCode: 'SP-2026-099-V1',
    quoteNumber: 'C-0099',
    systemKWp: 15.0,
  })
);

// getSharedHistory debe auto-detectar e importar esta clave
const migratedHistory = ShareProposalService.getSharedHistory();
console.log(`History count after legacy key insertion: ${migratedHistory.length}`);

const foundLegacy = migratedHistory.find((r) => r.id === 'legacy-hash-777');
if (!foundLegacy) {
  throw new Error('❌ Legacy key was not auto-migrated into shared history');
}

if (foundLegacy.clientName !== 'Cliente Migrado Automático') {
  throw new Error(`❌ Expected clientName "Cliente Migrado Automático", got "${foundLegacy.clientName}"`);
}

console.log(' ✅ PASS: Auto-migración de registros previos realizada con éxito\n');

// --- TEST 6: Record Deletion and Clear Expired Records ---
console.log('--- TEST 6: Record Deletion and Purge of Expired Proposals ---');
// Añadir un registro ya vencido
const expiredRecord: SharedProposalRecord = {
  id: 'prop-expired-99',
  projectId: 'proj-exp',
  projectCode: 'SP-2026-EXP',
  quoteNumber: 'C-EXP',
  clientName: 'Cliente Antiguo Vencido',
  systemKWp: 5.0,
  shareUrl: 'https://propuesta.electsun.net/p/prop-expired-99',
  createdAt: new Date(now.getTime() - 15 * 86400 * 1000).toISOString(),
  expiresAt: new Date(now.getTime() - 8 * 86400 * 1000).toISOString(),
  validityDays: 7,
  workerUrl: DEFAULT_WORKER_URL,
};
ShareProposalService.saveSharedRecord(expiredRecord);

const beforePurge = ShareProposalService.getSharedHistory();
console.log(`Count before purge: ${beforePurge.length}`);

const purgedCount = ShareProposalService.clearExpiredRecords();
console.log(`Purged count: ${purgedCount}`);
if (purgedCount < 1) {
  throw new Error('❌ Expected at least 1 expired record to be purged');
}

const afterPurge = ShareProposalService.getSharedHistory();
if (afterPurge.some((r) => r.id === 'prop-expired-99')) {
  throw new Error('❌ Expired record prop-expired-99 was not purged');
}

// Probar borrado individual
ShareProposalService.deleteSharedRecord('prop-abc1');
const finalHistory = ShareProposalService.getSharedHistory();
if (finalHistory.some((r) => r.id === 'prop-abc1')) {
  throw new Error('❌ Failed to delete record prop-abc1 individually');
}

console.log(' ✅ PASS: Eliminación individual y purga de expirados funcionando al 100%\n');

console.log('=====================================================');
console.log('🎉 ALL CLOUDFLARE SHARE HISTORY TESTS PASSED (100% SUCCESS)');
console.log('=====================================================\n');
