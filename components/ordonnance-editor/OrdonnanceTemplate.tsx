/* Ordonnance — printed sheet, fully driven by `appearance` (mm units).
   Used by the "Mon design" editor preview and by TemplateRenderer for the
   real print/export, so what the doctor designs is exactly what prints.
*/

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RxIcon } from '../editor/RxContactIcons';
import { OrdonnanceAppearance, OrdDoctor, OrdPatient, OrdItem, FooterField, ORD_FONTS, ORD_PAGE } from './ordonnanceModel';
import './ordonnance-editor.css';

function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '#000000').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

const ImagePlaceholder: React.FC<{ size: number; label: string; iconSize?: number; radius?: number; fontSize?: number }> =
  ({ size, label, iconSize = 24, radius = 12, fontSize = 9 }) => (
    <div className="ord-noprint flex flex-col items-center justify-center gap-1"
         style={{ width: size, height: size, border: '1px dashed #CBD5E0', borderRadius: radius, color: '#94A3B8' }}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.8" /><path d="m21 15-5-5L5 21" />
      </svg>
      <span style={{ fontSize, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
    </div>
  );

/* Watermark: logo image or free text, capped opacity, 3 anchor positions. */
const OrdonnanceWatermark: React.FC<{ cfg: OrdonnanceAppearance['watermark']; logoUrl: string }> = ({ cfg, logoUrl }) => {
  if (!cfg.show) return null;
  const anchor: React.CSSProperties = cfg.position === 'top-left' ? { top: '15mm', left: '15mm' }
    : cfg.position === 'bottom-right' ? { bottom: '15mm', right: '15mm' }
    : { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const content = cfg.type === 'text'
    ? (cfg.text ? <div style={{ fontSize: cfg.size * 0.3, fontWeight: 800, letterSpacing: 2, whiteSpace: 'nowrap' }}>{cfg.text}</div> : null)
    : (logoUrl
      ? <img src={logoUrl} alt="" style={{ width: cfg.size, height: cfg.size, objectFit: 'contain' }} />
      : <ImagePlaceholder size={cfg.size} label="logo requis" iconSize={28} />);
  return (
    <div className="ord-watermark absolute pointer-events-none" style={{ ...anchor, opacity: Math.min(cfg.opacity, 0.1), zIndex: 0 }}>
      {content}
    </div>
  );
};

/* Deterministic decorative barcode — visual reference marker, no real encoding. */
const OrdonnanceBarcode: React.FC<{ size: number; seed: string; color: string }> = ({ size, seed, color }) => {
  const bars = 28;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = (i: number) => { let x = (h ^ Math.imul(i + 1, 2654435761)) >>> 0; x ^= x >>> 15; return ((x >>> 0) % 100) / 100; };
  let x = 0;
  const rects: React.ReactNode[] = [];
  for (let i = 0; i < bars; i++) {
    const w = 1 + Math.round(rnd(i) * 2);
    if (rnd(i + 100) > 0.4) rects.push(<rect key={i} x={x} y={0} width={w} height={size} fill={color} />);
    x += w + 1;
  }
  return (
    <svg width={x} height={size} viewBox={`0 0 ${x} ${size}`} shapeRendering="crispEdges">
      <rect width={x} height={size} fill="#fff" />{rects}
    </svg>
  );
};

const FooterIcon: React.FC<{ name?: string; cfg: OrdonnanceAppearance['footer']['icons']; textColor: string }> = ({ name, cfg, textColor }) => {
  if (!name) return null;
  const size = cfg.size || 9;
  const glyph = (
    <RxIcon name={name} style={cfg.style || 'outline'} size={cfg.badge ? size * 0.62 : size}
            color={cfg.badge ? (cfg.badgeColor || textColor) : (cfg.color || textColor)} strokeWidth={cfg.strokeWidth || 2} />
  );
  if (!cfg.badge) return glyph;
  return (
    <span className="flex items-center justify-center rounded-full shrink-0"
          style={{ width: size * 1.35, height: size * 1.35, background: cfg.badgeBg || '#FFFFFF' }}>{glyph}</span>
  );
};

interface OrdonnanceTemplateProps {
  doctor: OrdDoctor;
  patient: OrdPatient;
  date: string;
  items: OrdItem[];
  appearance: OrdonnanceAppearance;
}

const OrdonnanceTemplate: React.FC<OrdonnanceTemplateProps> = ({ doctor, patient, date, items, appearance: A }) => {
  const page = ORD_PAGE[A.paperSize] || ORD_PAGE.A4;
  const font = ORD_FONTS[A.fontFamily] || ORD_FONTS.serif;
  const lineStyle = A.patientLine.style;
  const mx = A.margins?.horizontal ?? 10, mt = A.margins?.top ?? 9, mb = A.margins?.bottom ?? 8;
  const vAlignMap = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const;
  // Logo propre au design s'il y en a un, sinon celui du cabinet.
  const logoUrl = doctor.logoUrl;

  const logo = A.header.logo.show ? (
    <div style={{ alignSelf: vAlignMap[A.header.logo.verticalAlign] || 'center', padding: A.header.logo.bgShow ? 8 : 0,
                  background: A.header.logo.bgShow ? A.header.logo.bgColor : 'transparent', borderRadius: 8, flexShrink: 0 }}>
      {logoUrl
        ? <img src={logoUrl} alt="" style={{ width: A.header.logo.size, height: A.header.logo.size, objectFit: 'contain', opacity: A.header.logo.opacity }} />
        : <ImagePlaceholder size={A.header.logo.size} label="logo" iconSize={16} radius={8} fontSize={8} />}
    </div>
  ) : null;

  const frBlock = (
    <div style={{ textAlign: A.header.name.align, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: A.header.name.fontSize, color: A.header.name.color, fontWeight: 700, lineHeight: 1.2 }}>
        Dr. {doctor.name}
      </div>
      {A.header.speciality.show && doctor.speciality && (
        <div style={{ fontSize: A.header.speciality.fontSize, color: '#334155', marginTop: 3, maxWidth: 260, display: 'inline-block' }}>
          {doctor.speciality}
        </div>
      )}
      {A.header.diplomas.show && doctor.diplomasFr && (
        <div style={{ fontSize: A.header.speciality.fontSize - 1.5, color: '#64748B', marginTop: 2, whiteSpace: 'pre-line' }}>
          {doctor.diplomasFr}
        </div>
      )}
      {A.header.registration.show && doctor.registrationNumber && (
        <div style={{ fontSize: A.header.speciality.fontSize - 1.5, color: '#94A3B8', marginTop: 2 }}>
          N° d'ordre : {doctor.registrationNumber}
        </div>
      )}
    </div>
  );

  const arBlock = A.header.arabic.show ? (
    <div dir="rtl" style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
      {doctor.nameAr && (
        <div style={{ fontSize: A.header.arabic.nameFontSize, color: A.header.name.color, fontWeight: 700, fontFamily: ORD_FONTS.arabic, lineHeight: 1.3 }}>
          الدكتور {doctor.nameAr}
        </div>
      )}
      {doctor.specialityAr && (
        <div style={{ fontSize: A.header.arabic.specialityFontSize, color: '#334155', marginTop: 3, fontFamily: ORD_FONTS.arabic, maxWidth: 260, marginLeft: 'auto' }}>
          {doctor.specialityAr}
        </div>
      )}
      {A.header.diplomas.show && doctor.diplomasAr && (
        <div style={{ fontSize: A.header.arabic.specialityFontSize - 1, color: '#64748B', marginTop: 2, fontFamily: ORD_FONTS.arabic, whiteSpace: 'pre-line', maxWidth: 260, marginLeft: 'auto' }}>
          {doctor.diplomasAr}
        </div>
      )}
    </div>
  ) : null;

  const logoPos = A.header.logo.position;

  /* footer extras: qr / barcode grouped by chosen side */
  const leftExtras: React.ReactNode[] = [], rightExtras: React.ReactNode[] = [];
  if (A.qr.show) (A.qr.position === 'left' ? leftExtras : rightExtras).push(
    <QRCodeSVG key="qr" value={A.qr.value || doctor.addressFr || `Dr ${doctor.name}`} size={A.qr.size} fgColor={A.badge.bg} bgColor="#FFFFFF" level="M" />
  );
  if (A.barcode.show) (A.barcode.position === 'left' ? leftExtras : rightExtras).push(
    <OrdonnanceBarcode key="bc" size={A.barcode.size} seed={A.barcode.value || doctor.name || 'docease'} color={A.badge.bg} />
  );

  const FS = A.footer.show;
  const contactValues: Record<FooterField, string> = {
    address: doctor.addressFr, phone: doctor.phone, gsm: doctor.gsm, email: doctor.email, fax: doctor.fax, website: doctor.website,
  };
  const contactItems = (Object.keys(contactValues) as FooterField[])
    .filter(k => FS[k] && contactValues[k])
    .map(k => ({ key: k, text: contactValues[k] }));
  const icon = (key: FooterField) => A.footer.showIcons ? <FooterIcon name={A.footer.icons.map[key]} cfg={A.footer.icons} textColor={A.footer.textColor} /> : null;

  const ids = `INPE ${doctor.inpe || '—'} · ICE ${doctor.ice || '—'} · IF ${doctor.taxId || '—'}`;

  const honorific = /^f/i.test(patient.sex || '') ? 'Mme' : 'M.';
  const SZ = A.signatureZone;

  return (
    <div className="rx-ord-page relative bg-white overflow-hidden flex flex-col"
         style={{ width: `${page.w}mm`, height: `${page.h}mm`, fontFamily: font, color: '#1A202C', lineHeight: 1.5 }}>
      <OrdonnanceWatermark cfg={A.watermark} logoUrl={logoUrl} />

      <div className="relative shrink-0" style={{ zIndex: 1, background: hexToRgba(A.header.bg, A.header.bgOpacity) }}>
        {logoPos === 'center' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: `${mt}mm ${mx}mm 4mm`, gap: '4mm' }}>
            {frBlock}
            {logo ?? <span />}
            {arBlock ?? <span />}
          </div>
        ) : (
          <div className="flex items-center" style={{ padding: `${mt}mm ${mx}mm 4mm`, gap: '4mm' }}>
            {logoPos === 'left' && logo}
            {frBlock}
            {arBlock}
            {logoPos === 'right' && logo}
          </div>
        )}
        <div style={{ height: 2, background: A.badge.bg, margin: `0 ${mx}mm` }} />
      </div>

      {A.badge.show && (
        <div className="relative flex items-center justify-center shrink-0" style={{ zIndex: 1, marginTop: '6mm' }}>
          <span style={{
            background: A.badge.bg, color: A.badge.color, fontWeight: 700, letterSpacing: '2px', lineHeight: 1.5,
            fontSize: A.badge.fontSize, borderRadius: A.badge.radius,
            padding: `${A.badge.paddingY}px ${A.badge.paddingX}px`,
          }}>
            {A.badge.text}
          </span>
        </div>
      )}

      {A.patientLine.showDate && (
        <div className="relative flex justify-end shrink-0" style={{ zIndex: 1, padding: `3mm ${mx}mm 0` }}>
          <span style={{ fontSize: 9.5, color: '#334155' }}>
            Le : <strong>{date}</strong>
          </span>
        </div>
      )}

      <div className="relative flex items-baseline shrink-0" style={{ zIndex: 1, padding: `5mm ${mx}mm 0`, gap: 6, fontSize: 9.5 }}>
        <span>{honorific} </span>
        <span style={{ flex: 1, borderBottom: lineStyle === 'none' ? 'none' : `1px ${lineStyle} #94A3B8`, minHeight: 12, paddingBottom: 1 }}>
          {patient.name}
        </span>
        {A.patientLine.showAge && patient.age ? <span style={{ marginLeft: 8 }}>Âge : {patient.age}</span> : null}
        {A.patientLine.showSex && patient.sex ? <span style={{ marginLeft: 8 }}>Sexe : {patient.sex}</span> : null}
        {A.patientLine.showWeight && patient.weight ? <span style={{ marginLeft: 8 }}>Poids : {patient.weight}</span> : null}
      </div>

      <div className="relative" style={{ zIndex: 1, padding: `7mm ${mx}mm`, flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
        {A.bodyLogo.show && (
          <div className="absolute pointer-events-none" style={{
            top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: A.bodyLogo.size, height: A.bodyLogo.size, opacity: A.bodyLogo.opacity, zIndex: 0,
          }}>
            {A.bodyLogo.url
              ? <img src={A.bodyLogo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <ImagePlaceholder size={A.bodyLogo.size} label="2e logo" />}
          </div>
        )}
        <ol style={{ display: 'flex', flexDirection: 'column', gap: A.drugList.itemGap, position: 'relative', zIndex: 1, margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((it, i) => (
            <li key={i} className="flex gap-2.5" style={{ breakInside: 'avoid' }}>
              {A.drugList.style === 'bar' && (
                <span style={{ width: 3, borderRadius: 2, background: A.drugList.accentColor, flexShrink: 0, alignSelf: 'stretch' }} />
              )}
              {A.drugList.style === 'simple' && (
                <span style={{ fontWeight: 600, color: A.drugList.accentColor, fontSize: 10.5, flexShrink: 0 }}>{i + 1}.</span>
              )}
              {A.drugList.style === 'bullet' && (
                <span style={{ marginTop: 6, width: 5, height: 5, borderRadius: '50%', background: A.drugList.accentColor, flexShrink: 0 }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span style={{ fontWeight: 600, fontSize: 11 }}>{it.drugName}</span>
                  {it.strength && <span style={{ fontSize: 9.5, color: A.drugList.accentColor }}>{it.strength}</span>}
                  {it.form && <span style={{ fontSize: 9, color: '#64748B' }}>{it.form}</span>}
                </div>
                {(it.dosage || it.duration || (it.timing && it.timing !== 'Indifférent')) && (
                  <div className="flex flex-wrap gap-x-4" style={{ fontSize: 9, color: '#475569' }}>
                    {it.dosage && <span>{it.dosage}</span>}
                    {it.timing && it.timing !== 'Indifférent' && <span>({it.timing})</span>}
                    {it.duration && <span>pendant {it.duration}</span>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {A.freeNotes.show && A.freeNotes.text && (
          <div style={{ marginTop: '6mm', fontSize: A.freeNotes.fontSize, color: '#475569', whiteSpace: 'pre-line', lineHeight: 1.5, position: 'relative', zIndex: 1 }}>
            {A.freeNotes.text}
          </div>
        )}
      </div>

      {SZ.show && (
        <div className="relative flex shrink-0"
             style={{ zIndex: 1, padding: `0 ${mx}mm ${mb}mm`, justifyContent: SZ.position === 'left' ? 'flex-start' : 'flex-end' }}>
          <div className="ord-signature-zone" style={{ width: `${SZ.width}mm`, height: `${SZ.height}mm`, textAlign: 'center' }}>
            <div style={{ fontSize: 7.5, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #CBD5E0', paddingBottom: 3 }}>
              {SZ.label}
            </div>
          </div>
        </div>
      )}

      <div className="relative flex items-center shrink-0"
           style={{ zIndex: 1, background: A.footer.bg, color: A.footer.textColor, padding: `4mm ${mx}mm`, gap: '4mm', minHeight: '22mm' }}>
        {leftExtras.length > 0 && (
          <div className="flex items-center justify-center bg-white rounded shrink-0 gap-1.5" style={{ padding: 4 }}>{leftExtras}</div>
        )}
        <div className="flex-1 min-w-0">
          {A.footer.arabic.show && doctor.addressAr && (
            <div dir="rtl" style={{ fontSize: 8.5, fontWeight: 600, fontFamily: ORD_FONTS.arabic, textAlign: 'center', marginBottom: 2 }}>
              {doctor.addressAr}
            </div>
          )}
          <div className={A.footer.layout === 'stacked' ? 'flex flex-col items-center' : 'flex flex-wrap items-center justify-center gap-x-4'}
               style={{ gap: A.footer.layout === 'stacked' ? 2 : undefined, fontSize: A.footer.fontSize || 8, textAlign: 'center' }}>
            {contactItems.map(c => (
              <span key={c.key} className="flex items-center" style={{ gap: 4 }}>
                {icon(c.key)}{c.text}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 6.5, opacity: 0.7, textAlign: 'center', marginTop: 2, textTransform: 'uppercase', letterSpacing: '1px' }}>
            {ids}
          </div>
        </div>
        {rightExtras.length > 0 && (
          <div className="flex items-center justify-center bg-white rounded shrink-0 gap-1.5" style={{ padding: 4 }}>{rightExtras}</div>
        )}
      </div>
    </div>
  );
};

export default OrdonnanceTemplate;
