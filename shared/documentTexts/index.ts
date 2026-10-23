/**
 * Textos del documento de propuesta: registro con claves estables, resolución (valor guardado,
 * valor de fábrica o texto dinámico), escritura compatible con 2.6.x, plantillas y texto enriquecido.
 * TypeScript puro sin imports de `src/`: lo compilan la app y el Worker del visor.
 */
export * from './sections';
export * from './factoryTexts';
export * from './context';
export * from './registry';
export * from './resolve';
export * from './write';
export * from './templates';
export * from './richText';
export { regulatoryNoteDefault, validityNoteDefault, isPlaceholderPhone } from './dynamicTexts';
export * from './share';
