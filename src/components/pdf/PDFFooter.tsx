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
    <footer className="mt-auto px-10 py-3 border-t border-slate-200 text-[10px] text-slate-500 flex justify-between items-center bg-slate-50 shrink-0">
      <span className="truncate max-w-[500px]">{footerText}</span>
      <span className="font-semibold text-slate-700 shrink-0 ml-4">
        Página {pageNum} de {totalPages}
      </span>
    </footer>
  );
};
