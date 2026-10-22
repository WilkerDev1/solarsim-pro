import React from 'react';
import { parseRichText, type RichLine } from '../../../../shared/documentTexts/richText';

interface RichTextProps {
  text: string;
  format?: 'plain' | 'rich';
  boldClassName?: string;
  boldStyle?: React.CSSProperties;
}

function renderLine(line: RichLine, boldClassName: string | undefined, boldStyle: React.CSSProperties | undefined) {
  return line.map((segment, index) => {
    let node: React.ReactNode = segment.text;
    if (segment.italic) node = <em key={`i${index}`}>{node}</em>;
    if (segment.bold) node = <strong key={`b${index}`} className={boldClassName} style={boldStyle}>{node}</strong>;
    return <React.Fragment key={index}>{node}</React.Fragment>;
  });
}

function withBreaks(lines: React.ReactNode[]) {
  return lines.map((line, index) => (
    <React.Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </React.Fragment>
  ));
}

/**
 * Texto del documento listo para html2canvas: párrafos como bloques, viñetas como spans `•`
 * (nunca `<ul>`/`::marker`) y un texto de una sola línea se queda en línea.
 */
export const RichText: React.FC<RichTextProps> = ({ text, format = 'rich', boldClassName = 'font-bold', boldStyle }) => {
  if (format === 'plain') return <>{withBreaks(text.split('\n'))}</>;
  const blocks = parseRichText(text);
  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    return <>{withBreaks(blocks[0].lines.map((line) => renderLine(line, boldClassName, boldStyle)))}</>;
  }
  return (
    <>
      {blocks.map((block, index) => {
        const style = index > 0 && !block.tight ? { display: 'block', marginTop: '0.75em' } : { display: 'block' };
        if (block.type === 'paragraph') {
          return <span key={index} style={style}>{withBreaks(block.lines.map((line) => renderLine(line, boldClassName, boldStyle)))}</span>;
        }
        return (
          <span key={index} style={style}>
            {block.items.map((item, itemIndex) => (
              <span key={itemIndex} style={{ display: 'flex', gap: '0.4em' }}>
                <span aria-hidden="true">•</span>
                <span>{renderLine(item, boldClassName, boldStyle)}</span>
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
};
