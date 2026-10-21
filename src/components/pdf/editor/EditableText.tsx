import React from 'react';
import { Pencil } from 'lucide-react';
import { getDocumentTextDefinition } from '../../../../shared/documentTexts';
import { useDocumentEditor } from './DocumentEditorContext';
import { InlineTextEditor } from './InlineTextEditor';
import { RichText } from './RichText';

type Tag = 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'li' | 'td' | 'th';

interface EditableTextProps {
  /** Clave del registro `shared/documentTexts`. */
  k: string;
  as?: Tag;
  className?: string;
  style?: React.CSSProperties;
  boldClassName?: string;
  boldStyle?: React.CSSProperties;
  placeholder?: string;
  /** Presentación propia del texto resuelto (p. ej. «{días} Días Laborables» o una lista de servicios). */
  children?: (text: string) => React.ReactNode;
}

/** Un texto del documento: se muestra resuelto y, en modo edición, se edita en su sitio. */
export const EditableText: React.FC<EditableTextProps> = ({ k, as = 'span', className = '', style, boldClassName, boldStyle, placeholder = 'Escribe aquí...', children }) => {
  const editor = useDocumentEditor();
  const definition = getDocumentTextDefinition(k);
  if (!definition) throw new Error(`Texto del documento desconocido: ${k}`);
  const resolved = editor.resolve(k);
  const Tag = as as React.ElementType;
  const content = children ? children(resolved.text) : <RichText text={resolved.text} format={definition.format} boldClassName={boldClassName} boldStyle={boldStyle} />;

  if (!editor.canEdit) {
    return <Tag className={className} style={style} data-doc-text={k}>{content}</Tag>;
  }

  if (editor.activeKey === k) {
    return (
      <InlineTextEditor
        definition={definition}
        resolved={resolved}
        className={className}
        style={style}
        placeholder={placeholder}
        onSave={(value) => {
          if (value !== resolved.text) editor.setText(k, value);
          editor.setActiveKey(null);
        }}
        onReset={() => {
          editor.resetText(k);
          editor.setActiveKey(null);
        }}
        onSaveToTemplate={(value) => {
          editor.setText(k, value);
          return editor.saveToTemplate(k);
        }}
        onCancel={() => editor.setActiveKey(null)}
      />
    );
  }

  return (
    <Tag
      className={`relative group/edit cursor-pointer rounded-md outline-dashed outline-1 outline-transparent hover:outline-blue-500/80 hover:bg-blue-50/50 ${className}`}
      style={style}
      data-doc-text={k}
      role="button"
      tabIndex={0}
      title={`Editar: ${definition.label}`}
      onClick={() => editor.setActiveKey(k)}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          editor.setActiveKey(k);
        }
      }}
    >
      <span
        data-pdf-chrome
        className="absolute -top-3.5 right-1 opacity-0 group-hover/edit:opacity-100 transition-opacity bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-md flex items-center gap-1.5 pointer-events-none z-30 tracking-tight normal-case whitespace-nowrap"
      >
        <Pencil className="w-2.5 h-2.5" />
        {definition.label}
        {resolved.isCustomized && <span className="w-1.5 h-1.5 rounded-full bg-amber-300" title="Personalizado" />}
      </span>
      {resolved.text ? content : <span className="text-slate-400 italic text-[11px]">{placeholder}</span>}
    </Tag>
  );
};
