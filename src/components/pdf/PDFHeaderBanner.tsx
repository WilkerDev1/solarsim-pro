import React from 'react';
import { PDFColorTheme } from '../../constants/pdfThemes';
import { DocumentCustomization } from '../../types';
import { ELECTSUN_LOGO_WHITE_BASE64 } from '../../assets/electsunLogo';
import { DEFAULT_DOCUMENT_CUSTOMIZATION } from '../../constants/defaultDocumentCustomization';

interface PDFHeaderBannerProps {
  activeTheme: PDFColorTheme;
  projectId: string;
  clientName: string;
  systemCapacityKWp: number;
  location: string;
  currentDateStr: string;
  pageTitle: string;
  customization?: DocumentCustomization;
}

export const PDFHeaderBanner: React.FC<PDFHeaderBannerProps> = ({
  activeTheme,
  projectId,
  clientName,
  systemCapacityKWp,
  location,
  currentDateStr,
  pageTitle,
  customization,
}) => {
  const companyName = customization?.companyName || DEFAULT_DOCUMENT_CUSTOMIZATION.companyName || 'electsun';
  const companySlogan = customization?.companySlogan || DEFAULT_DOCUMENT_CUSTOMIZATION.companySlogan || 'El sol a tu favor';
  const isDefaultElectsun = companyName.toLowerCase().trim() === 'electsun';

  return (
    <>
      <div
        style={{ backgroundColor: activeTheme.primary }}
        className="text-white px-10 py-5 flex justify-between items-center transition-colors"
      >
        <div>
          <h2 className="text-[11px] font-semibold text-white/80 uppercase tracking-wider">
            PROPUESTA TÉCNICA Y ECONÓMICA • ID: {projectId || 'SP-2024-089'}
          </h2>
          <h1 className="text-xl font-bold uppercase tracking-tight text-white mt-0.5">
            {clientName} — {systemCapacityKWp.toFixed(2)}kWp
          </h1>
          <p className="text-[11px] text-white/80 mt-0.5">
            Ubicación: <span className="font-semibold text-white">{location}</span> | Fecha:{' '}
            <span className="font-semibold text-white">{currentDateStr}</span>
          </p>
        </div>

        <div className="text-right flex items-center justify-end pl-6">
          {customization?.headerLogoBase64 ? (
            <img
              src={customization.headerLogoBase64}
              alt={companyName}
              className="h-[62px] max-h-[64px] w-auto object-contain drop-shadow-xs"
            />
          ) : isDefaultElectsun ? (
            <img
              src={ELECTSUN_LOGO_WHITE_BASE64}
              alt="electsun - El sol a tu favor"
              className="h-[62px] max-h-[64px] w-auto object-contain drop-shadow-xs"
            />
          ) : (
            <div className="text-right">
              <div className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5 justify-end">
                <span className="w-3.5 h-3.5 bg-white/90 rounded-full inline-block"></span> {companyName}
              </div>
              <p className="text-[10px] text-white/80 tracking-wider font-semibold uppercase">{companySlogan}</p>
            </div>
          )}
        </div>
      </div>

      <div
        style={{ backgroundColor: activeTheme.secondary }}
        className="text-center text-white py-1.5 font-bold text-xs uppercase tracking-wider transition-colors"
      >
        {pageTitle}
      </div>
    </>
  );
};
