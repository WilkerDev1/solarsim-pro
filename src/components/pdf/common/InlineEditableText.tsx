import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Bold, RotateCcw, Pencil } from 'lucide-react';
import { renderFormattedMarkdown } from '../../../utils/textFormatter';

interface InlineEditableTextProps {
  value?: string | null;
  defaultValue?: string;
  onSave: (newValue: string) => void;
  isEditMode: boolean;
  multiline?: boolean;
  className?: string;
  boldClassName?: string;
  style?: React.CSSProperties;
  label?: string;
  placeholder?: string;
  onReset?: () => void;
  isCustomized?: boolean;
  minRows?: number;
}

export const InlineEditableText: React.FC<InlineEditableTextProps> = ({
  value,
  defaultValue = '',
  onSave,
  isEditMode,
  multiline = true,
  className = '',
  boldClassName = 'text-slate-950 font-bold',
  style,
  label = 'Editar texto',
  placeholder = 'Escribe aquí...',
  onReset,
  isCustomized = false,
  minRows = 2,
}) => {
  const effectiveValue = value !== undefined && value !== null && value !== '' ? value : defaultValue;
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(effectiveValue || '');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // Sync tempValue when value changes from outside
  useEffect(() => {
    setTempValue(effectiveValue || '');
  }, [effectiveValue]);

  // Auto-resize textarea height
  useEffect(() => {
    if (isEditing && multiline && inputRef.current) {
      const el = inputRef.current as HTMLTextAreaElement;
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, 40)}px`;
    }
  }, [isEditing, tempValue, multiline]);

  // Focus and select input on open
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Handle outside click to save
  useEffect(() => {
    if (!isEditing) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isEditing, tempValue]);

  const handleSave = () => {
    onSave(tempValue.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(effectiveValue || '');
    setIsEditing(false);
  };

  const handleApplyBold = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const selectedText = tempValue.substring(start, end);

    let newText = '';
    let newCursorPos = 0;

    if (selectedText.startsWith('**') && selectedText.endsWith('**') && selectedText.length >= 4) {
      // Remove bold
      const unbolded = selectedText.slice(2, -2);
      newText = tempValue.substring(0, start) + unbolded + tempValue.substring(end);
      newCursorPos = start + unbolded.length;
    } else if (selectedText.length > 0) {
      // Add bold around selected text
      const bolded = `**${selectedText}**`;
      newText = tempValue.substring(0, start) + bolded + tempValue.substring(end);
      newCursorPos = start + bolded.length;
    } else {
      // Insert placeholder **palabra**
      const placeholderBold = '**palabra**';
      newText = tempValue.substring(0, start) + placeholderBold + tempValue.substring(end);
      newCursorPos = start + placeholderBold.length;
    }

    setTempValue(newText);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl + B / Cmd + B to toggle bold
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      handleApplyBold(e as any);
      return;
    }

    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }

    // Ctrl + Enter to save in multiline, or Enter in single line
    if ((multiline && (e.ctrlKey || e.metaKey) && e.key === 'Enter') || (!multiline && e.key === 'Enter')) {
      e.preventDefault();
      handleSave();
    }
  };

  // If NOT in edit mode, render pure clean typography
  if (!isEditMode) {
    return (
      <span className={className} style={style}>
        {renderFormattedMarkdown(effectiveValue, boldClassName, style)}
      </span>
    );
  }

  // If in Edit Mode but NOT actively editing this specific block
  if (!isEditing) {
    return (
      <div
        ref={containerRef}
        onClick={() => {
          setTempValue(effectiveValue || '');
          setIsEditing(true);
        }}
        className={`relative group/edit cursor-pointer rounded-lg transition-all duration-150 outline-dashed outline-1.5 outline-transparent hover:outline-blue-500/80 hover:bg-blue-50/50 p-1 -m-1 ${className}`}
        style={style}
        title="Haz clic para editar este texto directamente"
      >
        {/* Floating badge indicator on hover */}
        <div className="absolute -top-3.5 right-2 opacity-0 group-hover/edit:opacity-100 transition-opacity bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-md flex items-center gap-1.5 pointer-events-none z-30 tracking-tight">
          <Pencil className="w-2.5 h-2.5" />
          <span>{label}</span>
          {isCustomized && <span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span>}
        </div>

        {/* Content rendered with markdown formatting */}
        {effectiveValue ? (
          renderFormattedMarkdown(effectiveValue, boldClassName, style)
        ) : (
          <span className="text-slate-400 italic text-[11px]">{placeholder}</span>
        )}
      </div>
    );
  }

  // Active inline editing state
  return (
    <div ref={containerRef} className="relative z-40 my-1">
      {/* Mini floating action toolbar */}
      <div className="absolute -top-9 left-0 right-0 flex items-center justify-between bg-slate-900/95 backdrop-blur-md text-white px-2.5 py-1 rounded-xl shadow-xl border border-slate-700 text-xs gap-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider pl-1">
            {label}
          </span>
          <div className="h-3 w-px bg-slate-700 mx-1" />
          <button
            type="button"
            onClick={handleApplyBold}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white font-black text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
            title="Formato en Negrita (Ctrl+B)"
          >
            <Bold className="w-3 h-3" />
            <span>Negrita</span>
          </button>
          {onReset && isCustomized && (
            <button
              type="button"
              onClick={() => {
                onReset();
                setTempValue(defaultValue || '');
                setIsEditing(false);
              }}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Restablecer a redacción predeterminada"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Por Defecto</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            className="px-2.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
            title="Guardar cambios (Ctrl+Enter)"
          >
            <Check className="w-3 h-3" />
            <span>Guardar</span>
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Cancelar (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor Input / Textarea */}
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={minRows}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full p-2.5 rounded-xl border-2 border-blue-500 bg-white text-slate-900 font-sans shadow-lg outline-none focus:ring-4 focus:ring-blue-500/20 leading-relaxed text-justify transition-all resize-none ${className}`}
          style={style}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full p-2 rounded-xl border-2 border-blue-500 bg-white text-slate-900 font-sans shadow-lg outline-none focus:ring-4 focus:ring-blue-500/20 transition-all ${className}`}
          style={style}
        />
      )}
      <div className="flex items-center justify-between text-[9.5px] text-slate-400 px-1 pt-0.5">
        <span>Tip: Usa <code>**texto**</code> o presiona <code>Ctrl+B</code> para negrita.</span>
        <span><code>Ctrl+Enter</code> para guardar • <code>Esc</code> para cancelar</span>
      </div>
    </div>
  );
};
