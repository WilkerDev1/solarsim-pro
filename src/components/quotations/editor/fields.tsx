import React, { useId, useReducer } from 'react';
import { InfoTip } from '../../simulator/params/ui/InfoTip';
import { parseDecimalInput } from '../../../domain/quotationEdit';
import { fieldDraftReducer, initialFieldDraft, pendingCommit } from './fieldState';

/** Guarda un valor confirmado; devuelve el mensaje de error (validación del store) o `null` si se guardó. */
export type Commit<T> = (value: T) => string | null;

interface DraftOptions<T> {
  display: string;
  readOnly: boolean;
  commit: Commit<T>;
  /** Texto → valor; `null` si no se entiende (muestra `invalidMessage`). */
  parse: (text: string) => T | null;
  /** El valor guardado no cambia: no se escribe nada. */
  same: (value: T) => boolean;
  invalidMessage?: string;
}

/**
 * Borrador local de un campo (reglas en `fieldState.ts`): lo tecleado no se reescribe a mitad; se confirma al salir
 * del campo o con Enter, solo si el usuario lo modificó (Escape lo descarta). Un valor rechazado queda en el campo con
 * su mensaje y no se guarda.
 */
function useDraft<T>({ display, readOnly, commit, parse, same, invalidMessage = 'Escribe un valor válido.' }: DraftOptions<T>) {
  const [state, dispatch] = useReducer(fieldDraftReducer, undefined, () => initialFieldDraft(display, readOnly));
  // Lo guardado o el permiso cambiaron por otra vía (sincronización, cambio de moneda, reabrir): se ajusta al dibujar.
  if (state.display !== display || state.readOnly !== readOnly) dispatch({ type: 'stored', display, readOnly });
  const settle = () => {
    const text = pendingCommit(state);
    if (text === null) {
      if (state.dirty || state.error) dispatch({ type: 'escape' });
      return;
    }
    const value = parse(text);
    if (value === null) return dispatch({ type: 'result', error: invalidMessage });
    if (same(value)) return dispatch({ type: 'escape' });
    dispatch({ type: 'result', error: commit(value) });
  };
  return {
    draft: state.draft,
    error: state.error,
    onChange: (text: string) => dispatch({ type: 'input', text }),
    onFocus: () => dispatch({ type: 'focus' }),
    onBlur: () => { dispatch({ type: 'blur' }); settle(); },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, multiline = false) => {
      if (event.key === 'Enter' && !multiline) { event.preventDefault(); settle(); }
      if (event.key === 'Escape') dispatch({ type: 'escape' });
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
  /** Explicación que no cabe en la etiqueta: va en un ⓘ junto a ella, no en un párrafo. */
  info?: string;
}

const Shell: React.FC<FieldShell & { id: string; error: string | null; children: React.ReactNode }> = ({ id, label, hideLabel, className = '', error, hint, info, children }) => (
  <div className={`qe-field ${className}`}>
    {info && !hideLabel ? (
      <span className="qe-label-row"><label htmlFor={id}>{label}</label><InfoTip text={info} label={`Más información: ${label}`} /></span>
    ) : <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>{label}</label>}
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
  const field = useDraft<string>({ display: value, readOnly: !!readOnly, commit: onCommit, parse: (text) => text, same: (text) => text.trim() === value.trim() });
  const common = {
    id,
    value: field.draft,
    readOnly,
    maxLength,
    placeholder: readOnly ? undefined : placeholder,
    'aria-invalid': field.error ? true : undefined,
    'aria-describedby': describedBy(id, field.error, shell.hint),
    onFocus: field.onFocus,
    onBlur: field.onBlur,
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
  prefix?: string;
  /** El 0 se muestra como campo vacío (con `placeholder`) y vaciar el campo guarda 0: p. ej. la cantidad de una fila descriptiva. */
  emptyWhenZero?: boolean;
  placeholder?: string;
}

/** Texto tecleado → valor; con `emptyWhenZero`, un campo vacío vale 0 (si no, vacío es inválido: `null`). */
export function parseNumberDraft(text: string, toValue: (typed: number) => number, emptyWhenZero = false): number | null {
  if (emptyWhenZero && !text.trim()) return 0;
  const parsed = parseDecimalInput(text);
  return parsed === null ? null : toValue(parsed);
}

export const NumberField: React.FC<NumberFieldProps> = ({ value, onCommit, format, toValue = (n) => n, suffix, prefix, readOnly, emptyWhenZero = false, placeholder, ...shell }) => {
  const id = useId();
  const field = useDraft<number>({
    display: emptyWhenZero && value === 0 ? '' : format(value),
    readOnly: !!readOnly,
    commit: onCommit,
    parse: (text) => parseNumberDraft(text, toValue, emptyWhenZero),
    same: (next) => next === value,
    invalidMessage: 'Escribe un número válido (por ejemplo, 39.20).',
  });
  return (
    <Shell {...shell} id={id} error={field.error}>
      <span className={suffix || prefix ? 'qe-input-affix' : undefined}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="qe-number"
          value={field.draft}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : placeholder}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={describedBy(id, field.error, shell.hint)}
          onChange={(e) => field.onChange(e.target.value)}
          onFocus={field.onFocus}
          onBlur={field.onBlur}
          onKeyDown={(e) => field.onKeyDown(e)}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </span>
    </Shell>
  );
};
