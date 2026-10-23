/** Une clases omitiendo los valores falsos. */
export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

/** Estilo base compartido por campos, selects y selectores: alto de 32 px, radio de 6 px, tokens pd-*. */
export const fieldShell = 'flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-pd-field-border bg-pd-field px-2.5';
export const bareInput = 'w-full min-w-0 appearance-none border-0 bg-transparent p-0 text-[13px] font-medium text-pd-text outline-none placeholder:font-normal placeholder:text-pd-subtle';
