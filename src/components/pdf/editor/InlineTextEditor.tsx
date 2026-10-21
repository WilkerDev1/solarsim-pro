import React, { useEffect, useRef, useState } from 'react';
import { Bold, BookmarkCheck, Check, RotateCcw, X } from 'lucide-react';
import type { DocumentTextDefinition, ResolvedDocumentText } from '../../../../shared/documentTexts';

interface InlineTextEditorProps {
  definition: DocumentTextDefinition;
  resolved: ResolvedDocumentText;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  onSave: (value: string) => void;
  onReset: () => void;
  onSaveToTemplate: (value: string) => boolean;
  onCancel: () => void;
}

/** Editor en el sitio de un texto del documento (todo su cromo lleva `data-pdf-chrome`). */
export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({ definition, resolved, className = '', style, placeholder, onSave, onReset, onSaveToTemplate, onCancel }) => {
  const [value, setValue] = useState(resolved.text);
  const [savedToTemplate, setSavedToTemplate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (definition.multiline && inputRef.current) {
      const el = inputRef.current as HTMLTextAreaElement;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
    }
  }, [value, definition.multiline]);

  // Salir del campo confirma, como en un procesador de textos.
  useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) onSave(latest.current);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [onSave]);

  const toggleBold = () => {
    const input = inputRef.current;
    if (!input || definition.format !== 'rich') return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const selected = value.substring(start, end);
    const replacement = selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4
      ? selected.slice(2, -2)
      : `**${selected || 'texto'}**`;
    setValue(value.substring(0, start) + replacement + value.substring(end));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + replacement.length, start + replacement.length);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleBold();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && (!definition.multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSave(value);
    }
  };

  const button = 'px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer';
  const inputClass = `w-full p-2 rounded-xl border-2 border-blue-500 bg-white text-slate-900 font-sans shadow-lg outline-none focus:ring-4 focus:ring-blue-500/20 leading-relaxed ${className}`;

  return (
    <div ref={containerRef} className="relative z-40 my-1 normal-case" data-doc-text-editor={definition.key}>
      <div data-pdf-chrome className="absolute bottom-full mb-1 left-0 w-max flex items-center whitespace-nowrap justify-between bg-slate-900/95 text-white px-2.5 py-1 rounded-xl shadow-xl border border-slate-700 text-xs gap-2 z-50">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider pl-1 whitespace-nowrap">{definition.label}</span>
          {definition.format === 'rich' && (
            <button type="button" className={button} onMouseDown={(e) => e.preventDefault()} onClick={toggleBold} title="Negrita (Ctrl+B)">
              <Bold className="w-3 h-3" />
            </button>
          )}
          {resolved.isCustomized && definition.resettable !== false && (
            <button type="button" className={button} onClick={onReset} title="Volver al texto predeterminado">
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Restablecer</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {definition.templatable && (
            <button
              type="button"
              className={`${button} ${savedToTemplate ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              onClick={() => {
                if (onSaveToTemplate(value)) setSavedToTemplate(true);
              }}
              title="Guardar en esta propuesta y en la plantilla de la empresa para las próximas"
            >
              <BookmarkCheck className="w-3 h-3" />
              <span>{savedToTemplate ? 'En la plantilla' : 'Guardar en plantilla'}</span>
            </button>
          )}
          <button type="button" className={`${button} bg-emerald-600 hover:bg-emerald-500`} onClick={() => onSave(value)} title="Guardar (Ctrl+Enter)">
            <Check className="w-3 h-3" />
            <span>Guardar</span>
          </button>
          <button type="button" className={button} onClick={onCancel} title="Cancelar (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {definition.multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={2}
          value={value}
          maxLength={definition.maxLength}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          className={`${inputClass} resize-none`}
          style={style}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          maxLength={definition.maxLength}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          className={inputClass}
          style={style}
        />
      )}
    </div>
  );
};
