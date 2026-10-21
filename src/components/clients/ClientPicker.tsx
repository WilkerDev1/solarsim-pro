import { useId, useMemo, useState } from 'react';
import { CLIENT_KINDS } from '../../../shared/clients';
import type { ClientRecord } from '../../types/client';
import { filterClients } from '../../utils/clientSummary';

/** Searchable client selector (combobox + listbox). Optionally offers to create a client from the typed name. */
export function ClientPicker({
  clients,
  selectedId,
  onSelect,
  onCreate,
  label = 'Cliente',
  className = '',
  collapseWhenEmpty = false,
}: {
  clients: readonly ClientRecord[];
  selectedId: string | null;
  onSelect: (client: ClientRecord | null) => void;
  onCreate?: (name: string) => void;
  label?: string;
  className?: string;
  /** Lists results only while searching, for compact forms. */
  collapseWhenEmpty?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const matches = useMemo(() => filterClients(clients, query, 'all').slice(0, 8), [clients, query]);
  const canCreate = !!onCreate && !!query.trim() && !matches.some((c) => c.name.trim().toLowerCase() === query.trim().toLowerCase());
  const listed = !collapseWhenEmpty || !!query.trim();
  const options = !listed ? [] : [...matches.map((client) => ({ key: client.id, client })), ...(canCreate ? [{ key: '__create', client: null }] : [])];
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.client) onSelect(option.client);
    else onCreate?.(query.trim());
    setQuery('');
  };
  const selected = clients.find((c) => c.id === selectedId);
  return (
    <div className={className}>
      <label htmlFor={`${id}-input`}>{label}</label>
      {selected && (
        <p className="client-picker-selected" role="status">
          Seleccionado: <strong>{selected.name}</strong>{' '}
          <button type="button" onClick={() => onSelect(null)} className="client-picker-clear">Quitar</button>
        </p>
      )}
      <input
        id={`${id}-input`}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={options[highlight] ? `${id}-${options[highlight].key}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder="Buscar por nombre, RNC o teléfono"
        onChange={(event) => { setQuery(event.target.value); setHighlight(0); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((h) => Math.min(h + 1, options.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          if (event.key === 'Enter' && options.length) { event.preventDefault(); choose(highlight); }
        }}
      />
      <ul id={`${id}-list`} role="listbox" aria-label="Clientes encontrados" className="client-picker-list" hidden={!listed}>
        {options.map((option, index) => (
          <li
            key={option.key}
            id={`${id}-${option.key}`}
            role="option"
            aria-selected={index === highlight || option.client?.id === selectedId}
            data-highlighted={index === highlight || undefined}
            onMouseDown={(event) => { event.preventDefault(); choose(index); }}
            onMouseEnter={() => setHighlight(index)}
          >
            {option.client ? (
              <>
                <span>{option.client.name}</span>
                <small>{[CLIENT_KINDS[option.client.kind], option.client.taxId, option.client.province].filter(Boolean).join(' · ')}</small>
              </>
            ) : (
              <span>Crear cliente «{query.trim()}»</span>
            )}
          </li>
        ))}
        {!options.length && <li role="presentation" className="client-picker-empty">{clients.length ? 'Sin coincidencias.' : 'Todavía no hay clientes.'}</li>}
      </ul>
    </div>
  );
}
