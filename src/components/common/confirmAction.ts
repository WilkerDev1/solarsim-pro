// In-app replacement for the browser's native confirm dialog: `await confirmAction({...})` resolves true/false
// once the user answers the <ConfirmDialog /> mounted in App. Requests are answered one at a time, in order.
export type ConfirmTone = 'danger' | 'default';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type FocusTarget = 'cancel' | 'confirm';

interface PendingConfirm { options: ConfirmOptions; resolve: (value: boolean) => void }

export const createConfirmQueue = () => {
  const pending: PendingConfirm[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    request(options: ConfirmOptions): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        pending.push({ options, resolve });
        if (pending.length === 1) notify();
      });
    },
    current: (): ConfirmOptions | null => pending[0]?.options ?? null,
    resolve(value: boolean) {
      const head = pending.shift();
      if (!head) return;
      head.resolve(value);
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
};

export const confirmQueue = createConfirmQueue();

export const confirmAction = (options: ConfirmOptions) => confirmQueue.request(options);

export const initialConfirmFocus = (tone: ConfirmTone | undefined): FocusTarget => (tone === 'danger' ? 'cancel' : 'confirm');

// Enter on the focused Cancel button is left to the button itself, so it cancels.
export const confirmKeyAction = ({ key, shiftKey, focused }: { key: string; shiftKey: boolean; focused: FocusTarget | null }) => {
  if (key === 'Escape') return 'cancel' as const;
  if (key === 'Enter') return focused === 'cancel' ? null : ('confirm' as const);
  // Two buttons: Tab and Shift+Tab both move to the other one, so focus never leaves the dialog.
  if (key === 'Tab') return (focused ? focused === 'cancel' : shiftKey) ? ('focus-confirm' as const) : ('focus-cancel' as const);
  return null;
};
