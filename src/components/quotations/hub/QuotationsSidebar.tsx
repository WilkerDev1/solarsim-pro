import { Folder } from 'lucide-react';
import type { ProjectFolder } from '../../../types/folder';
import { QUOTATION_VIEWS, type QuotationView } from '../../../utils/quotationSummary';

const countLabel = (count: number) => (count === 1 ? '1 cotización' : `${count} cotizaciones`);

interface QuotationsSidebarProps {
  view: QuotationView;
  counts: Record<QuotationView, number>;
  folders: readonly ProjectFolder[];
  folderCounts: ReadonlyMap<string, number>;
  folderId: string | null;
  onView: (view: QuotationView) => void;
  onFolder: (folderId: string | null) => void;
}

/** Vistas por estado efectivo con su recuento y, debajo, las carpetas del espacio de trabajo para filtrar. */
export function QuotationsSidebar({ view, counts, folders, folderCounts, folderId, onView, onFolder }: QuotationsSidebarProps) {
  return (
    <aside className="qh-nav" aria-label="Vistas y carpetas de cotizaciones">
      <p className="qh-nav-title" aria-hidden="true">Cotizaciones</p>
      <nav aria-label="Vistas por estado">
        <ul className="qh-nav-group">
          {QUOTATION_VIEWS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="qh-nav-item"
                aria-current={view === item.id ? 'true' : undefined}
                onClick={() => onView(item.id)}
              >
                <span className="qh-dot" data-view={item.id} aria-hidden="true" />
                <span>{item.label}</span>
                <span className="qh-nav-count" aria-label={countLabel(counts[item.id])}>{counts[item.id]}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-labelledby="qh-folders-title">
        <h2 id="qh-folders-title" className="qh-nav-label">Carpetas</h2>
        {folders.length === 0 ? (
          <p className="qh-nav-empty">Sin carpetas. Créalas desde Inicio para organizar propuestas y cotizaciones.</p>
        ) : (
          <ul className="qh-nav-group">
            {folders.map((folder) => {
              const active = folderId === folder.id;
              return (
                <li key={folder.id}>
                  <button
                    type="button"
                    className="qh-nav-item"
                    aria-pressed={active}
                    title={active ? 'Quitar el filtro de carpeta' : undefined}
                    onClick={() => onFolder(active ? null : folder.id)}
                  >
                    <Folder className="h-4 w-4 shrink-0" aria-hidden="true" style={folder.color?.startsWith('#') ? { color: folder.color } : undefined} />
                    <span>{folder.name}</span>
                    <span className="qh-nav-count" aria-label={countLabel(folderCounts.get(folder.id) ?? 0)}>{folderCounts.get(folder.id) ?? 0}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
