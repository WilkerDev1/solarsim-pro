/**
 * Gancho SOLO de desarrollo (F5a): `window.solarsimFeedbackQA`, para ver el resaltado del dock y la tarjeta de cambio a mano
 * sin pasar por el modelo (desde F5b el panel del asistente ya las monta con los datos reales de cada turno). Se instala
 * únicamente con `import.meta.env.DEV` (`main.tsx`); en producción ni se
 * importa. Uso y ejemplos: docs/QA.md («Feedback en vivo del asistente»).
 *
 *   solarsimFeedbackQA.edit([{ path: 'rates.targetCoveragePct', value: 85 }])  // lote con origen asistente: destaca + tarjeta
 *   solarsimFeedbackQA.highlight(['client.name', 'specs.panels[0].count'])     // solo el destacado, sin escribir nada
 *   solarsimFeedbackQA.card({ status: 'pending_confirmation', ... })            // la tarjeta con otra entrada
 *   solarsimFeedbackQA.close()                                                  // quita la tarjeta
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useSimulationStore } from '../../store/useSimulationStore';
import { dockHighlightStore } from '../../store/dockHighlightStore';
import type { ProjectFieldEdit } from '../../domain/projectEditTransaction';
import { ChangeCard } from './ChangeCard';
import type { ChangeCardInput } from './changeCardModel';
import { assistantEditForQa } from './devActions';

export interface FeedbackQaApi {
  edit: (edits: ProjectFieldEdit[], title?: string) => unknown;
  highlight: (paths: string[]) => void;
  card: (input: ChangeCardInput) => void;
  close: () => void;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function show(input: ChangeCardInput | null, handlers: { onUndo?: () => void } = {}) {
  if (typeof document === 'undefined') return;
  if (!input) { close(); return; }
  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-feedback-qa-card', '');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:70;width:360px;max-height:70vh;overflow:auto;background:#18212d;border-radius:12px;padding:4px 12px 12px;box-shadow:0 12px 40px rgba(0,0,0,.35)';
    document.body.appendChild(host);
    root = createRoot(host);
  }
  root!.render(React.createElement(ChangeCard, { input, ...handlers }));
}

function close() {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}

export function installAssistantFeedbackDevHook(target: Record<string, unknown> = window as unknown as Record<string, unknown>): FeedbackQaApi {
  const api: FeedbackQaApi = {
    edit: (edits, title) => {
      const outcome = assistantEditForQa(edits, title);
      show(outcome.input, { onUndo: () => { useSimulationStore.getState().undo(); close(); } });
      return outcome.result;
    },
    highlight: (paths) => {
      const project = useSimulationStore.getState().getActiveProject();
      dockHighlightStore.publish(project.id, paths.map((path) => ({ path })));
    },
    card: (input) => show(input, { onUndo: close }),
    close,
  };
  target.solarsimFeedbackQA = api;
  return api;
}
