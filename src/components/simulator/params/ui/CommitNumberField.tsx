import React from 'react';
import { commitNumberDraft, type CommitNumberRange } from '../logic/commitNumberDraft';
import { Field, type FieldProps } from './Field';

export type CommitNumberFieldProps = Omit<FieldProps, 'onChange' | 'type' | 'value' | 'min' | 'max' | 'onBlur'> & CommitNumberRange & {
  value: number;
  /** Se llama solo al confirmar (blur o Enter) y solo si el valor cambió. */
  onCommit: (value: number) => void;
};

/**
 * `Field` numérico con borrador: mientras se edita el texto puede quedar vacío o a medias y nada se escribe
 * en el proyecto. Al confirmar, vacío o no numérico conserva el valor anterior y el resto se limita al rango.
 */
export const CommitNumberField: React.FC<CommitNumberFieldProps> = ({ value, onCommit, min, max, belowMin, onKeyDown, ...rest }) => {
  const [draft, setDraft] = React.useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const next = commitNumberDraft(draft, value, { min, max, belowMin });
    if (next !== value) onCommit(next);
  };

  return (
    <Field
      {...rest}
      type="number"
      mono
      min={min}
      max={max}
      value={draft ?? value}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === 'Enter') commit();
      }}
    />
  );
};
