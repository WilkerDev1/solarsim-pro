import React from 'react';

/**
 * Parses markdown-style bold formatting (**text**) and renders it as React elements.
 * Preserves normal text, spaces, and linebreaks.
 *
 * @param text The input text string containing optional **bold** markdown markers
 * @param boldClassName CSS class applied to <strong> tags (default: 'text-slate-950 font-bold')
 * @param style Optional inline styles (e.g. dynamic primary color)
 */
export function renderFormattedMarkdown(
  text?: string | null,
  boldClassName = 'text-slate-950 font-bold',
  style?: React.CSSProperties
): React.ReactNode {
  if (!text) return null;

  // Split by markdown bold delimiter: (**content**)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      const content = part.slice(2, -2);
      return (
        <strong key={index} className={boldClassName} style={style}>
          {content}
        </strong>
      );
    }
    return part;
  });
}
