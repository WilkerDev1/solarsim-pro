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
  const footerText = customization?.companyFooterText || DEFAULT_DOCUMENT_CUSTOMIZATION.companyFooterText || '';

  return (
    <footer
      className="w-full h-12 px-10 border-t border-slate-200 flex justify-between items-center bg-slate-50 z-30 box-border shrink-0 mt-auto pb-1"
      style={{ minHeight: '48px', maxHeight: '48px' }}
    >
      <span
        className="truncate max-w-[560px] font-semibold text-[10px]"
        style={{ color: '#64748b', lineHeight: '1.4' }}
      >
        {footerText}
      </span>
      <span
        className="font-bold text-[10px] shrink-0 ml-4 whitespace-nowrap"
        style={{ color: '#1e293b', lineHeight: '1.4' }}
      >
        Página {pageNum} de {totalPages}
      </span>
    </footer>
  );
};
