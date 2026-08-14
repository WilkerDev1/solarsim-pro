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
    <footer className="absolute bottom-2.5 left-0 right-0 w-full h-9 px-10 border-t border-slate-200 text-[9.5px] text-slate-500 flex justify-between items-center bg-slate-50 z-30 box-border pointer-events-none">
      <span className="truncate max-w-[560px] font-medium leading-normal pointer-events-auto">{footerText}</span>
      <span className="font-bold text-slate-700 shrink-0 ml-4 leading-normal whitespace-nowrap pointer-events-auto">
        Página {pageNum} de {totalPages}
      </span>
    </footer>
  );
};
