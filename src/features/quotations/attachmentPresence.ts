import { useEffect, useState } from 'react';
import { PDFAttachmentStorage } from '../../services/pdfAttachmentStorage';

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Qué adjuntos tienen sus bytes guardados en este equipo (`PDFAttachmentStorage`, por id). Solo lee y guarda el
 * resultado en estado local: nunca escribe en el store. Mientras no se sabe (o en un render estático), ninguno.
 */
export function useLocalAttachmentPresence(ids: readonly string[]): ReadonlySet<string> {
  const key = ids.join('\n');
  const [present, setPresent] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: '', ids: EMPTY });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const list = key.split('\n');
    void Promise.all(list.map((id) => PDFAttachmentStorage.hasAttachment(id))).then((found) => {
      if (!cancelled) setPresent({ key, ids: new Set(list.filter((_, index) => found[index])) });
    });
    return () => { cancelled = true; };
  }, [key]);
  return present.key === key ? present.ids : EMPTY;
}
