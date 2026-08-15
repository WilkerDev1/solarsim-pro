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
      className="w-full px-10 border-t border-slate-200 flex justify-between items-start bg-slate-50 z-30 box-border shrink-0 mt-auto pt-3 pb-9"
      style={{ height: '76px', minHeight: '76px', maxHeight: '76px' }}
    >
      <span
        className="truncate max-w-[560px] font-semibold text-[11px]"
        style={{ color: '#334155', lineHeight: '1.4' }}
      >
        {footerText}
      </span>
      <span
        className="font-bold text-[11px] shrink-0 ml-4 whitespace-nowrap"
        style={{ color: '#0f172a', lineHeight: '1.4' }}
      >
        Página {pageNum} de {totalPages}
      </span>
    </footer>
  );
};
