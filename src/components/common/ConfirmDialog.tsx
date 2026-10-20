import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { confirmKeyAction, confirmQueue, initialConfirmFocus } from './confirmAction';

// Mounted once in App. A native modal <dialog> joins the top layer, so it also covers other modal dialogs.
export const ConfirmDialog: React.FC = () => {
  const options = useSyncExternalStore(confirmQueue.subscribe, confirmQueue.current, confirmQueue.current);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!options || !element) return;
    if (!element.open) element.showModal?.();
    (initialConfirmFocus(options.tone) === 'cancel' ? cancelButton : confirmButton).current?.focus();
    return () => { if (element.open) element.close(); };
  }, [options]);

  if (!options) return null;
  // Close before resolving: the opener behind a still-open modal dialog is inert and cannot take focus.
  const answer = (value: boolean) => { if (dialog.current?.open) dialog.current.close(); confirmQueue.resolve(value); };
  const danger = options.tone === 'danger';

  const onKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    const focused = document.activeElement === cancelButton.current ? 'cancel' : document.activeElement === confirmButton.current ? 'confirm' : null;
    const action = confirmKeyAction({ key: event.key, shiftKey: event.shiftKey, focused });
    if (!action) return;
    event.preventDefault();
    if (action === 'cancel') answer(false);
    else if (action === 'confirm') answer(true);
    else (action === 'focus-cancel' ? cancelButton : confirmButton).current?.focus();
  };

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      data-tone={danger ? 'danger' : 'default'}
      onCancel={(event) => { event.preventDefault(); answer(false); }}
      onKeyDown={onKeyDown}
      className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-[#dce2e8] bg-white p-6 text-[#182230] shadow-2xl backdrop:bg-black/50 dark:border-[#363b43] dark:bg-[#1c1f23] dark:text-[#f1f3f5]"
    >
      <h2 id={titleId} className="text-base font-semibold">{options.title}</h2>
      <p id={messageId} className="mt-2 whitespace-pre-line text-sm text-[#536174] dark:text-[#abb4c0]">{options.message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          ref={cancelButton}
          type="button"
          onClick={() => answer(false)}
          className="rounded-lg border border-[#dce2e8] bg-white px-[13px] py-[9px] text-sm font-medium text-[#182230] hover:bg-[#f6f8fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087b58] dark:border-[#363b43] dark:bg-[#1c1f23] dark:text-[#f1f3f5] dark:hover:bg-[#141619] dark:focus-visible:ring-[#6be0b5]"
        >
          {options.cancelLabel || 'Cancelar'}
        </button>
        <button
          ref={confirmButton}
          type="button"
          onClick={() => answer(true)}
          className={`rounded-lg px-[13px] py-[9px] text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1c1f23] ${danger ? 'bg-[#c93545] hover:bg-[#ad2435] focus-visible:ring-[#c93545] dark:focus-visible:ring-[#ff9aaa]' : 'bg-[#087b58] hover:bg-[#066344] focus-visible:ring-[#087b58] dark:focus-visible:ring-[#6be0b5]'}`}
        >
          {options.confirmLabel || 'Confirmar'}
        </button>
      </div>
    </dialog>
  );
};
