import React, { useState } from 'react';
import { Bold, BookmarkCheck, Italic, List, Lock, PencilLine, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { getDocumentTextDefinition } from '../../../../shared/documentTexts';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useDocumentEditor } from './DocumentEditorContext';
import type { EditorCommand } from './RichTextEditor';

interface DocumentEditorToolbarProps {
  isEditMode: boolean;
  setIsEditMode: (value: boolean) => void;
  /** Motivo por el que no se puede editar (papelera, lector, conflicto); null si se puede. */
  readOnlyReason: string | null;
}

const keep = (event: React.MouseEvent) => event.preventDefault(); // no robar el foco al editor activo

/** Barra fija sobre la vista previa, estilo procesador de textos. Es cromo: nunca se exporta. */
export const DocumentEditorToolbar: React.FC<DocumentEditorToolbarProps> = ({ isEditMode, setIsEditMode, readOnlyReason }) => {
  const editor = useDocumentEditor();
  const canUndo = useSimulationStore((s) => s.canUndo);
  const canRedo = useSimulationStore((s) => s.canRedo);
  const undo = useSimulationStore((s) => s.undo);
  const redo = useSimulationStore((s) => s.redo);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const key = editor.activeKey;
  const definition = key ? getDocumentTextDefinition(key) : undefined;
  const resolved = key ? editor.resolve(key) : undefined;
  const rich = definition?.format === 'rich';

  const command = (name: EditorCommand) => editor.editorRef.current?.command(name);
  const closeEditor = () => {
    editor.editorRef.current?.dismiss();
    editor.setActiveKey(null);
  };
  const reset = () => {
    if (!key) return;
    closeEditor();
    editor.resetText(key);
  };
  const saveToTemplate = () => {
    if (!key) return;
    const value = editor.editorRef.current?.value();
    if (value !== undefined && value !== resolved?.text) editor.setText(key, value);
    if (editor.saveToTemplate(key)) setSavedKey(key);
  };
  const history = (action: () => void) => {
    closeEditor();
    action();
  };

  const button = 'h-7 min-w-7 px-1.5 rounded-lg flex items-center justify-center gap-1 text-[11px] font-bold transition-colors disabled:opacity-35 disabled:cursor-not-allowed enabled:hover:bg-slate-100 dark:enabled:hover:bg-white/10 text-slate-700 dark:text-slate-200 cursor-pointer';

  if (readOnlyReason) {
    return (
      <div data-pdf-chrome className="w-[850px] sticky top-0 z-40 flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/95 dark:bg-[#17171c]/95 border border-slate-200 dark:border-white/10 shadow-md text-xs text-slate-600 dark:text-slate-300">
        <Lock className="w-3.5 h-3.5" />
        <span>{readOnlyReason}</span>
      </div>
    );
  }

  return (
    <div
      data-pdf-chrome
      role="toolbar"
      aria-label="Editor del documento"
      className="w-[850px] sticky top-0 z-40 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white/95 dark:bg-[#17171c]/95 backdrop-blur border border-slate-200 dark:border-white/10 shadow-md"
    >
      <button
        type="button"
        onMouseDown={keep}
        onClick={() => {
          // Al terminar de editar se guarda lo escrito; descartar es solo para cancelar, restablecer y el historial.
          if (isEditMode) editor.editorRef.current?.commit();
          setIsEditMode(!isEditMode);
        }}
        className={`h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-[11px] font-black cursor-pointer transition-colors ${isEditMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-200'}`}
        aria-pressed={isEditMode}
        title="Editar los textos directamente en la hoja"
      >
        <PencilLine className="w-3.5 h-3.5" />
        {isEditMode ? 'Editando' : 'Editar textos'}
      </button>
      <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1" />
      <button type="button" className={button} onMouseDown={keep} onClick={() => command('bold')} disabled={!rich} title="Negrita (Ctrl+B)" aria-label="Negrita">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={button} onMouseDown={keep} onClick={() => command('italic')} disabled={!rich} title="Cursiva (Ctrl+I)" aria-label="Cursiva">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={button} onMouseDown={keep} onClick={() => command('list')} disabled={!rich || !definition?.multiline} title="Lista con viñetas" aria-label="Lista con viñetas">
        <List className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1" />
      <button type="button" className={button} onMouseDown={keep} onClick={reset} disabled={!resolved?.isCustomized || definition?.resettable === false} title="Volver al texto predeterminado">
        <RotateCcw className="w-3.5 h-3.5" />
        <span>Restablecer</span>
      </button>
      <button type="button" className={button} onMouseDown={keep} onClick={saveToTemplate} disabled={!definition?.templatable} title="Usar este texto en las próximas propuestas de la empresa">
        <BookmarkCheck className="w-3.5 h-3.5" />
        <span>{savedKey && savedKey === key ? 'En la plantilla' : 'Guardar en plantilla'}</span>
      </button>
      <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1" />
      <button type="button" className={button} onMouseDown={keep} onClick={() => history(undo)} disabled={!canUndo} title="Deshacer" aria-label="Deshacer">
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={button} onMouseDown={keep} onClick={() => history(redo)} disabled={!canRedo} title="Rehacer" aria-label="Rehacer">
        <Redo2 className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 min-w-0 flex items-center justify-end gap-2 pr-1 text-[11px] text-slate-500 dark:text-slate-400">
        {definition ? (
          <>
            <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{definition.label}</span>
            {resolved?.isCustomized && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 font-bold whitespace-nowrap">Personalizado</span>
            )}
          </>
        ) : (
          <span className="whitespace-nowrap">{isEditMode ? 'Haz clic en un texto de la hoja para editarlo' : 'Vista previa'}</span>
        )}
      </div>
    </div>
  );
};
