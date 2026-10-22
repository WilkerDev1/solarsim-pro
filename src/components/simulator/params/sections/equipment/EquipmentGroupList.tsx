import React from 'react';
import { Plus } from 'lucide-react';
import type { SystemSpecs } from '../../../../../types';
import type { SolarEquipmentItem } from '../../../../../types/equipment';
import type { EquipmentKind } from '../../../../../utils/equipmentGroups';
import { SearchableEquipmentSelect } from '../../../sidebar/SearchableEquipmentSelect';
import { Field, InfoTip, ItemCard, SquareSwitch, Stepper, SubHeader, SubHeaderIconButton } from '../../ui';
import { KIND_CONFIG, createGroupActions, groupViews, type EquipmentMode, type GroupModelView } from './equipmentGroupModel';

export interface AutoCalculateProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Explicación para el InfoTip (cobertura y pérdidas en uso). */
  info: string;
}

export interface EquipmentGroupListProps {
  kind: EquipmentKind;
  mode: EquipmentMode;
  specs: SystemSpecs;
  catalog: SolarEquipmentItem[];
  updateSpecs: (patch: Partial<SystemSpecs>) => void;
  onOpenScanner: () => void;
  /** Solo paneles: interruptor «Auto-calcular» del modelo principal. */
  autoCalculate?: AutoCalculateProps;
  /** Con false queda el subencabezado sin «+» ni modelos (batería «No»). */
  enabled?: boolean;
  /** Contenido entre el subencabezado y los modelos (el Sí/No de la batería). */
  intro?: React.ReactNode;
  /** Contenido tras los modelos (Avanzado, indicadores). */
  children?: React.ReactNode;
}

const fieldLabel = 'mb-1.5 block text-xs text-pd-muted';

const AutoCalculateRow: React.FC<{ kindNoun: string; auto: AutoCalculateProps }> = ({ kindNoun, auto }) => (
  <span className="flex items-center gap-2 text-[13px] text-pd-text">
    <SquareSwitch checked={auto.checked} onChange={auto.onChange} ariaLabel={`Auto-calcular ${kindNoun}`} />
    Auto-calcular
    <InfoTip text={auto.info} />
  </span>
);

/**
 * Lista de modelos de paneles, inversores o baterías, en modo Catálogo o Manual. Es la única vista de
 * esos tres grupos: todo cambio sale de `createGroupActions` y por tanto de `editEquipmentGroup`.
 */
export const EquipmentGroupList: React.FC<EquipmentGroupListProps> = ({ kind, mode, specs, catalog, updateSpecs, onOpenScanner, autoCalculate, enabled = true, intro, children }) => {
  const config = KIND_CONFIG[kind];
  const baseId = React.useId();
  const actions = createGroupActions(kind, specs, catalog, updateSpecs);
  const views = enabled ? groupViews(specs, kind) : [];

  const stepper = (view: GroupModelView, index: number, disabled?: boolean, tall?: boolean) => (
    <Stepper
      value={view.count}
      onChange={count => actions.setCount(index, count)}
      ariaLabel={`Cantidad de ${config.plural}`}
      min={1}
      disabled={disabled}
      tall={tall}
    />
  );

  const renderCatalog = (view: GroupModelView, index: number) => {
    const makePicker = (trailing?: React.ReactNode) => (
      <SearchableEquipmentSelect
        type={kind}
        items={catalog}
        selectedValue={view.brandModel}
        selectedPower={view.magnitude}
        onSelect={item => actions.select(index, item)}
        onOpenScanner={onOpenScanner}
        label={`Modelo de ${config.noun} #${index + 1}`}
        placeholder={config.searchPlaceholder}
        trailing={trailing}
      />
    );
    if (index === 0 && autoCalculate) {
      return (
        <>
          {makePicker()}
          <div className="flex items-center justify-between gap-2">
            <AutoCalculateRow kindNoun={config.plural} auto={autoCalculate} />
            {stepper(view, index, autoCalculate.checked)}
          </div>
        </>
      );
    }
    return makePicker(stepper(view, index, false, true));
  };

  const renderManual = (view: GroupModelView, index: number) => {
    const id = `${baseId}-${index}`;
    const brandValue = view.brandModel || (index === 0 ? config.manualBrandFallback : '');
    return (
      <>
        <div className="min-w-0">
          <label htmlFor={`${id}-brand`} className={fieldLabel}>Marca y modelo</label>
          <Field id={`${id}-brand`} value={brandValue} onChange={value => actions.setBrand(index, value)} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
          <div className="min-w-0">
            <label htmlFor={`${id}-magnitude`} className={fieldLabel}>{config.magnitudeLabel}</label>
            <Field
              id={`${id}-magnitude`}
              type="number"
              mono
              min={config.magnitudeMin}
              step={config.magnitudeStep}
              value={view.magnitude ?? ''}
              onChange={value => actions.setMagnitude(index, parseFloat(value) || 0)}
            />
          </div>
          <div>
            <span className={fieldLabel}>Cantidad</span>
            {stepper(view, index, index === 0 && autoCalculate?.checked, true)}
          </div>
        </div>
        {index === 0 && autoCalculate && <AutoCalculateRow kindNoun={config.plural} auto={autoCalculate} />}
      </>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <SubHeader
        title={config.title}
        action={
          enabled ? (
            <SubHeaderIconButton label={`Agregar modelo de ${config.noun}`} icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={actions.add} />
          ) : undefined
        }
      />
      {intro}
      {views.map((view, index) => (
        <ItemCard
          key={view.key}
          title={index > 0 ? `Modelo #${index + 1}` : undefined}
          onRemove={index > 0 ? () => actions.remove(index) : undefined}
          removeLabel={`Eliminar ${config.noun} #${index + 1}`}
        >
          {mode === 'catalog' ? renderCatalog(view, index) : renderManual(view, index)}
        </ItemCard>
      ))}
      {children}
    </div>
  );
};
