import assert from 'node:assert/strict';
import { useSimulationStore as store } from '../store/useSimulationStore';
import { CompanyService } from '../services/companyService';
import { ELECTSUN_COMPANY_PROFILE } from '../services/electsunCompanyProfile';
import { companyDocumentCustomization } from '../utils/companyDocumentTemplate';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../constants/defaultDocumentCustomization';
import { companyDocumentSnapshot } from '../utils/companyDocumentSnapshot';

async function run() {
  const originalFetch = globalThis.fetch;
  const originalProfile = CompanyService.profile;
  const originalSave = CompanyService.saveProfile;
  globalThis.fetch = async () => { throw new Error('Real network forbidden'); };
  const settings = (org: string, role: 'ADMIN' | 'EDITOR' = 'ADMIN') => ({ ...store.getState().syncSettings, serverUrl: 'https://company-profile.invalid', authToken: 'synthetic-only', autoSyncEnabled: false, currentUser: { id: 'qa-user', name: 'QA', email: 'qa@example.test', role, organizationId: org } });
  try {
    store.getState().setSyncSettings(settings('org-a'));
    CompanyService.profile = async () => ({ success: true, organizationId: 'org-a', version: 1, profile: { name: 'Shared A', logoBase64: 'qa-logo', phone: 'QA-contact' } });
    assert.equal((await store.getState().syncOrganizationCompanyProfile()).success, true);
    const shared = store.getState().getActiveCompany();
    assert.equal(shared.name, 'Shared A');
    assert.equal(shared.organizationId, 'org-a');
    assert.equal(shared.organizationProfileVersion, 1);
    store.getState().updateCompany(shared.id, { name: 'Local overwrite' });
    store.getState().deleteCompany(shared.id);
    assert.equal(store.getState().getActiveCompany().name, 'Shared A');
    store.getState().createNewProject({ name: 'Snapshot client' });
    const project = store.getState().getActiveProject();
    assert.equal(project.customization?.companyName, 'Shared A');
    let saves = 0;
    CompanyService.saveProfile = async (_server, _token, profile, version) => {
      saves++;
      assert.equal(version, 1);
      return { success: true, organizationId: 'org-a', version: 2, profile };
    };
    assert.equal((await store.getState().saveOrganizationCompanyProfile({ name: 'New A' }, 1)).success, true);
    assert.equal(store.getState().getActiveCompany().name, 'New A');
    assert.equal(store.getState().getActiveProject().customization?.companyName, 'Shared A');
    store.getState().setSyncSettings(settings('org-a', 'EDITOR'));
    assert.equal((await store.getState().saveOrganizationCompanyProfile({ name: 'Denied' }, 2)).success, false);
    assert.equal(saves, 1);
    let resolve!: (value: any) => void;
    CompanyService.profile = () => new Promise(r => { resolve = r; });
    const pending = store.getState().syncOrganizationCompanyProfile();
    store.getState().setSyncSettings(settings('org-b'));
    resolve({ success: true, organizationId: 'org-a', version: 99, profile: { name: 'Late response' } });
    assert.equal((await pending).success, false);
    assert.ok(!store.getState().companies.some(c => c.organizationId === 'org-a'));
    CompanyService.profile = async () => ({ success: true, organizationId: 'org-a', version: 1, profile: { name: 'Wrong tenant' } });
    assert.equal((await store.getState().syncOrganizationCompanyProfile()).success, false);
    assert.ok(!store.getState().companies.some(c => c.name === 'Wrong tenant'));
    assert.equal(ELECTSUN_COMPANY_PROFILE.rncOrId, '');
    assert.equal(DEFAULT_DOCUMENT_CUSTOMIZATION.companyRnc, '');
    assert.equal(companyDocumentCustomization({ ...shared, rncOrId: '' }, DEFAULT_DOCUMENT_CUSTOMIZATION, { [shared.id]: { ...DEFAULT_DOCUMENT_CUSTOMIZATION, companyRnc: '1-31-12345-6' } }).companyRnc, '', 'Historical factory template cannot reintroduce sample RNC');
    assert.equal(companyDocumentCustomization({ ...shared, ...ELECTSUN_COMPANY_PROFILE }, DEFAULT_DOCUMENT_CUSTOMIZATION, {}).companyRnc, '', 'Empty legal ID cannot fall back to example data');
    assert.equal(companyDocumentSnapshot({ ...shared, ...ELECTSUN_COMPANY_PROFILE }).companySlogan, 'El sol a tu favor');
    assert.equal(companyDocumentSnapshot({ ...shared, ...ELECTSUN_COMPANY_PROFILE }).watermarkLogoBase64, ELECTSUN_COMPANY_PROFILE.watermarkLogoBase64);
    console.log('Organization company profile: shared identity, ADMIN CAS, snapshots and late-session isolation passed.');
  } finally {
    globalThis.fetch = originalFetch;
    CompanyService.profile = originalProfile;
    CompanyService.saveProfile = originalSave;
  }
}
run().catch(error => { console.error(error); process.exit(1); });
