import React, { useEffect, useId, useState } from 'react';
import { parseDecimalInput } from '../../../domain/quotationEdit';

/** Guarda un valor confirmado; devuelve el mensaje de error (validación del store) o `null` si se guardó. */
export type Commit<T> = (value: T) => string | null;

interface DraftOptions<T> {
  display: string;
  commit: Commit<T>;
  /** Texto → valor; `null` si no se entiende (muestra `invalidMessage`). */
  parse: (text: string) => T | null;
  /** El valor guardado no cambia: no se escribe nada. */
  same: (value: T) => boolean;
  invalidMessage?: string;
}

/**
 * Borrador local de un campo: lo tecleado no se reescribe a mitad; se confirma al salir del campo o con Enter
 * (Escape lo descarta). Un valor rechazado queda en el campo con su mensaje y no se guarda.
 */
function useDraft<T>({ display, commit, parse, same, invalidMessage = 'Escribe un valor válido.' }: DraftOptions<T>) {
  const [draft, setDraft] = useState(display);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lo guardado cambió por otra vía (otra pestaña, sincronización, cambio de moneda): el campo lo refleja si no se edita.
  useEffect(() => {
    if (!focused && !error) setDraft(display);
  }, [display, focused, error]);
  const settle = () => {
    const value = parse(draft);
    if (value === null) {
      setError(invalidMessage);
      return;
    }
    if (same(value)) {
      setError(null);
      setDraft(display);
      return;
    }
    const failure = commit(value);
    setError(failure);
  };
  return {
    draft,
    error,
    onChange: (text: string) => { setDraft(text); setError(null); },
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); settle(); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, multiline = false) => {
      if (event.key === 'Enter' && !multiline) { event.preventDefault(); settle(); }
      if (event.key === 'Escape') { setDraft(display); setError(null); }
    },
  };
}

interface FieldShell {
  label: string;
  /** La etiqueta existe para lectores de pantalla pero no se ve (filas de la tabla con cabecera visible). */
  hideLabel?: boolean;
  readOnly?: boolean;
  className?: string;
  hint?: string;
}

const Shell: React.FC<FieldShell & { id: string; error: string | null; children: React.ReactNode }> = ({ id, label, hideLabel, className = '', error, hint, children }) => (
  <div className={`qe-field ${className}`}>
    <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>{label}</label>
    {children}
    {hint && !error && <p id={`${id}-hint`} className="qe-field-hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="qe-field-error" role="alert">{error}</p>}
  </div>
);

const describedBy = (id: string, error: string | null, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export interface TextFieldProps extends FieldShell {
  value: string;
  onCommit: Commit<string>;
  type?: 'text' | 'email' | 'tel' | 'date';
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
  /** Valor vacío permitido como `null` (fechas opcionales). */
  emptyAsNull?: boolean;
}

export const TextField: React.FC<TextFieldProps> = ({ value, onCommit, type = 'text', multiline, rows = 3, maxLength, placeholder, autoComplete = 'off', readOnly, ...shell }) => {
  const id = useId();
  const field = useDraft<string>({ display: value, commit: onCommit, parse: (text) => text, same: (text) => text.trim() === value.trim() });
  const common = {
    id,
    value: field.draft,
    readOnly,
    maxLength,
    placeholder: readOnly ? undefined : placeholder,
    'aria-invalid': field.error ? true : undefined,
    'aria-describedby': describedBy(id, field.error, shell.hint),
    onFocus: field.onFocus,
    onBlur: readOnly ? undefined : field.onBlur,
  };
  return (
    <Shell {...shell} id={id} error={field.error}>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => field.onChange(e.target.value)} onKeyDown={(e) => field.onKeyDown(e, true)} />
      ) : (
        <input {...common} type={type} autoComplete={autoComplete} onChange={(e) => field.onChange(e.target.value)} onKeyDown={(e) => field.onKeyDown(e)} />
      )}
    </Shell>
  );
};

export interface NumberFieldProps extends FieldShell {
  value: number;
  onCommit: Commit<number>;
  format: (value: number) => string;
  /** Valor tecleado (unidades) → valor guardado (p. ej. a centavos). */
  toValue?: (typed: number) => number;
  suffix?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({ value, onCommit, format, toValue = (n) => n, suffix, readOnly, ...shell }) => {
  const id = useId();
  const field = useDraft<number>({
    display: format(value),
    commit: onCommit,
    parse: (text) => {
      const parsed = parseDecimalInput(text);
      return parsed === null ? null : toValue(parsed);
    },
    same: (next) => next === value,
    invalidMessage: 'Escribe un número válido (por ejemplo, 39.20).',
  });
  return (
    <Shell {...shell} id={id} error={field.error}>
      <span className={suffix ? 'qe-input-affix' : undefined}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="qe-number"
          value={field.draft}
          readOnly={readOnly}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(id, field.error, shell.hint)}
          onChange={(e) => field.onChange(e.target.value)}
          onFocus={field.onFocus}
          onBlur={readOnly ? undefined : field.onBlur}
          onKeyDown={(e) => field.onKeyDown(e)}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </span>
    </Shell>
  );
};
