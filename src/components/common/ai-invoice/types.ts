export interface FilePreview {
  file: File;
  url: string;
  name: string;
  type: string;
}

export type ActiveInvoiceTab = 'client' | 'consumption' | 'solar';

export const INVOICE_MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
