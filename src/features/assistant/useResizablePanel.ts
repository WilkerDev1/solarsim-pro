import { useEffect, useRef, useState } from 'react';
export function useResizablePanel(initial = 360, min = 280, reserved = 400) {
  const [width, setWidth] = useState<number | undefined>(initial);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const clamp = (value: number) =>
    Math.max(
      min,
      Math.min(Math.min(720, window.innerWidth - 64 - reserved), value)
    );
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current)
        setWidth(clamp(drag.current.width + e.clientX - drag.current.x));
    };
    const end = () => {
      drag.current = null;
    };
    const resize = () => setWidth((w) => (w === undefined ? w : clamp(w)));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('resize', resize);
    };
  }, [min, reserved]);
  return {
    width,
    separatorProps: {
      role: 'separator' as const,
      tabIndex: 0,
      'aria-orientation': 'vertical' as const,
      'aria-label': 'Cambiar ancho del chat',
      'aria-valuemin': min,
      'aria-valuemax': 720,
      'aria-valuenow': width ?? initial,
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          x: event.clientX,
          width:
            event.currentTarget.parentElement?.getBoundingClientRect().width ||
            initial,
        };
      },
      onKeyDown: (event: React.KeyboardEvent) => {
        if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
          event.preventDefault();
          setWidth(
            event.key === 'Home'
              ? undefined
              : clamp(
                  (width ?? initial) + (event.key === 'ArrowRight' ? 24 : -24)
                )
          );
        }
      },
    },
  };
}
