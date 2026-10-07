import { SimulationSlice, CompanyProfileSlice } from '../types';
import { CompanyProfile, DEFAULT_LOCAL_COMPANY, DEFAULT_LOCAL_USER } from '../../types';
import { normalizeCompanyProfiles } from '../persistence/companyProfiles';

export const createCompanyProfileSlice: SimulationSlice<CompanyProfileSlice> = (set, get) => ({
  companies: [{ ...DEFAULT_LOCAL_COMPANY }], activeCompanyId: DEFAULT_LOCAL_COMPANY.id, localUserProfile: { ...DEFAULT_LOCAL_USER },
  addCompany: data => {
    const id = data.id && !get().companies.some(c => c.id === data.id) ? data.id : `comp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const company: CompanyProfile = { ...data, id, createdAt: now, updatedAt: now };
    set(state => ({ companies: normalizeCompanyProfiles([...state.companies.map(c => data.isDefault ? { ...c, isDefault: false } : c), company]), ...(data.isDefault ? { activeCompanyId: id, localUserProfile: { ...state.localUserProfile, activeCompanyId: id } } : {}) }));
    return id;
  },
  updateCompany: (id, partial) => set(state => {
    if (!state.companies.some(c => c.id === id)) return {};
    return { companies: normalizeCompanyProfiles(state.companies.map(c => c.id === id ? { ...c, ...partial, id: c.id, createdAt: c.createdAt, updatedAt: new Date().toISOString() } : partial.isDefault ? { ...c, isDefault: false } : c)) };
  }),
  deleteCompany: id => set(state => {
    if (state.companies.length <= 1 || !state.companies.some(c => c.id === id)) return {};
    const companies = normalizeCompanyProfiles(state.companies.filter(c => c.id !== id));
    const activeCompanyId = state.activeCompanyId === id ? companies.find(c => c.isDefault)!.id : state.activeCompanyId;
    return { companies, activeCompanyId, localUserProfile: { ...state.localUserProfile, activeCompanyId } };
  }),
  setActiveCompany: id => set(state => state.companies.some(c => c.id === id) ? { activeCompanyId: id, localUserProfile: { ...state.localUserProfile, activeCompanyId: id } } : {}),
  updateLocalUserProfile: partial => set(state => ({ localUserProfile: { ...state.localUserProfile, ...partial, activeCompanyId: partial.activeCompanyId && state.companies.some(c => c.id === partial.activeCompanyId) ? partial.activeCompanyId : state.activeCompanyId } })),
  getActiveCompany: () => get().companies.find(c => c.id === get().activeCompanyId) || get().companies[0] || DEFAULT_LOCAL_COMPANY,
});
