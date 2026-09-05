import React, { useState, useEffect } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { FolderPlus, X, Palette, EyeOff } from 'lucide-react';
import { ProjectFolder } from '../../../types';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderToEdit?: ProjectFolder | null;
}

const COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Cyan', value: '#06b6d4' },
];

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  folderToEdit,
}) => {
  const { createFolder, updateFolder } = useSimulationStore();
  const [name, setName] = useState(folderToEdit?.name || '');
  const [color, setColor] = useState(folderToEdit?.color || '#10b981');
  const [description, setDescription] = useState(folderToEdit?.description || '');
  const [hideFromGeneral, setHideFromGeneral] = useState(folderToEdit?.hideFromGeneral || false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(folderToEdit?.name || '');
      setColor(folderToEdit?.color || '#10b981');
      setDescription(folderToEdit?.description || '');
      setHideFromGeneral(folderToEdit?.hideFromGeneral || false);
      setError(null);
    }
  }, [isOpen, folderToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la carpeta es obligatorio.');
      return;
    }

    if (folderToEdit) {
      updateFolder(folderToEdit.id, {
        name: name.trim(),
        color,
        description: description.trim(),
        hideFromGeneral,
      });
    } else {
      createFolder(name.trim(), color, description.trim(), hideFromGeneral);
    }

    setName('');
    setDescription('');
    setHideFromGeneral(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#27272a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {folderToEdit ? 'Editar Carpeta' : 'Nueva Carpeta de Propuestas'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Nombre de la Carpeta
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ej: Commercial Proposals, Residenciales 2026..."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              <span>Color Identificador</span>
            </label>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  style={{ backgroundColor: preset.value }}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer shadow-xs ${
                    color === preset.value ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110' : 'hover:scale-105'
                  }`}
                  title={preset.name}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              Descripción (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Clientes del sector médico e industrial..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#121214] text-slate-900 dark:text-white"
            />
          </div>

          {/* Opción para ocultar propuestas del menú principal y proyectos generales */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#27272a] bg-slate-50/70 dark:bg-[#121214]/60 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div
                className={`p-1.5 rounded-lg mt-0.5 transition-colors ${
                  hideFromGeneral
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-200/60 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                }`}
              >
                <EyeOff className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <label
                  htmlFor="hide-from-general-toggle"
                  className="text-xs font-semibold text-slate-800 dark:text-zinc-200 cursor-pointer select-none"
                >
                  Ocultar del menú principal
                </label>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-snug">
                  Los proyectos de esta carpeta se ocultarán del menú principal y del folder de proyectos generales; solo se mostrarán al abrir esta carpeta.
                </p>
              </div>
            </div>
            <button
              id="hide-from-general-toggle"
              type="button"
              role="switch"
              aria-checked={hideFromGeneral}
              onClick={() => setHideFromGeneral(!hideFromGeneral)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                hideFromGeneral ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  hideFromGeneral ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-[#27272a]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs cursor-pointer"
            >
              {folderToEdit ? 'Guardar Cambios' : 'Crear Carpeta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
