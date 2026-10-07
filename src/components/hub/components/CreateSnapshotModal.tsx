import React, { useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { GitCommit, X, Check, Tag } from 'lucide-react';

interface CreateSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const CreateSnapshotModal: React.FC<CreateSnapshotModalProps> = ({ isOpen, onClose, projectId }) => {
  const { createSnapshot } = useSimulationStore();
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    createSnapshot(projectId, label.trim(), notes.trim(), 'manual');
    setLabel('');
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl p-6 flex flex-col gap-4 text-zinc-100 select-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <GitCommit className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Crear Punto de Restauración (Hito Git)</h3>
              <p className="text-[11px] text-zinc-400">Guarda una versión inmutable de esta propuesta</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-purple-400" />
              <span>Nombre o Título de la Versión *</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ej. Revisión final para licitación / Aprobado por cliente"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-purple-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5">
              Notas y Detalles del Cambio (Opcional)
            </label>
            <textarea
              rows={3}
              placeholder="Ej. Se ajustó potencia de inversor a 16kW, se agregaron baterías HinaESS y se fijó margen comercial al 35%."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-purple-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#30363d]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-[#21262d] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-950/40 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Guardar Hito</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
