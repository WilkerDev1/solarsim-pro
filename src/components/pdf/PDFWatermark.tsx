import React from 'react';
import { ELECTSUN_EMBLEM_WATERMARK_BASE64 } from '../../assets/electsunLogo';

interface PDFWatermarkProps {
  opacity?: number;
}

export const PDFWatermark: React.FC<PDFWatermarkProps> = ({ opacity = 0.045 }) => {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      <img
        src={ELECTSUN_EMBLEM_WATERMARK_BASE64}
        alt=""
        style={{ opacity }}
        className="w-[520px] h-[520px] max-w-[75%] max-h-[75%] object-contain"
      />
    </div>
  );
};
