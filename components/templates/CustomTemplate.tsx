import React from 'react';
import { CustomTemplateConfig, DoctorInfo } from '../../types';
import {
  A4Page, RxPrintStyles, DrugList, SignatureLine, QrCodeBlock,
  IconPin, IconPhone, IconMail, IconGlobe, RxGlyph, RxItem, RxQrCode,
} from './RxShared';
import { RX_FONTS, rxResolveText, RX_A4 } from '../editor/rxEditorModel';
import { RxIcon } from '../editor/RxContactIcons';

export const DEFAULT_CUSTOM_TEMPLATE_CONFIG: CustomTemplateConfig = {
  headerStyle: 'bande',
  headerColor: '#0d9488',
  logoUrl: null,
  logoPosition: 'left',
  logoSize: 64,
  showName: true,
  namePosition: 'left',
  nameFontSize: 18,
  showSpeciality: true,
  showPhone: true,
  showEmail: true,
  showAddress: true,
  showOrdreNumber: true,
  showWebsite: false,
  website: '',
  drugListStyle: 'barre',
  accentColor: '#0d9488',
  fontFamily: 'sans',
  footerStyle: 'vague',
  showStamp: true,
  stampUrl: null,
  stampPosition: 'right',
  showSignature: true,
  signatureUrl: null,
  enableQrCode: false,
  qrCodePosition: 'right',
  qrCodeContent: '',
  watermark: 'none',
  watermarkOpacity: 0.04,
};

interface CustomTemplateProps {
  config: CustomTemplateConfig;
  doctor: DoctorInfo;
  patient: { name?: string; age?: number | string; sex?: string };
  items: RxItem[];
  date: string;
}

const FONT_STACKS: Record<CustomTemplateConfig['fontFamily'], string> = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
};

const justifyFor = (pos: 'left' | 'center' | 'right') =>
  pos === 'center' ? 'center' : pos === 'right' ? 'flex-end' : 'flex-start';

const Watermark: React.FC<{ config: CustomTemplateConfig; doctorName: string }> = ({ config, doctorName }) => {
  if (config.watermark === 'none') return null;
  const initials = doctorName.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'DR';
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ opacity: config.watermarkOpacity, zIndex: 0 }}
    >
      {config.watermark === 'initials' ? (
        <span style={{ fontSize: '160pt', fontWeight: 800, color: config.accentColor }}>{initials}</span>
      ) : (
        <svg width="220" height="220" viewBox="0 0 24 24" fill="none" stroke={config.accentColor} strokeWidth="1.4">
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </div>
  );
};

