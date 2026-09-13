import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

/* ═══════════════════════════════════════════════════════════════════
   Shared primitives for all DocEase prescription templates.
   A4 = 210mm × 297mm, print-ready, zero external assets.
   ═══════════════════════════════════════════════════════════════════ */

export interface RxQrCode {
  value: string;
  size: number;
  position: 'bottom-left' | 'bottom-right';
}

export interface RxDoctor {
  name: string;
  speciality: string;
  phone: string;
  address: string;
  email: string;
  registrationNumber: string;
}
export interface RxPatient {
  name: string;
  age: string | number;
  sex: string;
}
export interface RxItem {
  drugName: string;
  strength?: string;
  form?: string;
  packaging?: string;
  dosage?: string;
  duration?: string;
  timing?: string;
}
export interface RxTemplateProps {
  doctor: RxDoctor;
  patient: RxPatient;
  date: string;
  items: RxItem[];
  /** Optional photo for templates whose original design includes one. */
  photoUrl?: string;
  accentColor?: string;
  qrCode?: RxQrCode | undefined;
}

/* ─── Print contract ─── */
export const RxPrintStyles: React.FC = () => (
  <style dangerouslySetInnerHTML={{ __html: `
@page{size:A4 portrait;margin:0}
@media print{
html,body{margin:0!important;padding:0!important;background:#fff!important}
.rx-page{box-shadow:none!important;margin:0!important;page-break-after:always;break-after:page}
.rx-page:last-of-type{page-break-after:auto;break-after:auto}
.rx-noprint{display:none!important}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}` }} />
);

/* ─── A4 sheet ─── */
export const A4Page: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> =
({ children, className = '', style }) => (
  <div className={`rx-page relative bg-white overflow-hidden ${className}`}
       style={{ width: '210mm', height: '297mm', ...style }}>
    {children}
  </div>
);

