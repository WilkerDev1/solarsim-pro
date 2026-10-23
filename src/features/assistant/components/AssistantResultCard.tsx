import React, { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '../../../store/useSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { EquipmentImagePreview } from '../../../components/common/equipment/EquipmentImagePreview';
import { fetchEquipmentAsset } from '../../../services/equipmentAssetService';
import { assistantFieldLabel, assistantValueLabel } from '../labels';
import type { AssistantAction, AssistantCard } from '../types';
import {
  assistantOwner,
  visibleAssistantProjects,
  visibleAssistantEquipment,
} from '../tools';
export function AssistantResultCard({ card }: { card: AssistantCard }) {
  const state = useSimulationStore(useShallow((s) => ({ syncSettings: s.syncSettings, setActiveProject: s.setActiveProject, openSettingsModal: s.openSettingsModal })));
  const [preview, setPreview] = useState<{
    url: string;
    pdf: boolean;
    thumbnail?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController>();
  const urlRef = useRef<string>();
  useEffect(
    () => () => {
      controller.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );
  const item = visibleAssistantEquipment().find((e) => e.id === card.id);
  const project = visibleAssistantProjects().find((p) => p.id === card.id);
  const openAsset = async () => {
    if (
      !item?.datasheetAssetId ||
      busy ||
      !visibleAssistantEquipment().some((e) => e.id === card.id)
    )
      return;
    const owner = assistantOwner();
    controller.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      const blob = await fetchEquipmentAsset(
        state.syncSettings.serverUrl,
        state.syncSettings.authToken || '',
        item.datasheetAssetId,
        controller.current.signal
      );
      if (owner !== assistantOwner() || controller.current.signal.aborted)
        return;
      if (
        !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(
          blob.type
        )
      )
        throw new Error('Formato de vista previa no permitido.');
      let thumbnail: string | undefined;
      if (blob.type === 'application/pdf') {
        const { PDFThumbnailService } =
          await import('../../../services/pdfThumbnailService');
        thumbnail = await PDFThumbnailService.generateThumbnail(
          await blob.arrayBuffer(),
          420
        );
      }
      if (owner !== assistantOwner() || controller.current.signal.aborted)
        return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setPreview({
        url: urlRef.current,
        pdf: blob.type === 'application/pdf',
        thumbnail,
      });
    } catch (e) {
      if (owner === assistantOwner())
        setError(
          e instanceof Error ? e.message : 'No se pudo abrir el adjunto.'
        );
    } finally {
      if (owner === assistantOwner()) setBusy(false);
    }
  };
  if (
    (card.kind === 'equipment' && !item) ||
    (card.kind === 'project' && !project)
  )
    return null;
  return (
    <div className="assistant-result">
      {card.kind === 'equipment' && item?.imageAssetIds?.[0] && (
        <EquipmentImagePreview
          id={item.imageAssetIds[0]}
          name={item.displayName}
        />
      )}
      <div className="assistant-result-content">
        <h3>{card.title}</h3>
        <p>{card.detail}</p>
        {card.kind === 'project' ? (
          <button
            onClick={() => {
              if (visibleAssistantProjects().some((p) => p.id === card.id))
                state.setActiveProject(card.id);
            }}
          >
            Abrir propuesta
          </button>
        ) : (
          <>
            {item?.datasheetAssetId && (
              <button onClick={() => void openAsset()} disabled={busy}>
                {busy ? 'Abriendo…' : 'Ver ficha técnica'}
              </button>
            )}
            <button onClick={() => state.openSettingsModal('equipment')}>
              Abrir inventario
            </button>
            {preview && (
              <div>
                {preview.pdf ? (
                  preview.thumbnail ? (
                    <img
                      alt={`Primera página de la ficha: ${card.title}`}
                      src={preview.thumbnail}
                      className="assistant-preview"
                    />
                  ) : (
                    <p>
                      No se pudo generar la vista previa. Puedes descargar la
                      ficha.
                    </p>
                  )
                ) : (
                  <img
                    alt={`Ficha: ${card.title}`}
                    src={preview.url}
                    className="assistant-preview"
                  />
                )}
                <a
                  className="assistant-asset-download"
                  href={preview.url}
                  download={item?.datasheetName || 'ficha-tecnica'}
                >
                  Descargar ficha completa
                </a>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
export function AssistantActionCard({
  action,
  disabled,
  onApplied,
}: {
  action: AssistantAction;
  disabled: boolean;
  onApplied: (text: string) => void;
}) {
  const [status, setStatus] = useState<'pending' | 'applied' | 'discarded'>(
    'pending'
  );
  const [error, setError] = useState('');
  return (
    <div className="assistant-result">
      <div className="assistant-result-content">
        <h3>{action.title}</h3>
        <p>
          {action.impact ?? (action.kind === 'equipment'
            ? 'Cambiará el catálogo compartido.'
            : 'Cambiará la propuesta abierta y recalculará el simulador.')}
        </p>
        <dl className="assistant-changes">
          {action.edits.map((e) => (
            <div key={`${e.section}.${e.field}`}>
              <dt>{assistantFieldLabel(e.field)}</dt>
              <dd>{assistantValueLabel(e.value)}</dd>
            </div>
          ))}
        </dl>
        {status === 'pending' ? (
          <>
            <button
              disabled={disabled}
              onClick={() => {
                try {
                  // Only queued plans can be confirmed: an evicted or expired plan must be prepared again.
                  const result = useSimulationStore.getState().confirmAgentAction(action.id);
                  if (!result.success) throw new Error(result.error || 'La acción ya no está disponible; pide al asistente que la prepare de nuevo.');
                  setStatus('applied');
                  setError('');
                  onApplied(
                    'Cambio aplicado localmente. La sincronización sigue el flujo habitual de la aplicación.'
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'No se pudo aplicar.'
                  );
                }
              }}
            >
              Confirmar cambio
            </button>
            <button disabled={disabled} onClick={() => { useSimulationStore.getState().rejectAgentAction(action.id); setStatus('discarded'); }}>
              Descartar
            </button>
          </>
        ) : (
          <p>{status === 'applied' ? 'Aplicado' : 'Descartado'}</p>
        )}
        {error && (
          <p role="alert" className="assistant-widget-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** A change the assistant already applied (drafts-free policy), with a one-click undo. */
export function AssistantAppliedCard({ activityId, title }: { activityId: string; title: string }) {
  const entry = useSimulationStore((s) => s.agentActivity.find((a) => a.id === activityId));
  const [error, setError] = useState('');
  if (!entry) return null;
  return (
    <div className="assistant-result">
      <div className="assistant-result-content">
        <h3>{title}</h3>
        <dl className="assistant-changes">
          {entry.changes.map((c, i) => (
            <div key={`${c.label}-${i}`}>
              <dt>{c.label}</dt>
              <dd>{c.value}</dd>
            </div>
          ))}
        </dl>
        {entry.status === 'applied' ? (
          <>
            <p>Aplicado. Queda en Ajustes → Agentes e IA.</p>
            <button
              onClick={() => {
                const result = useSimulationStore.getState().undoAgentActivity(activityId);
                setError(result.success ? '' : result.error || 'No se pudo deshacer.');
              }}
            >
              Deshacer
            </button>
          </>
        ) : (
          <p>Deshecho</p>
        )}
        {error && (
          <p role="alert" className="assistant-widget-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
