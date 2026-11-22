// Precio genérico de equipos en el catálogo (ADR 0006 §4–§5): sugerencia de la Regla 1, control de la cabecera del
// modal de ofertas y etiqueta de solo lectura. Sin sesión (modo local) nada de esto se muestra.
import { useState } from 'react';
import { X } from 'lucide-react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { acceptGenericSuggestion, canPriceEquipment, effectiveGenericPrice, priceFeatureActive, type GenericSuggestion } from '../../../store/slices/equipmentPriceSlice';
import type { SolarEquipmentItem } from '../../../types/equipment';
import type { GenericPriceInfo } from '../../../../shared/equipmentPrices';
import { confirmAction } from '../confirmAction';

export const formatGenericUSD = (value: number) =>
  `US$ ${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatGenericDate = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('es-DO') : '';
};

/** Precio genérico efectivo de un equipo, o `undefined` sin sesión (la función está apagada). */
export function useGenericPrice(equipmentId: string | undefined): { active: boolean; generic: GenericPriceInfo | null } {
  // Primitive fields only: the selector must return equal snapshots while nothing changed.
  const { active, priceUSD, observedAt, observationId } = useSimulationStore(
    useShallow((s) => {
      const generic = equipmentId && priceFeatureActive(s) ? effectiveGenericPrice(s, equipmentId) : null;
      return { active: !!equipmentId && priceFeatureActive(s), priceUSD: generic?.priceUSD, observedAt: generic?.observedAt, observationId: generic?.observationId };
    }),
  );
  return { active, generic: priceUSD !== undefined && observedAt && observationId ? { priceUSD, observedAt, observationId } : null };
}

/**
 * Regla 1: línea compacta en el área de mensajes de la pantalla tras guardar una oferta. «Usar»/«Cambiar» fija el
 * genérico con un registro `generic` derivado del registro de la oferta; nada bloquea ni se repite.
 */
export function GenericPriceSuggestion({ suggestion, onDismiss }: { suggestion: GenericSuggestion; onDismiss: () => void }) {
  const [done, setDone] = useState<string | null>(null);
  const accept = () => {
    const id = acceptGenericSuggestion(useSimulationStore.getState(), suggestion);
    setDone(id ? `Precio genérico: ${formatGenericUSD(suggestion.priceUSD)}` : 'No se pudo fijar el precio genérico. Revisa tus permisos.');
  };
  return (
    <p role="status" data-generic-suggestion className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-zinc-400">
      {done ?? (
        <>
          <span>
            Oferta guardada · {suggestion.decision === 'assign' ? 'Sin precio genérico' : `Genérico ${formatGenericUSD(suggestion.currentUSD ?? 0)}`}
          </span>
          <button type="button" onClick={accept} className="rounded-md border border-slate-300 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-zinc-600 dark:text-emerald-300 dark:hover:bg-emerald-950">
            {suggestion.decision === 'assign' ? `Usar ${formatGenericUSD(suggestion.priceUSD)} como genérico` : `Cambiar a ${formatGenericUSD(suggestion.priceUSD)}`}
          </button>
        </>
      )}
      <button type="button" aria-label="Descartar sugerencia de precio genérico" onClick={onDismiss} className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-zinc-800">
        <X size={13} />
      </button>
    </p>
  );
}

/**
 * Cabecera del modal de ofertas: «Genérico US$ X · fecha» con «Cambiar» (edición en línea, `manual`, > 0) y «Quitar»
 * (anula el vigente tras confirmar). Funciona también con equipos de referencia: el genérico no vive en el equipo.
 */
export function GenericPriceControl({ item }: { item: SolarEquipmentItem }) {
  const { active, generic } = useGenericPrice(item.id);
  const writable = useSimulationStore((s) => canPriceEquipment(s, item));
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!active) return null;
  const save = () => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Escribe un precio mayor que cero.');
      return;
    }
    if (!useSimulationStore.getState().setGenericPrice(item.id, value, 'manual')) {
      setError('No se pudo guardar. Revisa tus permisos.');
      return;
    }
    setDraft(null);
    setError('');
  };
  const remove = async () => {
    if (!generic) return;
    const confirmed = await confirmAction({
      title: 'Quitar precio genérico',
      message: `¿Quitar el precio genérico ${formatGenericUSD(generic.priceUSD)} de este equipo? Vuelve el anterior, si lo hay. Las propuestas existentes no cambian.`,
      confirmLabel: 'Quitar',
      tone: 'danger',
    });
    if (confirmed) useSimulationStore.getState().voidPriceObservation(generic.observationId);
  };
  if (draft !== null)
    return (
      <form
        className="offers-generic"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label>
          Precio genérico (USD)
          <input type="number" min="0.01" step="0.01" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button type="submit" className="supplier-button supplier-primary">Guardar</button>
        <button type="button" className="supplier-button" onClick={() => { setDraft(null); setError(''); }}>Cancelar</button>
        {error && <span role="alert">{error}</span>}
      </form>
    );
  return (
    <p className="offers-generic" title="Precio de referencia sin proveedor: se usa cuando el equipo no tiene ofertas disponibles. Cambiarlo no modifica propuestas existentes.">
      <span>{generic ? `Genérico ${formatGenericUSD(generic.priceUSD)} · ${formatGenericDate(generic.observedAt)}` : 'Sin precio genérico'}</span>
      {writable && (
        <button type="button" className="offers-link" onClick={() => setDraft(generic ? String(generic.priceUSD) : '')}>
          {generic ? 'Cambiar' : 'Asignar'}
        </button>
      )}
      {writable && generic && (
        <button type="button" className="offers-link" onClick={() => void remove()}>
          Quitar
        </button>
      )}
    </p>
  );
}
