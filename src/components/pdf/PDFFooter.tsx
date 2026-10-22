import React from 'react';
import { DocumentCustomization } from '../../types';
import { EditableText } from './editor/EditableText';

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
  return (
    <footer
      className="w-full px-10 border-t border-slate-200 flex justify-between items-center bg-slate-50 z-30 box-border shrink-0 mt-auto"
      style={{ height: '42px', minHeight: '42px', maxHeight: '42px' }}
    >
      <div
        className="font-bold text-[10px] whitespace-nowrap"
        style={{ color: '#64748b' }}
      >
        <EditableText k="company.footer" />
      </div>
      <div
        className="font-bold text-[10px] shrink-0 ml-4 whitespace-nowrap"
        style={{ color: '#0f172a' }}
      >
        <EditableText k="footer.pageCounter">
          {(text) => text.replace('{page}', String(pageNum)).replace('{total}', String(totalPages))}
        </EditableText>
      </div>
    </footer>
  );
};
