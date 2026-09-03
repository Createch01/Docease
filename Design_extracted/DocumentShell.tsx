/**
 * DocumentShell.tsx — DocEase v3 (new design system)
 *
 * A4 PRINT CONTRACT PRESERVED VERBATIM:
 *   - .document-print-container · .high-res-print
 *   - 2480 × 3508 px canvas at 1× · scale={s} → multiplies positions consistently
 *   - @media print rules unchanged
 *   - .font-arabic preserved on RTL blocks
 *
 * Visual updates (printed document):
 *   - Title pill: emerald → primary clinical teal #1A6B8A
 *   - Divider: thinner slate-200
 *   - Date: dotted underline 2px
 *   - Footer: defaults to slate-900 (#0F172A) unless appearance.footerColor set
 *
 * Logic, props — UNCHANGED.
 */

import React from 'react';
import { DoctorInfo, PrescriptionAppearance } from '../types';
import { QRCodeSVG } from 'qrcode.react';

interface DocumentShellProps {
  id?: string;
  doctor: DoctorInfo;
  appearance: PrescriptionAppearance;
  patient: {
    name?: string;
    age?: number;
    sex?: 'M' | 'F';
    type?: string;
  };
  date: string;
  title: string;
  children: React.ReactNode;
  showQr?: boolean;
  qrValue?: string;
  scale?: number;
}

