import React from 'react';
import { useDocumentEditor } from './DocumentEditorContext';

interface OptionalTextRowProps {
  /** Texto del registro que decide si la fila existe. */
  k: string;
  /** Solo en modo edición (filas auxiliares que no se imprimen). */
  editOnly?: boolean;
  children: React.ReactNode;
}

/** Fila que solo se imprime si su texto tiene valor; en modo edición siempre se muestra para poder rellenarla. */
export const OptionalTextRow: React.FC<OptionalTextRowProps> = ({ k, editOnly = false, children }) => {
  const editor = useDocumentEditor();
  if (editor.mode === 'export') return editOnly || !editor.resolve(k).text ? null : <>{children}</>;
  if (editor.canEdit) return editOnly ? <div data-pdf-chrome>{children}</div> : <>{children}</>;
  return editOnly || !editor.resolve(k).text ? null : <>{children}</>;
};
