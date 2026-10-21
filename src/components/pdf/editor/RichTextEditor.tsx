import React, { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { DocumentTextDefinition } from '../../../../shared/documentTexts';
import { escapeRichHtml, richTextToEditorHtml, serializeEditableDom, type NodeLike } from '../../../../shared/documentTexts/richText';

export type EditorCommand = 'bold' | 'italic' | 'list';

/** Lo que la barra superior puede pedir al editor activo. */
export interface RichTextEditorHandle {
  command: (command: EditorCommand) => void;
  value: () => string;
  /** Marca el editor como cerrado sin confirmar (restablecer, deshacer). */
  dismiss: () => void;
}

interface RichTextEditorProps {
  definition: DocumentTextDefinition;
  text: string;
  as: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

const EXEC: Record<EditorCommand, string> = { bold: 'bold', italic: 'italic', list: 'insertUnorderedList' };

/**
 * Edición en el sitio con `contentEditable`: pegar entra como texto plano, Ctrl+B/I dan formato,
 * Enter crea párrafo (o confirma en campos de una línea), Shift+Enter salto de línea, Esc cancela
 * y salir del campo o Ctrl+Enter confirman. El resultado siempre se re-serializa y se sanea.
 */
export const RichTextEditor = React.forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  ({ definition, text, as: Tag, className = '', style, placeholder, onCommit, onCancel }, handleRef) => {
    const ref = useRef<HTMLElement>(null);
    const done = useRef(false);
    const rich = definition.format === 'rich';

    const value = () => (ref.current
      ? serializeEditableDom(ref.current as unknown as NodeLike, { format: definition.format, multiline: definition.multiline, maxLength: definition.maxLength })
      : text);
    const commit = () => {
      if (done.current) return;
      done.current = true;
      onCommit(value());
    };
    const cancel = () => {
      if (done.current) return;
      done.current = true;
      onCancel();
    };
    const run = (command: EditorCommand) => {
      if (!rich || (command === 'list' && !definition.multiline)) return;
      ref.current?.focus();
      document.execCommand(EXEC[command]);
    };

    useImperativeHandle(handleRef, () => ({ command: run, value, dismiss: () => { done.current = true; } }));

    useLayoutEffect(() => {
      const element = ref.current;
      if (!element) return;
      element.innerHTML = rich ? richTextToEditorHtml(text) : escapeRichHtml(text).replace(/\n/g, '<br>');
      element.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      // Solo al abrir: después el DOM es del usuario.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Un clic fuera del campo (salvo en la barra del editor) confirma aunque el foco no cambie.
    const commitRef = useRef(commit);
    commitRef.current = commit;
    useEffect(() => {
      const onOutside = (event: MouseEvent) => {
        const target = event.target as Element | null;
        if (!target || ref.current?.contains(target) || target.closest?.('[role="toolbar"][data-pdf-chrome]')) return;
        commitRef.current();
      };
      document.addEventListener('mousedown', onOutside, true);
      return () => document.removeEventListener('mousedown', onOutside, true);
    }, []);

    const onKeyDown = (event: React.KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      } else if (event.key === 'Enter' && (mod || !definition.multiline)) {
        event.preventDefault();
        commit();
      } else if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        document.execCommand('insertLineBreak');
      } else if (mod && (event.key.toLowerCase() === 'b' || event.key.toLowerCase() === 'i')) {
        event.preventDefault();
        run(event.key.toLowerCase() === 'b' ? 'bold' : 'italic');
      } else if (mod && event.key.toLowerCase() === 'u') {
        event.preventDefault(); // subrayado no admitido
      }
    };

    const onPaste = (event: React.ClipboardEvent) => {
      event.preventDefault();
      const pasted = event.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, definition.multiline ? pasted : pasted.replace(/\s*\n\s*/g, ' '));
    };

    return (
      <Tag
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={definition.multiline}
        aria-label={definition.label}
        data-placeholder={placeholder}
        data-doc-text-editor={definition.key}
        spellCheck
        className={`${className} ${definition.multiline ? '' : 'inline-block min-w-[3rem]'} cursor-text rounded-md outline outline-2 outline-blue-500 outline-offset-2 bg-blue-50/40 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400`}
        style={style}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDrop={(event: React.DragEvent) => event.preventDefault()}
        onBlur={commit}
      />
    );
  },
);
RichTextEditor.displayName = 'RichTextEditor';
