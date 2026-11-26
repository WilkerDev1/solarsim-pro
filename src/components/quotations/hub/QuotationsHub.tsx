import { useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { canWrite } from '../../../../shared/permissions';
import type { QuotationCurrency } from '../../../../shared/quotations';
import { createAndOpenQuotation } from '../../../features/quotations/newQuotation';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { hiddenFolderIdSet } from '../../../utils/folderVisibility';
import { localIsoDate } from '../../../utils/localDate';
import {
  QUOTATION_VIEWS, countQuotationsByView, filterQuotations, pendingPublishCount, quotationSyncIssue, summarizeQuotations, viewShowing, type QuotationView,
} from '../../../utils/quotationSummary';
import type { QuotationRecord } from '../../../types/quotation';
import { confirmAction } from '../../common/confirmAction';
import { QuotationDetailDock } from './QuotationDetailDock';
import { QuotationsKpis } from './QuotationsKpis';
import { QuotationsList } from './QuotationsList';
import { QuotationsSidebar } from './QuotationsSidebar';

/** Catálogo de cotizaciones: vistas por estado, carpetas, indicadores, lista y dock de detalle (docs/QUOTATIONS.md#catálogo). */
export function QuotationsHub() {
  const {
    quotations, quotationChanges, quotationDeletionQueue, quotationSyncFeedback, folders, sidebarTheme, syncSettings,
    openQuotation, moveQuotationToFolder, deleteQuotationRecord, syncQuotationsWithServer,
  } = useSimulationStore(useShallow((s) => ({
    quotations: s.quotations, quotationChanges: s.quotationChanges, quotationDeletionQueue: s.quotationDeletionQueue,
    quotationSyncFeedback: s.quotationSyncFeedback, folders: s.folders, sidebarTheme: s.sidebarTheme, syncSettings: s.syncSettings,
    openQuotation: s.openQuotation, moveQuotationToFolder: s.moveQuotationToFolder, deleteQuotationRecord: s.deleteQuotationRecord,
    syncQuotationsWithServer: s.syncQuotationsWithServer,
  })));
  const [view, setView] = useState<QuotationView>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState<'all' | QuotationCurrency>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [headerMessage, setHeaderMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const today = localIsoDate();
  const user = syncSettings.currentUser;
  const readOnly = !canWrite(user);
  const online = !!user && !!syncSettings.authToken;
  const hiddenFolderIds = useMemo(() => hiddenFolderIdSet(folders), [folders]);
  const activeFolder = folderId ? folders.find((f) => f.id === folderId) ?? null : null;
  const scope = { folderId: activeFolder?.id ?? null, hiddenFolderIds };
  const counts = useMemo(() => countQuotationsByView(quotations, today, scope), [quotations, today, scope.folderId, hiddenFolderIds]);
  const kpis = useMemo(() => summarizeQuotations(quotations, today, scope), [quotations, today, scope.folderId, hiddenFolderIds]);
  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of quotations) if (q.folderId) map.set(q.folderId, (map.get(q.folderId) ?? 0) + 1);
    return map;
  }, [quotations]);
  const visible = useMemo(
    () => filterQuotations(quotations, { ...scope, view, query, currency, today }),
    [quotations, scope.folderId, hiddenFolderIds, view, query, currency, today],
  );
  // La selección es local: sin elección (o si deja de verse) el dock muestra la primera de la lista.
  const selected = visible.find((q) => q.id === selectedId) ?? visible[0] ?? null;
  const visibleChecked = useMemo(() => new Set(visible.filter((q) => checked.has(q.id)).map((q) => q.id)), [visible, checked]);
  const issueFor = (id: string) => quotationSyncIssue(id, { changes: quotationChanges, deletionQueue: quotationDeletionQueue, userId: user?.id, signedIn: !!user });
  const pendingCount = pendingPublishCount(quotationChanges, quotationDeletionQueue, user?.id);
  const title = QUOTATION_VIEWS.find((v) => v.id === view)?.title ?? 'Cotizaciones';

  /** La copia recién duplicada (un borrador) queda seleccionada y a la vista: si la vista activa no la contiene, Borradores. */
  const showDuplicate = (copy: QuotationRecord) => {
    const filter = { ...scope, view, query, currency, today };
    const nextView = viewShowing(copy, filter);
    setView(nextView);
    if (!filterQuotations([copy], { ...filter, view: nextView }).length) {
      // La búsqueda, la moneda o una carpeta oculta también la esconderían: se quitan para que se vea.
      setQuery('');
      setCurrency('all');
      if (!filterQuotations([copy], { ...filter, view: nextView, query: '', currency: 'all' }).length) setFolderId(copy.folderId ?? null);
    }
    setSelectedId(copy.id);
  };
  const create = () => {
    setHeaderMessage(null);
    const result = createAndOpenQuotation();
    if (!result.ok) setHeaderMessage({ text: `Nueva cotización: ${result.error}`, error: true });
  };
  const sync = async () => {
    setSyncing(true);
    setHeaderMessage(null);
    const result = await syncQuotationsWithServer();
    setSyncing(false);
    setHeaderMessage({ text: result.message, error: !result.success });
  };
  const bulkMove = (target: string | null) => {
    const failures: string[] = [];
    for (const id of visibleChecked) {
      const result = moveQuotationToFolder(id, target);
      if (!result.ok) failures.push(result.error);
    }
    const moved = visibleChecked.size - failures.length;
    setBulkMessage(failures.length ? `${moved} movida(s); ${failures.length} no se movieron: ${failures[0]}` : null);
    if (!failures.length) setChecked(new Set());
  };
  const bulkDelete = async () => {
    const ids = [...visibleChecked];
    if (!ids.length) return;
    if (!(await confirmAction({
      title: 'Eliminar cotizaciones',
      message: `¿Eliminar ${ids.length === 1 ? '1 cotización' : `${ids.length} cotizaciones`}? Se eliminan también en el servidor al sincronizar; sus números no se reutilizan.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    }))) return;
    const failures: string[] = [];
    for (const id of ids) {
      const result = deleteQuotationRecord(id);
      if (!result.ok) failures.push(result.error);
    }
    setBulkMessage(failures.length ? `${ids.length - failures.length} eliminada(s); ${failures.length} no se eliminaron: ${failures[0]}` : null);
    setChecked(new Set());
  };
  const toggle = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="quotations-hub" data-theme={sidebarTheme}>
      <QuotationsSidebar
        view={view}
        counts={counts}
        folders={folders}
        folderCounts={folderCounts}
        folderId={activeFolder?.id ?? null}
        onView={(next) => { setView(next); setBulkMessage(null); }}
        onFolder={(next) => { setFolderId(next); setBulkMessage(null); }}
      />
      <div className="qh-main">
        <header className="qh-header">
          <div>
            <h1>{title}</h1>
            <p className="qh-header-sub">
              {activeFolder && <span>Carpeta «{activeFolder.name}» ·</span>}
              {!user
                ? <span>Guardadas en este equipo.</span>
                : quotationSyncFeedback
                  ? <span>Sincronización pendiente de revisar.</span>
                  : <span>{pendingCount ? `${pendingCount} cambio(s) pendientes de publicar.` : 'Sin cambios pendientes de publicar.'}</span>}
            </p>
          </div>
          <div className="qh-header-actions">
            {online && (
              <button type="button" className="qh-btn qh-btn-lg" disabled={syncing} aria-busy={syncing} onClick={() => void sync()}>
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
                {syncing ? 'Sincronizando…' : 'Sincronizar'}
              </button>
            )}
            {!readOnly && (
              <button type="button" className="qh-btn qh-btn-primary qh-btn-lg" onClick={create}>
                <Plus className="h-4 w-4" aria-hidden="true" />Nueva cotización
              </button>
            )}
          </div>
        </header>
        {user && quotationSyncFeedback && <p className="qh-notice qh-notice-error" role="alert">{quotationSyncFeedback}</p>}
        {headerMessage && !(headerMessage.error && headerMessage.text === quotationSyncFeedback) && (
          <p className={`qh-notice ${headerMessage.error ? 'qh-notice-error' : ''}`} role={headerMessage.error ? 'alert' : 'status'}>{headerMessage.text}</p>
        )}

        <QuotationsKpis kpis={kpis} />
        <p className="qh-kpi-note">Importes en RD$: cada cotización se convierte con su propia tasa de cambio. Las vencidas son emitidas con la vigencia ya pasada.</p>

        <div className="qh-workspace">
          <QuotationsList
            quotations={visible}
            totalCount={quotations.length}
            today={today}
            readOnly={readOnly}
            selectedId={selected?.id ?? null}
            checked={visibleChecked}
            folders={folders}
            query={query}
            currency={currency}
            bulkMessage={bulkMessage}
            issueFor={issueFor}
            onQuery={setQuery}
            onCurrency={setCurrency}
            onSelect={setSelectedId}
            onOpen={openQuotation}
            onToggle={toggle}
            onToggleAll={(all) => setChecked(all ? new Set(visible.map((q) => q.id)) : new Set())}
            onBulkMove={bulkMove}
            onBulkDelete={() => void bulkDelete()}
            onCreate={readOnly ? undefined : create}
            onClearFilters={() => { setQuery(''); setCurrency('all'); setView('all'); setFolderId(null); }}
          />
          {selected ? (
            <QuotationDetailDock key={selected.id} quotation={selected} today={today} readOnly={readOnly} onDuplicated={showDuplicate} />
          ) : (
            <aside className="qh-panel qh-dock" aria-label="Detalle de la cotización seleccionada">
              <p className="qh-dock-empty">{quotations.length ? 'Selecciona una cotización para ver su detalle.' : 'Aquí verás el detalle de la cotización seleccionada.'}</p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