/* ─── Inline SVG icons (no icon-font dependency in printed output) ─── */
type IconProps = { size?: number; color?: string; className?: string };
const svg = (d: React.ReactNode, { size = 10, color = 'currentColor', className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
);
export const IconPin = (p: IconProps) => svg(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></>, p);
export const IconPhone = (p: IconProps) => svg(<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z" />, p);
export const IconMail = (p: IconProps) => svg(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>, p);
export const IconGlobe = (p: IconProps) => svg(<><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z" /></>, p);
export const IconStethoscope = (p: IconProps) => svg(<><path d="M4 3v6a5 5 0 0010 0V3" /><path d="M9 14v2a5 5 0 0010 0v-3" /><circle cx="19" cy="10" r="2" /></>, p);

/* ─── Field primitives ─── */
export const DottedField: React.FC<{
  label: string; value?: React.ReactNode; grow?: number; minWidth?: number | string;
  labelColor?: string; valueColor?: string; lineColor?: string; className?: string;
}> = ({ label, value, grow = 1, minWidth = 40, labelColor = '#3f3f46', valueColor = '#111827', lineColor = '#9ca3af', className = '' }) => (
  <span className={`inline-flex items-baseline gap-1 ${className}`} style={{ flexGrow: grow, flexShrink: 1, minWidth: 0 }}>
    <span className="whitespace-nowrap" style={{ color: labelColor }}>{label}</span>
    <span className="flex-1 border-b border-dotted leading-tight px-1"
          style={{ borderColor: lineColor, minWidth }}>
      <span style={{ color: valueColor }}>{value}</span>
    </span>
  </span>
);

export const RuledField: React.FC<{
  label: string; value?: React.ReactNode; labelWidth?: number | string;
  labelColor?: string; valueColor?: string; lineColor?: string;
}> = ({ label, value, labelWidth = 90, labelColor = '#334155', valueColor = '#0f172a', lineColor = '#94a3b8' }) => (
  <div className="flex items-baseline gap-3">
    <span className="shrink-0" style={{ width: labelWidth, color: labelColor }}>{label}</span>
    <span className="flex-1 border-b px-1 leading-tight" style={{ borderColor: lineColor }}>
      <span style={{ color: valueColor }}>{value}</span>
    </span>
  </div>
);

/* ─── Rx glyph (classic slashed R) ─── */
export const RxGlyph: React.FC<{ size?: number; color?: string; strokeWidth?: number }> =
({ size = 34, color = '#111827', strokeWidth = 2 }) => (
  <svg width={size} height={size * 1.08} viewBox="0 0 32 34" fill="none"
       stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M6 3h8a6 6 0 010 12H6V3z" />
    <path d="M6 15v16" />
    <path d="M13 15l14 16M27 15L13 31" />
  </svg>
);

/* ─── Drug list (numbered, clinical) ─── */
export const DrugList: React.FC<{
  items: RxItem[]; accent?: string; nameColor?: string; muted?: string; compact?: boolean;
}> = ({ items, accent = '#111827', nameColor = '#111827', muted = '#6b7280', compact }) => (
  <ol className={compact ? 'space-y-2' : 'space-y-3.5'}>
    {items.map((it, i) => (
      <li key={i} className="flex gap-2.5" style={{ breakInside: 'avoid' }}>
        <span className="shrink-0 font-semibold tabular-nums" style={{ color: accent, fontSize: '10.5pt' }}>
          {i + 1}.
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold uppercase" style={{ color: nameColor, fontSize: '11pt', letterSpacing: '-0.01em' }}>
              {it.drugName}
            </span>
            {it.strength && <span className="font-medium" style={{ color: accent, fontSize: '10pt' }}>{it.strength}</span>}
            {it.form && <span style={{ color: muted, fontSize: '9pt' }}>{it.form}</span>}
            {it.packaging && <span style={{ color: muted, fontSize: '8.5pt', opacity: 0.8 }}>· {it.packaging}</span>}
          </div>
          {(it.dosage || it.duration || (it.timing && it.timing !== 'Indifférent')) && (
            <div className="mt-0.5 flex flex-wrap gap-x-4" style={{ fontSize: '9.5pt' }}>
              {it.dosage && <span style={{ color: '#374151' }}>{it.dosage}</span>}
              {it.timing && it.timing !== 'Indifférent' && <span style={{ color: '#374151' }}>({it.timing})</span>}
              {it.duration && <span style={{ color: muted }}>pendant {it.duration}</span>}
            </div>
          )}
        </div>
      </li>
    ))}
  </ol>
);

/* ─── Drug table (banded header variant) ─── */
export const DrugTable: React.FC<{ items: RxItem[]; headerBg?: string; headerColor?: string; stripe?: string }> =
({ items, headerBg = '#0f172a', headerColor = '#ffffff', stripe = '#f8fafc' }) => (
  <table className="w-full border-collapse" style={{ fontSize: '9.5pt' }}>
    <thead>
      <tr style={{ background: headerBg, color: headerColor }}>
        {['#', 'Médicament', 'Dosage', 'Durée'].map((h, i) => (
          <th key={i} className="text-left font-semibold px-2.5 py-1.5"
              style={{ width: i === 0 ? 26 : i === 2 ? '26%' : i === 3 ? '20%' : 'auto', fontSize: '8.5pt', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {items.map((it, i) => (
        <tr key={i} style={{ background: i % 2 ? stripe : 'transparent', breakInside: 'avoid' }}>
          <td className="px-2.5 py-2 align-top tabular-nums" style={{ color: '#6b7280' }}>{i + 1}</td>
          <td className="px-2.5 py-2 align-top">
            <span className="font-semibold uppercase" style={{ color: '#111827' }}>{it.drugName}</span>
            {it.strength && <span className="ml-1.5 font-medium" style={{ color: '#374151' }}>{it.strength}</span>}
            {(it.form || it.packaging) && (
              <div style={{ color: '#9ca3af', fontSize: '8.5pt' }}>
                {[it.form, it.packaging].filter(Boolean).join(' · ')}
              </div>
            )}
          </td>
          <td className="px-2.5 py-2 align-top" style={{ color: '#374151' }}>
            {it.dosage}
            {it.timing && it.timing !== 'Indifférent' && <span style={{ color: '#6b7280' }}> ({it.timing})</span>}
          </td>
          <td className="px-2.5 py-2 align-top" style={{ color: '#6b7280' }}>{it.duration}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ─── Signature block ─── */
export const SignatureLine: React.FC<{ label?: string; color?: string; width?: number | string; align?: 'left' | 'right' }> =
({ label = 'Signature & Cachet', color = '#64748b', width = 170, align = 'right' }) => (
  <div style={{ width, marginLeft: align === 'right' ? 'auto' : undefined }}>
    <div className="border-b" style={{ borderColor: color, opacity: 0.6 }} />
    <div className="mt-1 text-center" style={{ color, fontSize: '8pt' }}>{label}</div>
  </div>
);

/* ─── Optional photo slot (for designs whose original art is a photograph) ─── */
export const PhotoSlot: React.FC<{
  src?: string; width: number | string; height: number | string;
  className?: string; style?: React.CSSProperties; hint?: string;
}> = ({ src, width, height, className = '', style, hint = 'photo' }) => {
  if (src) return <img src={src} alt="" className={className} style={{ width, height, objectFit: 'contain', ...style }} />;
  return (
    <div className={`rx-noprint flex items-center justify-center ${className}`}
         style={{ width, height, border: '1px dashed #cbd5e1', borderRadius: 6, color: '#cbd5e1', fontSize: '7.5pt', letterSpacing: '0.08em', textTransform: 'uppercase', ...style }}>
      {hint}
    </div>
  );
};

/* ─── Deterministic decorative QR-like mark (no data encoded) ─── */
export const QrMark: React.FC<{ size?: number; seed?: string; color?: string; bg?: string }> =
({ size = 74, seed = 'docease', color = '#111827', bg = '#ffffff' }) => {
  const n = 21;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = (i: number) => { let x = (h ^ Math.imul(i + 1, 2654435761)) >>> 0; x ^= x >>> 15; return ((x >>> 0) % 100) / 100; };
  const finder = (r: number, c: number) =>
    [[0, 0], [0, n - 7], [n - 7, 0]].some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (finder(r, c)) continue;
    if (rnd(r * n + c) > 0.52) cells.push(<rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill={color} />);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
      <rect width={n} height={n} fill={bg} />
      {cells}
      {[[0, 0], [0, n - 7], [n - 7, 0]].map(([r, c], i) => (
        <g key={i}>
          <rect x={c} y={r} width="7" height="7" fill={color} />
          <rect x={c + 1} y={r + 1} width="5" height="5" fill={bg} />
          <rect x={c + 2} y={r + 2} width="3" height="3" fill={color} />
        </g>
      ))}
    </svg>
  );
};

/* ─── Caduceus / Asclepius mark (stylised, drawn not traced) ─── */
export const CaduceusMark: React.FC<{ size?: number; color?: string; opacity?: number }> =
({ size = 76, color = '#ffffff', opacity = 1 }) => (
  <svg width={size} height={size * 1.35} viewBox="0 0 100 135" fill="none" opacity={opacity}>
    <g stroke={color} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M50 22v104" />
      <path d="M50 34c-11 0-11 12 0 12s11 12 0 12-11 12 0 12 11 12 0 12" />
      <path d="M50 34c11 0 11 12 0 12s-11 12 0 12 11 12 0 12-11 12 0 12" />
    </g>
    <circle cx="50" cy="15" r="7" fill={color} />
    <g fill={color}>
      <path d="M47 30C36 24 20 22 6 27c9 3 13 7 15 11-8-2-14-1-19 2 8 1 13 4 16 8 12-4 22-8 29-13v-5z" />
      <path d="M53 30C64 24 80 22 94 27c-9 3-13 7-15 11 8-2 14-1 19 2-8 1-13 4-16 8-12-4-22-8-29-13v-5z" />
    </g>
  </svg>
);

/* ─── QR Code block (positioned in footer) ─── */
export const QrCodeBlock: React.FC<{ qrCode?: RxQrCode }> = ({ qrCode }) => {
  if (!qrCode) return null;
  const positionStyles = qrCode.position === 'bottom-left'
    ? { position: 'absolute' as const, left: '14mm', bottom: '6mm' }
    : { position: 'absolute' as const, right: '14mm', bottom: '6mm' };

  if (!qrCode.value) return null;

  return (
    <div style={{
      ...positionStyles,
      width: `${qrCode.size}px`,
      height: `${qrCode.size}px`,
      padding: '8px',
      backgroundColor: 'white',
      borderRadius: '6px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <QRCodeSVG value={qrCode.value} size={qrCode.size - 16} level="M" />
    </div>
  );
};
