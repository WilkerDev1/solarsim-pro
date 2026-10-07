/** Prevents a previous opening or publication request from updating a reopened modal. */
export function createShareRequestGuard() {
  let scope: string | null = null;
  let open = false;
  let opening = 0;
  let request = 0;

  return {
    update(nextScope: string, nextOpen: boolean): void {
      if (scope !== nextScope || open !== nextOpen) opening++;
      scope = nextScope;
      open = nextOpen;
    },
    invalidate(): void {
      opening++;
      open = false;
    },
    begin(): () => boolean {
      const capturedOpening = opening;
      const capturedRequest = ++request;
      return () => open && opening === capturedOpening && request === capturedRequest;
    },
  };
}
