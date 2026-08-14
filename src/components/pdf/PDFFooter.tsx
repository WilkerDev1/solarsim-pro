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
    <footer className="w-full h-11 px-10 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between items-center bg-slate-50 z-30 box-border shrink-0 mt-auto">
      <span className="truncate max-w-[560px] font-medium leading-none">{footerText}</span>
      <span className="font-bold text-slate-700 shrink-0 ml-4 leading-none whitespace-nowrap">
        Página {pageNum} de {totalPages}
      </span>
    </footer>
  );
};