const CustomTemplate: React.FC<CustomTemplateProps> = ({ config, doctor, patient, items, date }) => {
  const c = config;
  const fontFamily = FONT_STACKS[c.fontFamily];
  const doctorName = `Dr ${doctor.nameFr || ''}`.trim();
  const headerTextColor = c.headerStyle === 'bande' ? '#ffffff' : c.headerColor;

  const contactLines = (
    <>
      {c.showPhone && doctor.phone && (
        <div className="flex items-center gap-1.5"><IconPhone size={9} color={headerTextColor} /><span>{doctor.phone}</span></div>
      )}
      {c.showEmail && doctor.email && (
        <div className="flex items-center gap-1.5"><IconMail size={9} color={headerTextColor} /><span>{doctor.email}</span></div>
      )}
      {c.showAddress && doctor.addressFr && (
        <div className="flex items-center gap-1.5"><IconPin size={9} color={headerTextColor} /><span>{doctor.addressFr}</span></div>
      )}
      {c.showWebsite && c.website && (
        <div className="flex items-center gap-1.5"><IconGlobe size={9} color={headerTextColor} /><span>{c.website}</span></div>
      )}
    </>
  );

  const nameBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: justifyFor(c.namePosition) === 'center' ? 'center' : justifyFor(c.namePosition) === 'flex-end' ? 'flex-end' : 'flex-start' }}>
      {c.showName && (
        <div style={{ fontSize: `${c.nameFontSize}pt`, fontWeight: 700, color: headerTextColor, lineHeight: 1.1 }}>{doctorName}</div>
      )}
      {c.showSpeciality && doctor.specialtyFr && (
        <div style={{ fontSize: '9.5pt', marginTop: 2, color: headerTextColor, opacity: 0.85 }}>{doctor.specialtyFr}</div>
      )}
      {c.showOrdreNumber && doctor.ordreNumber && (
        <div style={{ fontSize: '7.5pt', marginTop: 2, color: headerTextColor, opacity: 0.7 }}>N° Ordre {doctor.ordreNumber}</div>
      )}
    </div>
  );

  const logoBlock = c.logoUrl ? (
    <img src={c.logoUrl} alt="" style={{ width: c.logoSize, height: c.logoSize, objectFit: 'contain' }} />
  ) : null;

  const headerHeight = c.headerStyle === 'minimal' ? '26mm' : '34mm';

  const renderHeader = () => {
    if (c.headerStyle === 'minimal') {
      return (
        <div className="absolute" style={{ left: '14mm', right: '14mm', top: '10mm', height: headerHeight }}>
          <div className="flex items-center justify-between gap-4">
            {c.logoPosition === 'left' && logoBlock}
            <div style={{ flex: 1, display: 'flex', justifyContent: justifyFor(c.namePosition) }}>{nameBlock}</div>
            {c.logoPosition === 'right' && logoBlock}
          </div>
          {c.logoPosition === 'center' && <div className="flex justify-center mt-2">{logoBlock}</div>}
          <div className="mt-2 flex gap-4" style={{ fontSize: '7.8pt', color: '#6b7280', justifyContent: justifyFor(c.namePosition) }}>
            {contactLinesFor(c.headerColor)}
          </div>
          <div className="mt-2" style={{ borderBottom: `1.5px solid ${c.headerColor}` }} />
        </div>
      );
    }
    if (c.headerStyle === 'encadre') {
      return (
        <div className="absolute" style={{ left: '14mm', right: '14mm', top: '10mm', height: headerHeight }}>
          <div className="flex items-center gap-4 h-full rounded-lg border-2 p-3" style={{ borderColor: c.headerColor }}>
            <div className="flex items-center justify-center rounded-md shrink-0" style={{ width: c.logoSize + 12, height: c.logoSize + 12, background: `${c.headerColor}14` }}>
              {logoBlock || <RxGlyph size={c.logoSize * 0.6} color={c.headerColor} />}
            </div>
            <div className="flex-1" style={{ display: 'flex', justifyContent: justifyFor(c.namePosition) }}>{nameBlockWithColor(c.headerColor)}</div>
            <div className="text-right shrink-0" style={{ fontSize: '7.8pt', color: '#6b7280' }}>{contactLinesFor(c.headerColor)}</div>
          </div>
        </div>
      );
    }
    // bande
    return (
      <div className="absolute left-0 right-0 top-0" style={{ height: headerHeight, background: c.headerColor }}>
        <div className="h-full flex items-center justify-between px-[14mm]">
          {c.logoPosition === 'left' && logoBlock}
          <div style={{ flex: 1, display: 'flex', justifyContent: justifyFor(c.namePosition), paddingLeft: c.logoPosition === 'left' ? 12 : 0, paddingRight: c.logoPosition === 'right' ? 12 : 0 }}>
            {nameBlock}
          </div>
          {c.logoPosition === 'right' && logoBlock}
          {c.logoPosition === 'center' && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-1.5">{logoBlock}</div>
          )}
          <div className="text-right shrink-0" style={{ fontSize: '7.8pt', color: '#ffffff', opacity: 0.9 }}>{contactLines}</div>
        </div>
      </div>
    );
  };

  // Small helper closures needed because minimal/encadre headers render contact lines
  // and the name block in a non-white (bande) text color.
  function contactLinesFor(accent: string) {
    return (
      <>
        {c.showPhone && doctor.phone && (
          <div className="flex items-center gap-1.5"><IconPhone size={9} color={accent} /><span>{doctor.phone}</span></div>
        )}
        {c.showEmail && doctor.email && (
          <div className="flex items-center gap-1.5"><IconMail size={9} color={accent} /><span>{doctor.email}</span></div>
        )}
        {c.showAddress && doctor.addressFr && (
          <div className="flex items-center gap-1.5"><IconPin size={9} color={accent} /><span>{doctor.addressFr}</span></div>
        )}
        {c.showWebsite && c.website && (
          <div className="flex items-center gap-1.5"><IconGlobe size={9} color={accent} /><span>{c.website}</span></div>
        )}
      </>
    );
  }
  function nameBlockWithColor(accent: string) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {c.showName && <div style={{ fontSize: `${c.nameFontSize}pt`, fontWeight: 700, color: accent, lineHeight: 1.1 }}>{doctorName}</div>}
        {c.showSpeciality && doctor.specialtyFr && <div style={{ fontSize: '9.5pt', marginTop: 2, color: '#374151' }}>{doctor.specialtyFr}</div>}
        {c.showOrdreNumber && doctor.ordreNumber && <div style={{ fontSize: '7.5pt', marginTop: 2, color: '#6b7280' }}>N° Ordre {doctor.ordreNumber}</div>}
      </div>
    );
  }

  const bodyTop = c.headerStyle === 'encadre' ? '52mm' : c.headerStyle === 'minimal' ? '40mm' : '46mm';

  const qrCode: RxQrCode | undefined = c.enableQrCode
    ? { value: c.qrCodeContent || doctorName, size: 120, position: c.qrCodePosition === 'left' ? 'bottom-left' : 'bottom-right' }
    : undefined;

  const footerHeight = c.footerStyle === 'vague' ? '30mm' : '20mm';

  const renderFooter = () => {
    const stampSignRow = (
      <div className="flex items-end justify-between px-[14mm]" style={{ position: 'absolute', left: 0, right: 0, bottom: '6mm' }}>
        <div>
          {c.showStamp && (
            c.stampPosition === 'left' ? (
              c.stampUrl ? <img src={c.stampUrl} alt="Cachet" style={{ width: 60, height: 60, objectFit: 'contain' }} /> : null
            ) : null
          )}
        </div>
        <div>
          {c.showSignature && <SignatureLine color={c.accentColor} align={c.stampPosition === 'right' ? 'left' : 'right'} />}
          {c.showStamp && c.stampPosition === 'right' && c.stampUrl && (
            <img src={c.stampUrl} alt="Cachet" style={{ width: 60, height: 60, objectFit: 'contain', marginTop: 4, marginLeft: 'auto' }} />
          )}
        </div>
      </div>
    );

    if (c.footerStyle === 'bande') {
      return (
        <div className="absolute left-0 right-0 bottom-0" style={{ height: footerHeight, background: c.headerColor }}>
          {stampSignRow}
        </div>
      );
    }
    if (c.footerStyle === 'vague') {
      return (
        <div className="absolute left-0 right-0 bottom-0" style={{ height: footerHeight }}>
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 210 30" preserveAspectRatio="none" style={{ height: footerHeight }}>
            <path d="M0 12 C 40 0, 80 22, 120 10 C 160 -2, 190 16, 210 8 L 210 30 L 0 30 Z" fill={c.headerColor} opacity="0.9" />
          </svg>
          {stampSignRow}
        </div>
      );
    }
    // simple
    return (
      <div className="absolute left-0 right-0 bottom-0" style={{ height: footerHeight }}>
        <div className="absolute left-[14mm] right-[14mm]" style={{ top: 0, borderTop: `1px solid ${c.headerColor}` }} />
        {stampSignRow}
      </div>
    );
  };

  if (config.layoutConfig && config.layoutConfig.elements && config.layoutConfig.elements.length > 0) {
    const layout = config.layoutConfig;
    return (
      <A4Page style={{ position: 'relative', background: layout.page?.background || '#FFFFFF' }}>
        <RxPrintStyles />
        {layout.elements.map(el => {
          if (!el.visible) return null;
          const F = RX_FONTS.find(f => f.id === el.fontFamily) || RX_FONTS[0];
          const common: React.CSSProperties = {
            position: 'absolute',
            left: `${el.x}mm`,
            top: `${el.y}mm`,
            opacity: el.opacity,
            transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
            transformOrigin: 'top left',
          };

          if (el.type === 'logo') {
            const src = el.src || doctor.logoUrl;
            if (!src) return null;
            return (
              <div key={el.id} style={{ ...common, width: `${el.w ?? 34}mm` }}>
                <img src={src} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            );
          }

          if (el.type === 'line') {
            return (
              <div
                key={el.id}
                style={{
                  ...common,
                  width: `${el.length ?? 174}mm`,
                  height: `${Math.max(el.thickness ?? 0.5, 0.3)}mm`,
                  background: el.color || '#1A6B8A',
                  borderRadius: '0.2mm',
                }}
              />
            );
          }

          if (el.type === 'icon') {
            return (
              <div key={el.id} style={common}>
                <RxIcon
                  name={el.field}
                  style={el.iconStyle}
                  size={(el.iconSize ?? 6) * RX_A4.mmToPx}
                  color={el.iconColor || '#1A6B8A'}
                  strokeWidth={1.7}
                />
              </div>
            );
          }

          if (el.type === 'body') {
            return (
              <div
                key={el.id}
                style={{
                  ...common,
                  width: `${el.w ?? 174}mm`,
                  minHeight: `${el.h ?? 150}mm`,
                }}
              >
                <DrugList items={items} accent={el.color || config.accentColor || '#1A6B8A'} />
              </div>
            );
          }

          /* text / contact */
          const textStyle: React.CSSProperties = {
            fontFamily: F.stack,
            fontSize: `${el.fontSize ?? 10}pt`,
            fontWeight: el.fontWeight ?? 500,
            color: el.color || '#0F172A',
            textAlign: el.align || 'left',
            letterSpacing: el.letterSpacing ? `${el.letterSpacing / 10}em` : undefined,
            lineHeight: el.lineHeight ?? 1.35,
            textTransform: el.uppercase ? 'uppercase' : undefined,
            direction: el.rtl ? 'rtl' : undefined,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            margin: 0,
          };

          let value = rxResolveText(el, doctor, { placeholders: false });
          if (el.text && el.text.includes('Nom :') && el.text.includes('Âge :')) {
            value = `Nom : ${patient.name || '................................'}    Âge : ${patient.age || '......'}    Sexe : ${patient.sex || '......'}    Date : ${date || '................'}`;
          }

          if (el.type === 'contact') {
            return (
              <div key={el.id} style={{ ...common, width: `${el.width ?? 90}mm` }}>
                <div className="flex items-start" style={{ gap: `${el.iconGap ?? 2.2}mm`, flexDirection: el.rtl ? 'row-reverse' : 'row' }}>
                  {el.showIcon && (
                    <span style={{ marginTop: '0.4mm', flexShrink: 0 }}>
                      <RxIcon
                        name={el.field}
                        style={el.iconStyle}
                        size={(el.iconSize ?? 3.6) * RX_A4.mmToPx}
                        color={el.iconColor || '#1A6B8A'}
                        strokeWidth={1.7}
                      />
                    </span>
                  )}
                  <p style={{ ...textStyle, flex: 1, minWidth: 0 }}>{value}</p>
                </div>
              </div>
            );
          }

          return (
            <div key={el.id} style={{ ...common, width: `${el.width ?? 80}mm` }}>
              <p style={textStyle}>{value}</p>
            </div>
          );
        })}
      </A4Page>
    );
  }

  return (
    <A4Page style={{ fontFamily }}>
      <RxPrintStyles />
      <Watermark config={c} doctorName={doctorName} />
      {renderHeader()}

      <div className="absolute" style={{ left: '14mm', right: '14mm', top: bodyTop, fontSize: '8.5pt', color: '#6b7280' }}>
        <div className="flex flex-wrap gap-4 pb-2 mb-3" style={{ borderBottom: '1px dotted #cbd5e1' }}>
          <span>Patient : <strong style={{ color: '#111827' }}>{patient.name || ''}</strong></span>
          <span>Âge : {patient.age ?? ''}</span>
          <span>Sexe : {patient.sex || ''}</span>
          <span className="ml-auto">{date}</span>
        </div>

        {c.drugListStyle === 'simple' ? (
          <ol className="space-y-3">
            {items.map((it, i) => (
              <li key={i} style={{ breakInside: 'avoid' }}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span style={{ color: '#111827' }}>{i + 1}.</span>
                  <span className="font-semibold uppercase" style={{ color: '#111827', fontSize: '11pt' }}>{it.drugName}</span>
                  {it.strength && <span style={{ color: c.accentColor, fontSize: '10pt' }}>{it.strength}</span>}
                </div>
                {(it.dosage || it.duration || (it.timing && it.timing !== 'Indifférent')) && (
                  <div className="mt-0.5 flex gap-4" style={{ fontSize: '9.5pt', color: '#374151' }}>
                    {it.dosage && <span>{it.dosage}</span>}
                    {it.timing && it.timing !== 'Indifférent' && <span>({it.timing})</span>}
                    {it.duration && <span style={{ color: '#6b7280' }}>pendant {it.duration}</span>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : c.drugListStyle === 'puces' ? (
          <ul className="space-y-3">
            {items.map((it, i) => (
              <li key={i} className="flex gap-2.5" style={{ breakInside: 'avoid' }}>
                <span className="shrink-0 mt-1.5 rounded-full" style={{ width: 6, height: 6, background: c.accentColor }} />
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold uppercase" style={{ color: '#111827', fontSize: '11pt' }}>{it.drugName}</span>
                    {it.strength && <span style={{ color: c.accentColor, fontSize: '10pt' }}>{it.strength}</span>}
                  </div>
                  {(it.dosage || it.duration || (it.timing && it.timing !== 'Indifférent')) && (
                    <div className="mt-0.5 flex gap-4" style={{ fontSize: '9.5pt', color: '#374151' }}>
                      {it.dosage && <span>{it.dosage}</span>}
                      {it.timing && it.timing !== 'Indifférent' && <span>({it.timing})</span>}
                      {it.duration && <span style={{ color: '#6b7280' }}>pendant {it.duration}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <DrugList items={items} accent={c.accentColor} />
        )}
      </div>

      {renderFooter()}
      <QrCodeBlock qrCode={qrCode} />
    </A4Page>
  );
};

export default CustomTemplate;
