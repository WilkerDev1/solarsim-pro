import React from 'react';
import { DocumentCustomization } from '../../types';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../constants/defaultDocumentCustomization';

interface PDFFooterProps {
  pageNum: number;
  totalPages: number;
  customization?: DocumentCustomization;
}

export const PDFFooter: React.FC<PDFFooterProps> = ({
  pageNum,
  totalPages,
  customization,
}) => {
  const footerText =
    customization?.companyFooterText ||
    DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText ||
    '';

  return (
    <footer
      className="w-full px-10 border-t border-slate-200 flex justify-between items-center bg-slate-50 z-30 box-border shrink-0 mt-auto"
      style={{ height: '42px', minHeight: '42px', maxHeight: '42px' }}
    >
      <div
        className="font-bold text-[10px] whitespace-nowrap"
        style={{ color: '#64748b' }}
      >
        {footerText}
      </div>
      <div
        className="font-bold text-[10px] shrink-0 ml-4 whitespace-nowrap"
        style={{ color: '#0f172a' }}
      >
        Página {pageNum} de {totalPages}
      </div>
    </footer>
  );
};
