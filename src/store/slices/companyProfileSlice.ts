import { SimulationSlice, CompanyProfileSlice } from '../types';
import { CompanyProfile, DEFAULT_LOCAL_COMPANY, DEFAULT_LOCAL_USER, LocalUserProfile } from '../../types';

export const createCompanyProfileSlice: SimulationSlice<CompanyProfileSlice> = (set, get) => ({
  companies: [DEFAULT_LOCAL_COMPANY],
  activeCompanyId: DEFAULT_LOCAL_COMPANY.id,
  localUserProfile: DEFAULT_LOCAL_USER,

  addCompany: (companyData) => {
    const id = companyData.id || `comp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newCompany: CompanyProfile = {
      ...companyData,
      id,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => {
      const companies = [...state.companies, newCompany];
      // If marked as default or first, set active
      const activeCompanyId = companyData.isDefault ? id : state.activeCompanyId;
      return { companies, activeCompanyId };
    });

    return id;
  },

  updateCompany: (id, partial) => {
    const now = new Date().toISOString();
    set((state) => ({
      companies: state.companies.map((c) => {
        if (c.id !== id) {
          // If this partial sets isDefault = true, unset others
          if (partial.isDefault) {
            return { ...c, isDefault: false };
          }
          return c;
        }
        return {
          ...c,
          ...partial,
          updatedAt: now,
        };
      }),
    }));
  },

  deleteCompany: (id) => {
    set((state) => {
      if (state.companies.length <= 1) return state; // Never delete last company
      const filtered = state.companies.filter((c) => c.id !== id);
      let nextActiveId = state.activeCompanyId;
      if (state.activeCompanyId === id) {
        nextActiveId = filtered[0]?.id || DEFAULT_LOCAL_COMPANY.id;
      }
      return {
        companies: filtered,
        activeCompanyId: nextActiveId,
      };
    });
  },

  setActiveCompany: (id) => {
    set((state) => {
      const exists = state.companies.some((c) => c.id === id);
      if (!exists) return state;
      return {
        activeCompanyId: id,
        localUserProfile: {
          ...state.localUserProfile,
          activeCompanyId: id,
        },
      };
    });
  },

  updateLocalUserProfile: (partial) => {
    set((state) => ({
      localUserProfile: {
        ...state.localUserProfile,
        ...partial,
      },
    }));
  },

  getActiveCompany: () => {
    const { companies, activeCompanyId } = get();
    return companies.find((c) => c.id === activeCompanyId) || companies[0] || DEFAULT_LOCAL_COMPANY;
  },
});
