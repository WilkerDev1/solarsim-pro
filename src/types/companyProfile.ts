export interface CompanyProfile {
  id: string;
  dataVersion?: number;
  name: string;
  commercialName?: string;
  rncOrId: string;
  phone: string;
  email: string;
  address: string;
  website?: string;
  logoBase64?: string;
  signatureSealBase64?: string;
  primaryColor?: string;
  accentColor?: string;
  defaultPaymentTerms?: string;
  defaultWarrantyNotes?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalUserProfile {
  name: string;
  email: string;
  roleTitle: string;
  phone?: string;
  avatarBase64?: string;
  activeCompanyId?: string;
}

export const DEFAULT_LOCAL_COMPANY: CompanyProfile = {
  id: 'comp-default-rd',
  dataVersion: 1,
  name: 'Mi empresa',
  commercialName: '',
  rncOrId: '',
  phone: '',
  email: '',
  address: '',
  website: '',
  primaryColor: '#059669', // Emerald 600
  accentColor: '#0284c7',  // Sky 600
  defaultPaymentTerms: '',
  defaultWarrantyNotes: '',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const DEFAULT_LOCAL_USER: LocalUserProfile = {
  name: 'Consultor Solar',
  email: '',
  roleTitle: 'Ingeniero / Consultor Fotovoltaico',
  phone: '',
  activeCompanyId: 'comp-default-rd',
};
