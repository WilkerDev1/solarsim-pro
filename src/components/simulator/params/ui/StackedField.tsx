import React from 'react';

export interface StackedFieldProps {
  label: string;
  htmlFor: string;
  children?: React.ReactNode;
}

/** Etiqueta encima y campo a todo el ancho, para textos largos. */
export const StackedField: React.FC<StackedFieldProps> = ({ label, htmlFor, children }) => (
  <div className="min-w-0">
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs text-pd-muted">{label}</label>
    {children}
  </div>
);
