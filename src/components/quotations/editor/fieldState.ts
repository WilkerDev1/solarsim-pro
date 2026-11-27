/**
 * Estado puro de un campo con borrador (docs/QUOTATION_EDITOR.md): lo que se muestra y lo que se confirma. Sin React,
 * para probar las secuencias de foco, edición, solo lectura y cambios del valor guardado.
 *
 * Reglas:
 * - El campo solo confirma un borrador que el usuario modificó (`dirty`) y que difiere de lo mostrado; pasar por el
 *   campo con Tab nunca escribe (tampoco reformateado, p. ej. una tasa con más decimales de los que se muestran).
 * - Si cambia lo guardado (`display`) y el usuario no está editando, el borrador y el error se reinician. Si está
 *   editando, su texto se conserva y se confirma al salir.
 * - Pasar a solo lectura, o salir de ella, reinicia el borrador y el error; en solo lectura no se edita ni confirma.
 */
export interface FieldDraftState {
  /** Texto de lo guardado, formateado. */
  display: string;
  readOnly: boolean;
  draft: string;
  focused: boolean;
  dirty: boolean;
  error: string | null;
}

export type FieldDraftEvent =
  | { type: 'stored'; display: string; readOnly: boolean }
  | { type: 'focus' }
  | { type: 'input'; text: string }
  | { type: 'blur' }
  | { type: 'escape' }
  | { type: 'result'; error: string | null };

export function initialFieldDraft(display: string, readOnly: boolean): FieldDraftState {
  return { display, readOnly, draft: display, focused: false, dirty: false, error: null };
}

const reset = (state: FieldDraftState): FieldDraftState => ({ ...state, draft: state.display, dirty: false, error: null });

export function fieldDraftReducer(state: FieldDraftState, event: FieldDraftEvent): FieldDraftState {
  switch (event.type) {
    case 'stored': {
      if (event.display === state.display && event.readOnly === state.readOnly) return state;
      const next = { ...state, display: event.display, readOnly: event.readOnly };
      if (event.readOnly !== state.readOnly || !state.dirty) return reset(next);
      return next;
    }
    case 'focus':
      return state.focused ? state : { ...state, focused: true };
    case 'input':
      return state.readOnly ? state : { ...state, draft: event.text, dirty: true, error: null };
    case 'blur':
      return state.focused ? { ...state, focused: false } : state;
    case 'escape':
      return reset(state);
    case 'result':
      return event.error ? { ...state, error: event.error } : reset(state);
  }
}

/** Texto a confirmar al salir del campo o con Enter; `null` si no hay nada que escribir. */
export function pendingCommit(state: FieldDraftState): string | null {
  if (state.readOnly || !state.dirty || state.draft === state.display) return null;
  return state.draft;
}