const DocumentShell: React.FC<DocumentShellProps> = ({
  id = 'document-template',
  doctor,
  appearance,
  patient,
  date,
  title,
  children,
  showQr: propShowQr,
  qrValue: propQrValue,
  scale = 1,
}) => {
  const fontClass =
    appearance.fontFamily === 'serif' ? 'font-serif'
    : appearance.fontFamily === 'mono' ? 'font-mono'
    : 'font-sans';

  // Token-aligned defaults
  const primaryColor   = appearance.primaryColor   || '#0F172A'; // slate-900 — for doctor name
  const secondaryColor = appearance.secondaryColor || '#475569'; // slate-600 — for specialty
  const accentColor    = '#1A6B8A'; // --color-primary — title pill
  const logoPosition   = appearance.logoPosition   || 'center';
  const footerVerticalOffset = appearance.footerVerticalOffset || 0;
  const showQr = propShowQr !== undefined
    ? propShowQr
    : appearance.enableQrCode !== undefined ? appearance.enableQrCode : false;
  const qrSize = appearance.qrCodeSize || 180;

  const qrValue = propQrValue
    || `Dr ${doctor.nameFr}\nPatient: ${patient.name || 'N/A'}\nDate: ${date}\n${title}`;

  const honorific =
    patient.sex === 'F' ? 'Mme'
    : patient.type === 'Child' ? 'Enfant'
    : 'M.';

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden !important; border: none !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
              .document-print-container, .document-print-container * { visibility: visible !important; }
              .document-print-container {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 210mm !important;
                height: 297mm !important;
                background: white !important;
                overflow: visible !important;
                display: block !important;
              }
              .high-res-print {
                transform: scale(0.32) !important;
                transform-origin: top left !important;
                width: 2480px !important;
                height: 3508px !important;
              }
              @page { size: A4; margin: 0; }
            }
          `,
        }}
      />

      <div
        className="document-print-container"
        style={{
          width: scale === 1 ? '2480px' : `${2480 * scale}px`,
          height: scale === 1 ? '3508px' : `${3508 * scale}px`,
          overflow: 'hidden',
          backgroundColor: 'white',
        }}
      >
        <div
          id={id}
          className={`high-res-print relative bg-white text-black ${fontClass}`}
          style={{
            width: '2480px',
            height: '3508px',
            position: 'relative',
            boxSizing: 'border-box',
            backgroundColor: 'white',
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          {/* ─────────── 1. HEADER ─────────── */}
          <div style={{ position: 'absolute', left: '160px', top: '140px', width: '2160px', height: '520px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {logoPosition === 'left' ? (
              <>
                <div style={{ width: '400px', height: '520px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                  {appearance.logoUrl && (
                    <img src={appearance.logoUrl} style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', transform: `scale(${appearance.logoScale})` }} />
                  )}
                </div>
                <div style={{ width: '840px', textAlign: 'left' }}>
                  <h1 style={{ fontSize: '58px', fontWeight: 700, marginBottom: '14px', color: primaryColor, letterSpacing: '-0.5px' }}>
                    Dr&nbsp;{doctor.nameFr}
                  </h1>
                  <p style={{ fontSize: '38px', fontWeight: 500, color: secondaryColor }}>{doctor.specialtyFr}</p>
                  <div style={{ fontSize: '26px', fontWeight: 400, color: '#64748B', marginTop: '14px', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {doctor.diplomasFr}
                  </div>
                </div>
                <div style={{ width: '840px', textAlign: 'right' }} dir="rtl">
                  <h1 className="font-arabic" style={{ fontSize: '58px', fontWeight: 700, marginBottom: '14px', color: primaryColor }}>{doctor.nameAr}</h1>
                  <p className="font-arabic" style={{ fontSize: '38px', fontWeight: 500, color: secondaryColor }}>{doctor.specialtyAr}</p>
                  <div className="font-arabic" style={{ fontSize: '26px', fontWeight: 400, color: '#64748B', marginTop: '14px', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {doctor.diplomasAr}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ width: '800px', textAlign: 'left' }}>
                  <h1 style={{ fontSize: '58px', fontWeight: 700, color: primaryColor, letterSpacing: '-0.5px' }}>
                    Dr&nbsp;{doctor.nameFr}
                  </h1>
                  <p style={{ fontSize: '38px', fontWeight: 500, color: secondaryColor, marginTop: '8px' }}>{doctor.specialtyFr}</p>
                  <div style={{ fontSize: '26px', fontWeight: 400, color: '#64748B', marginTop: '14px', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {doctor.diplomasFr}
                  </div>
                </div>
                <div style={{ width: '480px', display: 'flex', justifyContent: 'center' }}>
                  {appearance.logoUrl && (
                    <img src={appearance.logoUrl} style={{ width: '100%', maxHeight: '480px', objectFit: 'contain', transform: `scale(${appearance.logoScale})` }} />
                  )}
                </div>
                <div style={{ width: '800px', textAlign: 'right' }} dir="rtl">
                  <h1 className="font-arabic" style={{ fontSize: '58px', fontWeight: 700, color: primaryColor }}>{doctor.nameAr}</h1>
                  <p className="font-arabic" style={{ fontSize: '38px', fontWeight: 500, color: secondaryColor, marginTop: '8px' }}>{doctor.specialtyAr}</p>
                  <div className="font-arabic" style={{ fontSize: '26px', fontWeight: 400, color: '#64748B', marginTop: '14px', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
                    {doctor.diplomasAr}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Divider */}
          <div style={{ position: 'absolute', left: '160px', top: '680px', width: '2160px', height: '2px', backgroundColor: '#E2E8F0' }} />

          {/* ─────────── 2. TITLE PILL ─────────── */}
          <div
            style={{
              position: 'absolute',
              top: '760px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: accentColor,
              color: 'white',
              padding: '32px 110px',
              borderRadius: '999px',
              fontWeight: 700,
              fontSize: '76px',
              textTransform: 'uppercase',
              letterSpacing: '3px',
            }}
          >
            {title}
          </div>

          {/* ─────────── 3. DATE ─────────── */}
          <div style={{ position: 'absolute', right: '160px', top: '950px', fontSize: '40px', fontWeight: 400, color: '#64748B' }}>
            Le&nbsp;:&nbsp;
            <span style={{ fontWeight: 700, color: '#0F172A', borderBottom: '2px dotted #CBD5E0', paddingBottom: '4px' }}>{date}</span>
          </div>

          {/* ─────────── 4. PATIENT INFO ─────────── */}
          <div style={{ position: 'absolute', left: '160px', top: '1100px', width: '2160px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '64px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '24px', letterSpacing: '-0.5px' }}>
              <span style={{ color: secondaryColor, fontSize: '44px', fontWeight: 500 }}>{honorific}</span>
              {patient.name || '................................................'}
            </h2>
            {patient.age ? (
              <p style={{ fontSize: '34px', color: secondaryColor, marginTop: '18px', fontWeight: 500 }}>
                {patient.age}&nbsp;ans
              </p>
            ) : null}
          </div>

          {/* ─────────── 5. MAIN CONTENT ─────────── */}
          <div style={{ position: 'absolute', left: '160px', top: '1350px', width: '2160px', height: '1650px', overflow: 'visible' }}>
            {children}
          </div>

          {/* ─────────── 6. SIGNATURE ─────────── */}
          {appearance.showSignature !== false && (
            <div style={{ position: 'absolute', right: '160px', bottom: `${450 - footerVerticalOffset}px`, width: '600px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
              <div style={{ width: '100%', height: '1px', backgroundColor: '#CBD5E0' }} />
              <span style={{ fontSize: '28px', color: '#94A3B8', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '2px' }}>
                {appearance.signatureLabel || 'Cachet & Signature'}
              </span>
            </div>
          )}

          {/* Watermark */}
          {appearance.logoUrl && (
            <div style={{ position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', opacity: appearance.watermarkOpacity || 0.05 }}>
              <img src={appearance.logoUrl} alt="Watermark" style={{ width: '60%', filter: 'grayscale(100%)' }} />
            </div>
          )}

          {/* ─────────── 7. FOOTER ─────────── */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: `${0 - footerVerticalOffset}px`,
              width: '2480px',
              height: '350px',
              backgroundColor: appearance.footerColor || '#0F172A',
              display: 'flex',
              alignItems: 'center',
              padding: '0 120px',
              color: 'white',
            }}
          >
            {showQr && (
              <div style={{ padding: '14px', backgroundColor: 'white', borderRadius: '20px', marginRight: '50px' }}>
                <QRCodeSVG value={qrValue} size={qrSize} />
              </div>
            )}
            <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="font-arabic" style={{ fontSize: '38px', fontWeight: 700 }}>{doctor.addressAr}</div>
              <div style={{ fontSize: '36px', fontWeight: 400, opacity: 0.85 }}>{doctor.addressFr}</div>
              <div style={{ fontSize: '32px', fontWeight: 500 }}>
                <span style={{ marginRight: '36px' }}>{doctor.phone}</span>
                {doctor.email && ` | ${doctor.email}`}
              </div>
              <div style={{ fontSize: '22px', fontWeight: 400, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '2px', marginTop: '4px' }}>
                INPE&nbsp;{doctor.inpe} &nbsp;·&nbsp; ICE&nbsp;{doctor.ice} &nbsp;·&nbsp; IF&nbsp;{doctor.taxId}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DocumentShell;
