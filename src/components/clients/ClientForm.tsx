import { useEffect, useMemo, useRef, useState } from 'react';
import { CLIENT_KINDS, CLIENT_LIMITS, findDuplicateClients, type ClientInput } from '../../../shared/clients';
import { RD_PROVINCES } from '../../data/rdProvinces';
import type { ClientRecord } from '../../types/client';

export const EMPTY_CLIENT: ClientInput = { kind: 'persona', name: '', taxId: '', phone: '', email: '', address: '', province: '', notes: '' };

/** Client fields; only the name is required. Duplicates are a warning, never a block. */
export function ClientForm({
  initial,
  clients,
  editingId,
  readOnly,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ClientInput;
  clients: readonly ClientRecord[];
  editingId?: string;
  readOnly: boolean;
  submitLabel: string;
  onSubmit: (value: ClientInput) => string | null;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<ClientInput>(initial);
  const [error, setError] = useState('');
  const [remoteChanged, setRemoteChanged] = useState(false);
  // Incoming records (save receipts, other members) replace a pristine form; a dirty draft is kept and flagged.
  const previous = useRef(initial);
  useEffect(() => {
    if (JSON.stringify(previous.current) === JSON.stringify(initial)) return;
    setValue((current) => {
      const pristine = JSON.stringify(current) === JSON.stringify(previous.current);
      setRemoteChanged(!pristine && JSON.stringify(current) !== JSON.stringify(initial));
      return pristine ? initial : current;
    });
    previous.current = initial;
  }, [initial]);
  const duplicates = useMemo(
    () => findDuplicateClients(clients, { id: editingId, name: value.name, taxId: value.taxId }),
    [clients, editingId, value.name, value.taxId],
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  const field = <K extends keyof ClientInput>(key: K) => ({
    value: value[key],
    disabled: readOnly,
    onChange: (event: { target: { value: string } }) => setValue((v) => ({ ...v, [key]: event.target.value })),
  });
  return (
    <form
      className="cl-section"
      aria-label={editingId ? 'Datos del cliente' : 'Nuevo cliente'}
      onSubmit={(event) => {
        event.preventDefault();
        const message = onSubmit(value);
        setError(message || '');
      }}
    >
      <h3>Datos del cliente</h3>
      <div className="cl-fields">
        <label className="cl-field-wide">
          Nombre o razón social
          <input required maxLength={CLIENT_LIMITS.name} autoFocus={!editingId} {...field('name')} />
        </label>
        <label>
          Tipo
          <select {...field('kind')}>
            {Object.entries(CLIENT_KINDS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          {value.kind === 'empresa' ? 'RNC' : 'Cédula o RNC'}
          <input maxLength={CLIENT_LIMITS.taxId + 8} inputMode="numeric" placeholder="Opcional" {...field('taxId')} />
        </label>
        <label>
          Teléfono
          <input type="tel" maxLength={CLIENT_LIMITS.phone} placeholder="Opcional" {...field('phone')} />
        </label>
        <label>
          Correo electrónico
          <input type="email" maxLength={CLIENT_LIMITS.email} placeholder="Opcional" {...field('email')} />
        </label>
        <label>
          Provincia
          <select {...field('province')}>
            <option value="">Sin provincia</option>
            {RD_PROVINCES.map((province) => (
              <option key={province.code} value={province.name}>{province.name}</option>
            ))}
            {value.province && !RD_PROVINCES.some((p) => p.name === value.province) && <option value={value.province}>{value.province}</option>}
          </select>
        </label>
        <label>
          Dirección
          <input maxLength={CLIENT_LIMITS.address} placeholder="Opcional" {...field('address')} />
        </label>
        <label className="cl-field-wide">
          Notas internas
          <textarea maxLength={CLIENT_LIMITS.notes} placeholder="No se imprimen en las propuestas" {...field('notes')} />
        </label>
      </div>
      {duplicates.length > 0 && (
        <p className="cl-notice" role="status" style={{ marginTop: 20 }}>
          Posible duplicado:{' '}
          {duplicates.map((d) => `${d.client.name} (${d.reason === 'taxId' ? 'mismo RNC o cédula' : 'mismo nombre'})`).join(', ')}.
          Puedes guardar igualmente si es otro cliente.
        </p>
      )}
      {remoteChanged && dirty && (
        <p className="cl-notice" role="status" style={{ marginTop: 20 }}>
          El cliente cambió mientras editabas. Tus cambios se conservan; guárdalos o descártalos para ver la versión actual.
        </p>
      )}
      {error && <p className="cl-notice cl-error" role="alert" style={{ marginTop: 20 }}>{error}</p>}
      {!readOnly && (
        <div className="cl-actions">
          {onCancel && <button type="button" onClick={onCancel}>Cancelar</button>}
          {editingId && dirty && <button type="button" onClick={() => { setValue(initial); setError(''); setRemoteChanged(false); }}>Descartar cambios</button>}
          <button type="submit" className="cl-primary" disabled={!value.name.trim() || (!!editingId && !dirty)}>{submitLabel}</button>
        </div>
      )}
    </form>
  );
}
