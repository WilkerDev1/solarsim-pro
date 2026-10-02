export interface CompanyProfile {
  id: string;
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
  name: 'Electsun Dominicana S.R.L.',
  commercialName: 'ELECTSUN',
  rncOrId: '1-31-12345-6',
  phone: '809-555-0100',
  email: 'contacto@electsun.com.do',
  address: 'Av. Winston Churchill, Torre Empresarial, Santo Domingo, D.N.',
  website: 'electsun.com.do',
  primaryColor: '#059669', // Emerald 600
  accentColor: '#0284c7',  // Sky 600
  defaultPaymentTerms: '60% anticipo al ordenar, 30% contra entrega de equipos en sitio, 10% tras interconexión con distribuidora.',
  defaultWarrantyNotes: '25 años en paneles solares, 10 años en inversores híbridos, 10 años en baterías BESS y 1 año en mano de obra.',
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
