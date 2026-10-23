import { isAdminRole } from '../../../shared/permissions';
import { SimulationSlice, CompanyProfileSlice } from '../types';
import { CompanyProfile, DEFAULT_LOCAL_COMPANY, DEFAULT_LOCAL_USER } from '../../types';
import { CompanyService } from '../../services/companyService';
import { normalizeCompanyProfiles } from '../persistence/companyProfiles';

export const createCompanyProfileSlice: SimulationSlice<CompanyProfileSlice> = (set, get) => {
  let requestId = 0;
  const capture = () => {
    const { syncSettings, sessionGeneration } = get();
    return { ...syncSettings, isCurrent: () => {
      const current = get();
      return current.sessionGeneration === sessionGeneration && current.syncSettings.serverUrl === syncSettings.serverUrl && current.syncSettings.currentUser?.id === syncSettings.currentUser?.id && current.syncSettings.currentUser?.organizationId === syncSettings.currentUser?.organizationId && !!current.syncSettings.authToken;
    } };
  };
  const apply = (profile: Partial<CompanyProfile>, organizationId: string, version: number) => set(state => {
    const id = 'org-company:' + organizationId;
    const existing = state.companies.find(company => company.id === id);
    // The profile is versioned by the server: an already applied version would only bump updatedAt.
    if (existing?.organizationProfileVersion === version) return {};
    const first = !existing;
    const company: CompanyProfile = { ...DEFAULT_LOCAL_COMPANY, ...profile, id, organizationId, organizationProfileVersion: version, isDefault: first ? true : existing.isDefault, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const companies = normalizeCompanyProfiles([company, ...state.companies.filter(c => c.id !== id).map(c => first ? { ...c, isDefault: false } : c)]);
    return { companies, ...(first ? { activeCompanyId: id, localUserProfile: { ...state.localUserProfile, activeCompanyId: id } } : {}) };
  });
  return ({
  companies: [{ ...DEFAULT_LOCAL_COMPANY }], activeCompanyId: DEFAULT_LOCAL_COMPANY.id, localUserProfile: { ...DEFAULT_LOCAL_USER },
  addCompany: data => {
    const safeData = { ...data, organizationId: undefined, organizationProfileVersion: undefined };
    const id = data.id && !get().companies.some(c => c.id === data.id) ? data.id : `comp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const company: CompanyProfile = { ...safeData, id, createdAt: now, updatedAt: now };
    set(state => ({ companies: normalizeCompanyProfiles([...state.companies.map(c => data.isDefault ? { ...c, isDefault: false } : c), company]), ...(data.isDefault ? { activeCompanyId: id, localUserProfile: { ...state.localUserProfile, activeCompanyId: id } } : {}) }));
    return id;
  },
  updateCompany: (id, partial) => set(state => {
    if (!state.companies.some(c => c.id === id) || state.companies.find(c => c.id === id)?.organizationId) return {};
    return { companies: normalizeCompanyProfiles(state.companies.map(c => c.id === id ? { ...c, ...partial, organizationId: undefined, organizationProfileVersion: undefined, id: c.id, createdAt: c.createdAt, updatedAt: new Date().toISOString() } : partial.isDefault ? { ...c, isDefault: false } : c)) };
  }),
  deleteCompany: id => set(state => {
    if (state.companies.find(c => c.id === id)?.organizationId) return {};
    if (state.companies.length <= 1 || !state.companies.some(c => c.id === id)) return {};
    const companies = normalizeCompanyProfiles(state.companies.filter(c => c.id !== id));
    const activeCompanyId = state.activeCompanyId === id ? companies.find(c => c.isDefault)!.id : state.activeCompanyId;
    return { companies, activeCompanyId, localUserProfile: { ...state.localUserProfile, activeCompanyId } };
  }),
  setActiveCompany: id => set(state => state.companies.some(c => c.id === id) ? { activeCompanyId: id, localUserProfile: { ...state.localUserProfile, activeCompanyId: id } } : {}),
  updateLocalUserProfile: partial => set(state => ({ localUserProfile: { ...state.localUserProfile, ...partial, activeCompanyId: partial.activeCompanyId && state.companies.some(c => c.id === partial.activeCompanyId) ? partial.activeCompanyId : state.activeCompanyId } })),
  getActiveCompany: () => get().companies.find(c => c.id === get().activeCompanyId) || get().companies[0] || DEFAULT_LOCAL_COMPANY,
  syncOrganizationCompanyProfile: async () => {
    const session = capture();
    if (!session.authToken || !session.currentUser) return { success: false, error: 'Inicia sesión para sincronizar la empresa.' };
    const request = ++requestId;
    const result = await CompanyService.profile(session.serverUrl, session.authToken);
    if (!session.isCurrent() || request !== requestId) return { success: false, error: 'La sesión o solicitud cambió.' };
    if (!result.success || !result.profile || !Number.isSafeInteger(result.version) || result.organizationId !== session.currentUser.organizationId) return { success: false, error: result.error || 'Perfil de organización inválido.' };
    apply(result.profile, result.organizationId, result.version!);
    return { success: true };
  },
  saveOrganizationCompanyProfile: async (profile, baseVersion) => {
    const session = capture();
    if (!session.authToken || !session.currentUser || !isAdminRole(session.currentUser.role)) return { success: false, error: 'Solo ADMIN puede editar la empresa compartida.' };
    ++requestId;
    const result = await CompanyService.saveProfile(session.serverUrl, session.authToken, profile, baseVersion);
    if (!session.isCurrent()) return { success: false, error: 'La sesión cambió.' };
    if (!result.success || !result.profile || !Number.isSafeInteger(result.version) || result.organizationId !== session.currentUser.organizationId) return { success: false, error: result.error || 'No se pudo confirmar el perfil.' };
    ++requestId;
    apply(result.profile, result.organizationId, result.version!);
    return { success: true };
  },
});
};
