import { DocumentCustomization } from '../types';

export const DEFAULT_DOCUMENT_CUSTOMIZATION: Required<DocumentCustomization> = {
  companyName: 'electsun',
  companySlogan: 'El sol a tu favor',
  companyFooterText: 'Calle Ercilia Pepín #1, Plaza Toledo | Local 307 | Arroyo Manzano | Santo Domingo, RD | electsun.com.do',
  companyPhone: '+1 (809) 555-0199',
  companyEmail: 'info@electsun.com.do',
  companyRnc: '1-31-12345-6',

  contactName: '',
  clientPhone: '+1 (809) 000-0000',
  clientEmail: 'contacto@cliente.com',
  validityNote: 'Precios sujetos a disponibilidad de inventario. Cotización válida por 7 días laborables.',

  panelWarrantyText: '25 Años de Producción Lineal',
  inverterWarrantyText: '5 a 10 Años de Fábrica',
  batteryWarrantyText: '5 a 10 Años (según fabricante)',
  workmanshipWarrantyText: '1 Año en Instalación y Soporte Técnico',

  servicesIncludedText: 'Permisos y Tramitación ante CNE y Distribuidora, Medición Neta, Planos Eléctricos, Instalación Certificada y Puesta en Marcha.',
};
