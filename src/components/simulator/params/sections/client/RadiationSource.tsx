import React from 'react';
import { Loader2 } from 'lucide-react';
import { RD_PROVINCES } from '../../../../../data/rdProvinces';
import type { ClientInfo } from '../../../../../types';
import { Field, ParamRow, SelectField, StackedField, ToggleGroup } from '../../ui';
import { solarSourceMode, type SolarSourceMode } from './clientLogic';
import { SAMPLE_GPS_COORDINATES } from '../../logic/dockDefaults';

export interface RadiationSourceProps {
  client: ClientInfo;
  isFetchingSolar: boolean;
  solarApiStatus: string | null;
  onFetchSolarApi: () => void;
  updateClient: (client: Partial<ClientInfo>) => void;
}

const SOURCE_OPTIONS: Array<{ value: SolarSourceMode; label: string }> = [
  { value: 'province', label: 'Provincia' },
  { value: 'gps', label: 'GPS' },
];

const PROVINCE_OPTIONS = RD_PROVINCES.map(province => ({ value: province.name, label: province.name, hint: String(province.avgHSP) }));

/** Fuente de radiación: provincia (sin conexión) o coordenadas GPS (consulta en línea). */
export const RadiationSource: React.FC<RadiationSourceProps> = ({ client, isFetchingSolar, solarApiStatus, onFetchSolarApi, updateClient }) => {
  const mode = solarSourceMode(client);
  const hsp = RD_PROVINCES.find(province => province.name === client.province)?.avgHSP;
  return (
    <>
      <ParamRow label="Radiación solar" labelId="pd-cli-source-label">
        <ToggleGroup ariaLabel="Radiación solar" options={SOURCE_OPTIONS} value={mode} onChange={value => updateClient({ solarSourceMode: value })} />
      </ParamRow>
      {mode === 'province' ? (
        <ParamRow label="Provincia" htmlFor="pd-cli-province">
          <SelectField
            id="pd-cli-province"
            value={client.province}
            options={PROVINCE_OPTIONS}
            badge={hsp !== undefined ? `${hsp} HSP` : undefined}
            onChange={value => updateClient({ province: value, customMonthlyHSP: undefined })}
          />
        </ParamRow>
      ) : (
        <div className="space-y-2">
          <StackedField label="Coordenadas (latitud, longitud)" htmlFor="pd-cli-coords">
            <Field
              id="pd-cli-coords"
              mono
              value={client.coordinates || SAMPLE_GPS_COORDINATES}
              placeholder={SAMPLE_GPS_COORDINATES}
              onChange={value => updateClient({ coordinates: value })}
            />
          </StackedField>
          <button
            type="button"
            onClick={onFetchSolarApi}
            disabled={isFetchingSolar}
            aria-busy={isFetchingSolar}
            className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 bg-pd-accent text-[13px] font-semibold text-pd-on-accent disabled:cursor-default disabled:opacity-60"
          >
            {isFetchingSolar && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
            {isFetchingSolar ? 'Obteniendo de NASA…' : 'Obtener radiación'}
          </button>
          {solarApiStatus && <p role="status" className="m-0 text-xs text-pd-muted">{solarApiStatus}</p>}
        </div>
      )}
    </>
  );
};
