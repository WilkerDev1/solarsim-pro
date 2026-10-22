import React from 'react';
import { Field, type FieldProps } from '../../ui';

export type NumberFieldProps = Omit<FieldProps, 'onChange' | 'type' | 'value'> & {
  value: number;
  /** Recibe el número ya interpretado; texto vacío o inválido cuenta como 0. */
  onValue: (value: number) => void;
};

/** `Field` numérico en mono que entrega números en vez de texto. */
export const NumberField: React.FC<NumberFieldProps> = ({ value, onValue, ...rest }) => (
  <Field {...rest} type="number" mono value={value} onChange={(raw) => onValue(parseFloat(raw) || 0)} />
);
