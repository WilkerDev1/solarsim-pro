import React from 'react';
import { ChevronsDownUp, ChevronsUpDown, DollarSign, Landmark, Receipt, Sun, User } from 'lucide-react';
import { ParamSection } from '../params/ui';
import { DOCK_SECTION_KEYS, allSectionsOpen, type DockSectionKey, type FinancialsBadge, type OpenSections } from '../params/logic/dockSections';

const ICON_PROPS = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

const SECTIONS: Record<DockSectionKey, { title: string; icon: React.ReactNode }> = {
  client: { title: 'Proyecto y cliente', icon: <User {...ICON_PROPS} /> },
  rates: { title: 'Tarifas', icon: <Receipt {...ICON_PROPS} /> },
  equipment: { title: 'Equipamiento', icon: <Sun {...ICON_PROPS} /> },
  costs: { title: 'Costos y margen', icon: <DollarSign {...ICON_PROPS} /> },
  financials: { title: 'Finanzas', icon: <Landmark {...ICON_PROPS} /> },
};

export interface ParameterDockPanelProps {
  open: OpenSections;
  onToggle: (key: DockSectionKey) => void;
  onToggleAll: () => void;
  financialsBadge: FinancialsBadge;
  /** Cuerpo de cada sección; siempre montado (oculto con hidden al colapsar) para no reiniciar efectos como useCatalogPowerSync. */
  renderBody: (key: DockSectionKey) => React.ReactNode;
}

/** Panel plano del dock: encabezado, las 5 secciones y el pie con «Colapsar todo». */
export const ParameterDockPanel: React.FC<ParameterDockPanelProps> = ({ open, onToggle, onToggleAll, financialsBadge, renderBody }) => {
  const allOpen = allSectionsOpen(open);
  const allLabel = allOpen ? 'Colapsar todo' : 'Expandir todo';
  const Icon = allOpen ? ChevronsDownUp : ChevronsUpDown;
  const badge =
    financialsBadge.label === '' ? undefined : (
      <>
        {financialsBadge.items > 0 && <span>+{financialsBadge.items}</span>}
        {financialsBadge.items > 0 && financialsBadge.discounts > 0 && ' '}
        {financialsBadge.discounts > 0 && <span>−{financialsBadge.discounts}</span>}
      </>
    );

  return (
    <div className="flex min-h-full flex-col bg-pd-panel text-pd-text">
      <header className="flex h-12 flex-none items-center justify-between px-4">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-pd-strong">PARÁMETROS</h2>
        <button
          type="button"
          onClick={onToggleAll}
          title={allLabel}
          aria-label={allLabel}
          className="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-pd-muted hover:text-pd-strong"
        >
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <div className="flex-1">
        {DOCK_SECTION_KEYS.map((key) => (
          <ParamSection
            key={key}
            id={`dock-${key}`}
            title={SECTIONS[key].title}
            icon={SECTIONS[key].icon}
            open={open[key]}
            onToggle={() => onToggle(key)}
            badge={key === 'financials' ? badge : undefined}
            badgeLabel={key === 'financials' ? financialsBadge.label : undefined}
          >
            {renderBody(key)}
          </ParamSection>
        ))}
      </div>
      <footer className="flex-none border-t border-pd-border px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleAll}
          className="border-0 bg-transparent p-0 text-xs font-medium text-pd-accent hover:underline"
        >
          {allLabel}
        </button>
      </footer>
    </div>
  );
};
