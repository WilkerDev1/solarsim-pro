import React from 'react';
import { ProjectSimulation, ClientInfo } from '../../../types';
import { generateNextProjectSequence, findDuplicateProjectInfo } from '../../../store/useSimulationStore';
import { StackedField, Field } from '../params/ui';
import { displayContactPerson, displayPhone } from '../params/sections/client/clientLogic';
import { IdentifiersBlock } from '../params/sections/client/IdentifiersBlock';
import { RadiationSource } from '../params/sections/client/RadiationSource';

interface ClientParamsSectionProps {
  project: ProjectSimulation;
  projects: ProjectSimulation[];
  /** El dock ya no pinta según el tema: los tokens pd-* cambian solos. Se acepta para no romper al contenedor. */
  isDark?: boolean;
  isIdUnlocked: boolean;
  setIsIdUnlocked: (val: boolean) => void;
  isFetchingSolar: boolean;
  solarApiStatus: string | null;
  onFetchSolarApi: () => void;
  updateClient: (client: Partial<ClientInfo>) => void;
}

/** Cuerpo de «Proyecto y cliente». */
export const ClientParamsSection: React.FC<ClientParamsSectionProps> = ({
  project,
  projects,
  isIdUnlocked,
  setIsIdUnlocked,
  isFetchingSolar,
  solarApiStatus,
  onFetchSolarApi,
  updateClient,
}) => {
  const { client } = project;
  const duplicate = findDuplicateProjectInfo(client.projectId, client.quoteNumber || '', project.id, projects);
  const assignNext = () => {
    const next = generateNextProjectSequence(projects);
    updateClient({ projectId: next.projectId, quoteNumber: next.quoteNumber });
  };

  return (
    <div className="space-y-2.5">
      <StackedField label="Nombre del cliente" htmlFor="pd-cli-name">
        <Field id="pd-cli-name" value={client.name} onChange={value => updateClient({ name: value })} />
      </StackedField>
      <StackedField label="Ubicación" htmlFor="pd-cli-location">
        <Field id="pd-cli-location" value={client.location} onChange={value => updateClient({ location: value })} />
      </StackedField>
      <StackedField label="Dirección" htmlFor="pd-cli-address">
        <Field id="pd-cli-address" value={client.address ?? ''} placeholder="Av. 27 de Febrero #45" onChange={value => updateClient({ address: value })} />
      </StackedField>
      <div className="grid grid-cols-2 gap-2.5">
        <StackedField label="Teléfono" htmlFor="pd-cli-phone">
          <Field id="pd-cli-phone" value={displayPhone(client)} placeholder="809-000-0000" onChange={value => updateClient({ contactPhone: value })} />
        </StackedField>
        <StackedField label="Atención" htmlFor="pd-cli-contact">
          <Field id="pd-cli-contact" value={displayContactPerson(project)} placeholder="Persona o dpto." onChange={value => updateClient({ contactPerson: value })} />
        </StackedField>
      </div>
      <RadiationSource
        client={client}
        isFetchingSolar={isFetchingSolar}
        solarApiStatus={solarApiStatus}
        onFetchSolarApi={onFetchSolarApi}
        updateClient={updateClient}
      />
      <IdentifiersBlock
        client={client}
        isIdUnlocked={isIdUnlocked}
        setIsIdUnlocked={setIsIdUnlocked}
        duplicate={duplicate}
        onAssignNext={assignNext}
        updateClient={updateClient}
      />
    </div>
  );
};
