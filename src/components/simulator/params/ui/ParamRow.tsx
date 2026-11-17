import React from 'react';

export interface ParamRowProps {
  label: string;
  /** Id del control: la etiqueta es un `label`. Sin él (grupos de botones) es un `span` con `labelId`. */
  htmlFor?: string;
  labelId?: string;
  /** Pista junto a la etiqueta (p. ej. un ⓘ): no resta ancho al control. */
  hint?: React.ReactNode;
  children?: React.ReactNode;
}

const labelClass = 'text-[13px] text-pd-muted';

/** Etiqueta a la izquierda y control de 172 px a la derecha. */
export const ParamRow: React.FC<ParamRowProps> = ({ label, htmlFor, labelId, hint, children }) => {
  const labelNode = htmlFor ? (
    <label htmlFor={htmlFor} id={labelId} className={labelClass}>{label}</label>
  ) : (
    <span id={labelId} className={labelClass}>{label}</span>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_172px] items-center gap-2.5">
      {hint ? <div className="flex min-w-0 items-center gap-1">{labelNode}{hint}</div> : labelNode}
      <div className="min-w-0">{children}</div>
    </div>
  );
};
