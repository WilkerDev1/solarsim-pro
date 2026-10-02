/**
 * 📅 formatProposalDate
 * Formatea de forma segura y consistente la fecha de emisión de una propuesta o cotización.
 * Soporta fechas personalizadas del proyecto (client.quoteDate o customization.quoteDate)
 * o fechas ISO (YYYY-MM-DD), asegurando que no se produzcan desfases por zona horaria.
 */
export function formatProposalDate(
  customDate?: string | null,
  mode: 'numeric' | 'long' = 'numeric'
): string {
  if (!customDate || !customDate.trim()) {
    return new Date().toLocaleDateString('es-DO', mode === 'numeric' ? {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    } : {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  const trimmed = customDate.trim();

  // Si ya es un formato numérico DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    if (mode === 'numeric') return trimmed;
    const [d, m, y] = trimmed.split('/');
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('es-DO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
    return trimmed;
  }

  // Si es formato estándar ISO YYYY-MM-DD de input tipo date
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-');
    const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString('es-DO', mode === 'numeric' ? {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      } : {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
  }

  // Si es fecha parseable por Date estándar
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('es-DO', mode === 'numeric' ? {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    } : {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  // Texto libre definido por el usuario (ej. "Octubre 2026")
  return trimmed;
}

/**
 * Obtiene el valor ISO YYYY-MM-DD para inicializar inputs de tipo date
 */
export function getProposalDateInputValue(customDate?: string | null): string {
  if (!customDate || !customDate.trim()) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const trimmed = customDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}
