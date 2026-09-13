/* AUTO-GENERATED preview bundle — do not edit.
   Flattened from templates/*.tsx so a plain browser + Babel can render them.
   Source of truth remains the individual .tsx files. */

/* ─── RxShared ─── */
/* ═══════════════════════════════════════════════════════════════════
   Shared primitives for all DocEase prescription templates.
   A4 = 210mm × 297mm, print-ready, zero external assets.
   ═══════════════════════════════════════════════════════════════════ */





/* ─── Print contract ─── */
const RxPrintStyles: React.FC = () => (
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
const A4Page: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> =
({ children, className = '', style }) => (
  <div className={`rx-page relative bg-white overflow-hidden ${className}`}
       style={{ width: '210mm', height: '297mm', ...style }}>
    {children}
  </div>
);

/* ─── Inline SVG icons (no icon-font dependency in printed output) ─── */

const svg = (d: React.ReactNode, { size = 10, color = 'currentColor', className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
);
const IconPin = (p: IconProps) => svg(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></>, p);
const IconPhone = (p: IconProps) => svg(<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8.1 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z" />, p);
const IconMail = (p: IconProps) => svg(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>, p);
const IconGlobe = (p: IconProps) => svg(<><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z" /></>, p);
const IconStethoscope = (p: IconProps) => svg(<><path d="M4 3v6a5 5 0 0010 0V3" /><path d="M9 14v2a5 5 0 0010 0v-3" /><circle cx="19" cy="10" r="2" /></>, p);

/* ─── Field primitives ─── */
const DottedField: React.FC<{
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

const RuledField: React.FC<{
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
const RxGlyph: React.FC<{ size?: number; color?: string; strokeWidth?: number }> =
({ size = 34, color = '#111827', strokeWidth = 2 }) => (
  <svg width={size} height={size * 1.08} viewBox="0 0 32 34" fill="none"
       stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M6 3h8a6 6 0 010 12H6V3z" />
    <path d="M6 15v16" />
    <path d="M13 15l14 16M27 15L13 31" />
  </svg>
);

/* ─── Drug list (numbered, clinical) ─── */
const DrugList: React.FC<{
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
          {(it.dosage || it.duration) && (
            <div className="mt-0.5 flex flex-wrap gap-x-4" style={{ fontSize: '9.5pt' }}>
              {it.dosage && <span style={{ color: '#374151' }}>{it.dosage}</span>}
              {it.duration && <span style={{ color: muted }}>pendant {it.duration}</span>}
            </div>
          )}
        </div>
      </li>
    ))}
  </ol>
);

/* ─── Drug table (banded header variant) ─── */
const DrugTable: React.FC<{ items: RxItem[]; headerBg?: string; headerColor?: string; stripe?: string }> =
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
          <td className="px-2.5 py-2 align-top" style={{ color: '#374151' }}>{it.dosage}</td>
          <td className="px-2.5 py-2 align-top" style={{ color: '#6b7280' }}>{it.duration}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ─── Signature block ─── */
const SignatureLine: React.FC<{ label?: string; color?: string; width?: number | string; align?: 'left' | 'right' }> =
({ label = 'Signature & Cachet', color = '#64748b', width = 170, align = 'right' }) => (
  <div style={{ width, marginLeft: align === 'right' ? 'auto' : undefined }}>
    <div className="border-b" style={{ borderColor: color, opacity: 0.6 }} />
    <div className="mt-1 text-center" style={{ color, fontSize: '8pt' }}>{label}</div>
  </div>
);

/* ─── Optional photo slot (for designs whose original art is a photograph) ─── */
const PhotoSlot: React.FC<{
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
const QrMark: React.FC<{ size?: number; seed?: string; color?: string; bg?: string }> =
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
const CaduceusMark: React.FC<{ size?: number; color?: string; opacity?: number }> =
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

/* ─── Template01OrangeCurve ─── */
/* Template 01 — "Orange Curve" (PDF p.2)
   Orange type, twin dashed ribbons sweeping down the left margin,
   red medical-cross badge, contact block at the foot. */

const C = {
  orange: '#F0651F',
  orangeSoft: '#F7A76C',
  blueSoft: '#A8CBE8',
  grey: '#6D6E71',
  badge: '#E1341E',
};

const Template01OrangeCurve: React.FC<RxTemplateProps> = ({ doctor, patient, date, items, photoUrl }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Dashed ribbons + arrowheads */}
    <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox="0 0 210 297" preserveAspectRatio="none">
      <path d="M30 14C22 44 18 90 24 140c6 50 16 96 14 157" fill="none" stroke={C.orangeSoft} strokeWidth="0.7" strokeDasharray="2.2 2.4" strokeLinecap="round" />
      <path d="M25 18C17 48 13 92 19 142c6 50 16 94 14 155" fill="none" stroke={C.blueSoft} strokeWidth="0.6" strokeDasharray="2 2.6" strokeLinecap="round" />
    </svg>
    <svg className="absolute pointer-events-none" style={{ left: '13mm', top: '8mm' }} width="60" height="34" viewBox="0 0 60 34" fill="none">
      <path d="M30 6C22 8 16 12 12 18" stroke={C.orangeSoft} strokeWidth="1" strokeDasharray="2 2" strokeLinecap="round" />
      <path d="M12 18l5-1.5M12 18l1.5 5" stroke={C.orangeSoft} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M34 13C26 15 21 18 17 24" stroke={C.blueSoft} strokeWidth="0.9" strokeDasharray="2 2" strokeLinecap="round" />
      <path d="M17 24l4.5-1.5M17 24l1.5 4.5" stroke={C.blueSoft} strokeWidth="1" strokeLinecap="round" />
    </svg>

    {/* Cross badge */}
    <div className="absolute flex items-center justify-center rounded-full"
         style={{ left: '10mm', top: '26mm', width: '13mm', height: '13mm', background: C.badge, boxShadow: `0 0 0 1.1mm #fff, 0 0 0 1.5mm ${C.badge}` }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </div>

    {/* Header */}
    <div className="absolute flex items-start justify-between"
         style={{ left: '58mm', right: '14mm', top: '13mm' }}>
      <div>
        <div className="font-semibold leading-none" style={{ color: C.orange, fontSize: '16pt' }}>{doctor.name}</div>
        <div className="mt-1" style={{ color: C.grey, fontSize: '9pt' }}>{doctor.speciality}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold leading-none" style={{ color: C.orange, fontSize: '16pt' }}>Cabinet Médical</div>
        <div className="mt-1" style={{ color: C.grey, fontSize: '9pt' }}>INPE {doctor.registrationNumber}</div>
      </div>
    </div>

    {/* Patient strip */}
    <div className="absolute flex items-baseline gap-3" style={{ left: '26mm', right: '14mm', top: '31mm', fontSize: '8.5pt' }}>
      <DottedField label="Nom :" value={patient.name} grow={5} labelColor={C.grey} lineColor="#c9cbcd" />
      <DottedField label="Âge :" value={patient.age} grow={1} minWidth={26} labelColor={C.grey} lineColor="#c9cbcd" />
      <DottedField label="Sexe :" value={patient.sex} grow={1} minWidth={22} labelColor={C.grey} lineColor="#c9cbcd" />
      <DottedField label="Date :" value={date} grow={2} minWidth={38} labelColor={C.grey} lineColor="#c9cbcd" />
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '32mm', right: '16mm', top: '46mm', bottom: '62mm' }}>
      <DrugList items={items} accent={C.orange} muted="#8a8c8e" />
    </div>

    {/* Footer */}
    <PhotoSlot src={photoUrl} width="46mm" height="42mm" hint="photo (optionnel)"
               className="absolute" style={{ left: '26mm', bottom: '4mm' }} />
    <div className="absolute space-y-1.5" style={{ left: '80mm', right: '14mm', bottom: '10mm', fontSize: '7.5pt', color: C.grey }}>
      <div className="flex items-start gap-1.5">
        <span className="mt-[1px]" style={{ color: C.orange }}><IconPin size={9} /></span>
        <span>{doctor.address}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: C.orange }}><IconPhone size={9} /></span>
        <span>{doctor.phone}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span style={{ color: C.orange }}><IconMail size={9} /></span>
        <span>{doctor.email}</span>
      </div>
    </div>
  </A4Page>
);

/* ─── Template02NavyCaduceus ─── */
/* Template 02 — "Navy Caduceus" (PDF p.3)
   Navy dome header with a fan of thin cyan arcs, caduceus mark,
   two-column ruled patient block, layered multi-colour wave footer. */

const C = {
  navy: '#0B2A5B',
  navyDeep: '#071E45',
  cyan: '#4FC3E8',
  cyanPale: '#8FDCF5',
  cyanMid: '#29ABE2',
  orange: '#F5871F',
  gold: '#FBB040',
};

const Template02NavyCaduceus: React.FC<RxTemplateProps> = ({ doctor, patient, date, items }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Header: cyan arc fan behind navy dome */}
    <svg className="absolute top-0 left-0 pointer-events-none" width="100%" height="70mm" viewBox="0 0 210 70" preserveAspectRatio="none">
      <defs>
        <linearGradient id="t2navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.navy} />
          <stop offset="100%" stopColor={C.navyDeep} />
        </linearGradient>
      </defs>
      {Array.from({ length: 12 }).map((_, k) => (
        <path key={k}
              d={`M-6 ${3 + k * 2.05} C 52 ${33 + k * 3.1}, 158 ${33 + k * 3.1}, 216 ${3 + k * 2.05}`}
              fill="none" stroke={k % 2 ? C.cyan : C.cyanPale} strokeWidth="0.42"
              opacity={0.85 - k * 0.05} />
      ))}
      <path d="M16 0 H194 V21 C152 57, 58 57, 16 21 Z" fill="url(#t2navy)" />
    </svg>

    {/* Header content */}
    <div className="absolute flex items-center gap-5" style={{ left: '52mm', top: '7mm' }}>
      <CaduceusMark size={54} color="#ffffff" />
      <div>
        <div style={{ color: C.cyan, fontSize: '11.5pt', letterSpacing: '0.22em' }}>PRESCRIPTION</div>
        <div className="font-semibold leading-tight" style={{ color: '#fff', fontSize: '19pt' }}>{doctor.name}</div>
        <div style={{ color: C.cyan, fontSize: '9pt', letterSpacing: '0.06em' }}>{doctor.speciality}</div>
      </div>
    </div>

    {/* Patient block */}
    <div className="absolute grid grid-cols-2 gap-x-10 gap-y-2.5" style={{ left: '18mm', right: '18mm', top: '70mm', fontSize: '9.5pt' }}>
      <RuledField label="Nom du patient" value={patient.name} labelWidth={82} lineColor="#9fb3cc" />
      <RuledField label="Âge / Sexe" value={`${patient.age} ans · ${patient.sex}`} labelWidth={82} lineColor="#9fb3cc" />
      <RuledField label="Date" value={date} labelWidth={82} lineColor="#9fb3cc" />
      <RuledField label="N° INPE" value={doctor.registrationNumber} labelWidth={82} lineColor="#9fb3cc" />
    </div>

    {/* Watermark */}
    <div className="absolute pointer-events-none" style={{ left: '50%', top: '112mm', transform: 'translateX(-50%)' }}>
      <CaduceusMark size={128} color="#dbe6f5" opacity={0.75} />
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '20mm', right: '20mm', top: '96mm', bottom: '74mm' }}>
      <DrugList items={items} accent={C.navy} muted="#7b8794" />
    </div>

    <div className="absolute" style={{ left: '20mm', right: '20mm', bottom: '62mm' }}>
      <SignatureLine label="Signature" color={C.navy} width={170} />
    </div>

    {/* Layered wave footer */}
    <svg className="absolute bottom-0 left-0" width="100%" height="58mm" viewBox="0 0 210 58" preserveAspectRatio="none">
      <path d="M0 24 C 38 8, 72 40, 108 28 C 140 18, 176 30, 210 22 V58 H0 Z" fill={C.cyanPale} />
      <path d="M0 32 C 38 16, 72 46, 108 34 C 140 24, 176 36, 210 28 V58 H0 Z" fill={C.cyanMid} />
      <path d="M52 46 C 96 20, 150 48, 210 16 V58 H52 Z" fill={C.gold} />
      <path d="M48 50 C 96 26, 150 52, 210 22 V58 H48 Z" fill={C.orange} />
      <path d="M0 40 C 44 26, 98 52, 148 38 C 176 30, 195 40, 210 34 V58 H0 Z" fill={C.navy} />
    </svg>

    {/* Footer text */}
    <div className="absolute text-center" style={{ left: '14mm', right: '14mm', bottom: '5mm', color: '#fff' }}>
      <div className="font-semibold" style={{ fontSize: '11pt', letterSpacing: '0.06em' }}>CABINET MÉDICAL</div>
      <div style={{ fontSize: '7.5pt', opacity: 0.92, letterSpacing: '0.03em' }}>{doctor.address}</div>
      <div style={{ fontSize: '7.5pt', opacity: 0.92 }}>
        {doctor.phone} &nbsp;|&nbsp; {doctor.email}
      </div>
    </div>
  </A4Page>
);

/* ─── Template03PurpleHeart ─── */
/* Template 03 — "Purple Heart-Leaf" (PDF p.4)
   Purple ribbon tab, heart/leaf emblem, lavender information band,
   oversized Rx, pale emblem watermark, purple footer with QR block. */

const C = {
  purple: '#6B3FD4',
  purpleDeep: '#5B2FD1',
  purpleLight: '#8C6BE8',
  lavender: '#F1EEFC',
  lineLav: '#CFC4F2',
  ink: '#1A1A2E',
  grey: '#8E8CA3',
};

const HeartLeaf: React.FC<{ size?: number; color?: string; sw?: number; opacity?: number }> =
({ size = 64, color = C.purpleDeep, sw = 3.4, opacity = 1 }) => (
  <svg width={size} height={size * 0.875} viewBox="0 0 64 56" fill="none" opacity={opacity}>
    <path d="M32 52C8 36 4 22 12 14c7-7 16-4 20 4 4-8 13-11 20-4 8 8 4 22-20 38z"
          stroke={color} strokeWidth={sw} strokeLinejoin="round" />
    <path d="M32 18c-8 6-10 16-2 24 8-8 10-18 2-24z"
          stroke={color} strokeWidth={sw} strokeLinejoin="round" />
  </svg>
);

const Template03PurpleHeart: React.FC<RxTemplateProps> = ({ doctor, patient, date, items }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Purple ribbon tab */}
    <svg className="absolute top-0 left-0" width="92mm" height="30mm" viewBox="0 0 92 30" preserveAspectRatio="none">
      <defs>
        <linearGradient id="t3tab" x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor={C.purpleDeep} />
          <stop offset="100%" stopColor={C.purpleLight} />
        </linearGradient>
      </defs>
      <path d="M0 0H92C92 0 88 30 62 30H0Z" fill="url(#t3tab)" />
    </svg>
    <div className="absolute" style={{ left: '15mm', top: '8mm', color: '#fff', fontSize: '17pt', fontWeight: 300 }}>
      Ordonnance
    </div>

    {/* Emblem + doctor identity */}
    <div className="absolute flex items-center gap-4" style={{ right: '16mm', top: '6mm' }}>
      <HeartLeaf size={62} />
      <div className="text-left">
        <div className="font-bold leading-tight" style={{ color: C.ink, fontSize: '19pt' }}>{doctor.name}</div>
        <div className="text-right" style={{ color: C.purple, fontSize: '9pt' }}>{doctor.speciality}</div>
        <div className="text-right italic" style={{ color: C.grey, fontSize: '8.5pt' }}>INPE {doctor.registrationNumber}</div>
      </div>
    </div>

    {/* Lavender information band */}
    <div className="absolute" style={{ left: 0, right: 0, top: '40mm', height: '25mm', background: C.lavender }} />
    <div className="absolute grid grid-cols-2 gap-x-10 gap-y-2" style={{ left: '18mm', right: '18mm', top: '44mm', fontSize: '9.5pt' }}>
      <RuledField label="Nom du patient" value={patient.name} labelWidth={80} lineColor={C.lineLav} labelColor="#4B4A63" />
      <RuledField label="Âge / Sexe" value={`${patient.age} ans · ${patient.sex}`} labelWidth={80} lineColor={C.lineLav} labelColor="#4B4A63" />
      <RuledField label="Date" value={date} labelWidth={80} lineColor={C.lineLav} labelColor="#4B4A63" />
      <RuledField label="Diagnostic" labelWidth={80} lineColor={C.lineLav} labelColor="#4B4A63" />
    </div>

    {/* Rx */}
    <div className="absolute font-light" style={{ left: '19mm', top: '71mm', color: C.purple, fontSize: '27pt', lineHeight: 1 }}>
      Rx
    </div>

    {/* Watermark */}
    <div className="absolute pointer-events-none" style={{ left: '50%', top: '104mm', transform: 'translateX(-50%)' }}>
      <HeartLeaf size={210} color="#EDE8FB" sw={2.2} />
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '19mm', right: '19mm', top: '88mm', bottom: '68mm' }}>
      <DrugList items={items} accent={C.purple} muted={C.grey} />
    </div>

    <div className="absolute" style={{ left: '19mm', right: '19mm', bottom: '56mm' }}>
      <SignatureLine label="Signature" color={C.purple} width={165} />
    </div>

    {/* Purple footer */}
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-6"
         style={{ height: '44mm', padding: '0 16mm',
                  background: `linear-gradient(105deg, ${C.purpleDeep} 0%, ${C.purple} 55%, ${C.purpleLight} 100%)` }}>
      <div className="bg-white p-1.5 rounded-sm shrink-0">
        <QrMark size={62} seed={doctor.registrationNumber || doctor.name} color={C.purpleDeep} />
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 flex-1" style={{ color: '#fff', fontSize: '7.5pt' }}>
        <div className="flex items-start gap-2">
          <span className="mt-[1px] opacity-90"><IconPin size={10} /></span>
          <div>
            <div className="font-semibold" style={{ fontSize: '8pt' }}>Adresse</div>
            <div className="opacity-85 leading-snug">{doctor.address}</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="opacity-90"><IconPhone size={10} /></span>
            <div>
              <div className="font-semibold" style={{ fontSize: '8pt' }}>Téléphone</div>
              <div className="opacity-85">{doctor.phone}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-90"><IconMail size={10} /></span>
            <div>
              <div className="font-semibold" style={{ fontSize: '8pt' }}>Email</div>
              <div className="opacity-85">{doctor.email}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </A4Page>
);

/* ─── Template04PastelProfile ─── */
/* Template 04 — "Pastel Profile" (PDF p.5)
   Minimal serif masthead, overlapping pink/blue face silhouettes top-right,
   pale silhouette watermark, soft wave cluster bottom-right, quiet contact block. */

const C = {
  pink: '#F2A3B3',
  pinkSoft: '#F9D5DD',
  blue: '#AFC6E9',
  blueSoft: '#DCE6F6',
  ink: '#58595B',
  grey: '#8A8B8D',
};

/* Stylised profile silhouette — drawn, not traced */
const ProfileMark: React.FC<{ size?: number; color?: string; opacity?: number }> =
({ size = 90, color = C.pink, opacity = 1 }) => (
  <svg width={size} height={size * 1.25} viewBox="0 0 80 100" fill="none" opacity={opacity}>
    <path d="M56 4c-14 0-25 10-27 24-1 8-5 12-8 18-2 4 0 7 4 8l6 1c1 6 0 10-2 14-2 5 1 8 6 8h9v19h30V60c6-5 9-13 9-23C83 19 71 4 56 4z"
          fill={color} />
  </svg>
);

const Template04PastelProfile: React.FC<RxTemplateProps> = ({ doctor, patient, date, items }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Left hairline rule */}
    <div className="absolute" style={{ left: '15mm', top: 0, bottom: 0, width: '0.35mm', background: '#E6E7E8' }} />

    {/* Masthead */}
    <div className="absolute" style={{ left: '25mm', top: '16mm' }}>
      <div className="font-serif" style={{ color: C.ink, fontSize: '17pt', letterSpacing: '0.005em' }}>{doctor.name}</div>
      <div className="mt-1.5" style={{ color: C.grey, fontSize: '9.5pt' }}>{doctor.speciality}</div>
      <div style={{ color: C.grey, fontSize: '9.5pt' }}>INPE {doctor.registrationNumber}</div>
    </div>

    {/* Overlapping silhouettes, top-right */}
    <div className="absolute" style={{ right: '18mm', top: '10mm' }}>
      <div className="relative">
        <div className="absolute" style={{ left: '9mm', top: 0 }}><ProfileMark size={62} color={C.blue} opacity={0.85} /></div>
        <ProfileMark size={62} color={C.pink} opacity={0.9} />
      </div>
    </div>

    {/* Patient line */}
    <div className="absolute flex items-baseline gap-6" style={{ left: '25mm', right: '18mm', top: '48mm', fontSize: '9pt', color: C.ink }}>
      <span className="flex-1 border-b pb-0.5" style={{ borderColor: C.pinkSoft }}>
        <span style={{ color: C.grey }}>Nom&nbsp;·&nbsp;</span>{patient.name}
      </span>
      <span className="border-b pb-0.5" style={{ borderColor: C.pinkSoft, minWidth: '24mm' }}>
        <span style={{ color: C.grey }}>Âge&nbsp;·&nbsp;</span>{patient.age}
      </span>
      <span className="border-b pb-0.5" style={{ borderColor: C.pinkSoft, minWidth: '20mm' }}>
        <span style={{ color: C.grey }}>Sexe&nbsp;·&nbsp;</span>{patient.sex}
      </span>
      <span className="border-b pb-0.5" style={{ borderColor: C.pinkSoft, minWidth: '30mm' }}>
        <span style={{ color: C.grey }}>Date&nbsp;·&nbsp;</span>{date}
      </span>
    </div>

    {/* Watermark silhouettes */}
    <div className="absolute pointer-events-none" style={{ left: '58mm', top: '78mm' }}>
      <div className="relative">
        <div className="absolute" style={{ left: '22mm', top: '6mm' }}><ProfileMark size={148} color={C.blueSoft} opacity={0.55} /></div>
        <ProfileMark size={148} color={C.pinkSoft} opacity={0.5} />
      </div>
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '25mm', right: '18mm', top: '62mm', bottom: '68mm' }}>
      <DrugList items={items} accent={C.pink} nameColor={C.ink} muted={C.grey} />
    </div>

    {/* Soft wave cluster, bottom-right */}
    <svg className="absolute bottom-0 right-0" width="105mm" height="52mm" viewBox="0 0 105 52" preserveAspectRatio="none">
      <path d="M6 52C18 26 46 12 105 8V52H6Z" fill={C.blueSoft} />
      <path d="M22 52C34 32 60 20 105 18V52H22Z" fill={C.blue} opacity="0.75" />
      <path d="M0 52C16 42 44 36 105 34V52H0Z" fill={C.pinkSoft} />
      <path d="M14 52C32 46 62 43 105 42V52H14Z" fill={C.pink} opacity="0.85" />
    </svg>

    {/* Contact block */}
    <div className="absolute space-y-2" style={{ left: '25mm', bottom: '14mm', fontSize: '8pt', color: C.ink }}>
      <div className="flex items-center gap-2">
        <span style={{ color: C.pink }}><IconPhone size={10} /></span>
        <span>{doctor.phone}</span>
      </div>
      <div className="flex items-start gap-2">
        <span className="mt-[1px]" style={{ color: C.pink }}><IconPin size={10} /></span>
        <span className="leading-snug">{doctor.address}</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: C.pink }}><IconMail size={10} /></span>
        <span>{doctor.email}</span>
      </div>
    </div>
  </A4Page>
);

/* ─── Template05RedEcg ─── */
/* Template 05 — "Red ECG" (PDF p.6)
   Red masthead with heart + ECG trace, double red rule, circled Rx badge,
   ECG line footer above the contact lines. */

const C = {
  red: '#ED1C24',
  redDeep: '#D5121A',
  ink: '#231F20',
  grey: '#6D6E71',
};

/* Heart with an ECG notch cut through it */
const HeartEcg: React.FC<{ w?: number }> = ({ w = 128 }) => (
  <svg width={w} height={w * 0.72} viewBox="0 0 128 92" fill="none">
    <path d="M64 88C24 62 6 44 6 28 6 14 16 4 29 4c12 0 19 7 23 15h24c8 0 12-4 12-4 6-7 13-11 21-11 13 0 19 10 19 24 0 16-20 34-64 60z" fill={C.red} />
    <path d="M0 34h30l7-16 9 34 8-18 7 9h58" stroke="#fff" strokeWidth="4.2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

const Template05RedEcg: React.FC<RxTemplateProps> = ({ doctor, patient, date, items }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Masthead */}
    <div className="absolute" style={{ left: '18mm', top: '14mm' }}>
      <div className="font-semibold" style={{ color: C.red, fontSize: '15pt', letterSpacing: '0.02em' }}>CABINET MÉDICAL</div>
      <div style={{ color: C.grey, fontSize: '8.5pt', letterSpacing: '0.14em' }}>INPE {doctor.registrationNumber}</div>
    </div>

    <div className="absolute text-right" style={{ right: '52mm', top: '16mm' }}>
      <div style={{ color: C.grey, fontSize: '8.5pt' }}>{doctor.speciality}</div>
      <div className="font-semibold" style={{ color: C.red, fontSize: '13pt' }}>{doctor.name}</div>
    </div>

    <div className="absolute" style={{ right: '14mm', top: '10mm' }}><HeartEcg w={110} /></div>

    {/* Double rule */}
    <div className="absolute" style={{ left: 0, right: 0, top: '32mm', height: '1.1mm', background: C.red }} />
    <div className="absolute" style={{ left: 0, right: 0, top: '33.6mm', height: '0.3mm', background: C.red, opacity: 0.55 }} />

    {/* Patient block */}
    <div className="absolute flex" style={{ left: '20mm', right: '16mm', top: '38mm', fontSize: '8.5pt' }}>
      <DottedField label="Nom :" value={patient.name} grow={1} labelColor={C.ink} lineColor="#bdbec0" />
    </div>
    <div className="absolute flex items-baseline gap-5" style={{ left: '56mm', right: '16mm', top: '45mm', fontSize: '8.5pt' }}>
      <DottedField label="Âge :" value={patient.age} grow={1} minWidth={22} labelColor={C.ink} lineColor="#bdbec0" />
      <DottedField label="Sexe :" value={patient.sex} grow={1} minWidth={20} labelColor={C.ink} lineColor="#bdbec0" />
      <DottedField label="Date :" value={date} grow={2} minWidth={34} labelColor={C.ink} lineColor="#bdbec0" />
    </div>

    {/* Circled Rx badge */}
    <div className="absolute flex items-center justify-center rounded-full"
         style={{ left: '19mm', top: '43mm', width: '8.4mm', height: '8.4mm', border: `0.5mm solid ${C.red}` }}>
      <svg width="15" height="16" viewBox="0 0 15 16" fill="none" stroke={C.red} strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 2h4a3 3 0 010 6H3V2z" /><path d="M3 8v6" /><path d="M7 8l6 6M13 8L7 14" />
      </svg>
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '20mm', right: '16mm', top: '58mm', bottom: '48mm' }}>
      <DrugList items={items} accent={C.red} nameColor={C.ink} muted={C.grey} />
    </div>

    {/* Footer contact */}
    <div className="absolute text-right space-y-0.5" style={{ right: '16mm', bottom: '26mm', fontSize: '7.5pt', color: C.ink }}>
      <div>{doctor.address}</div>
      <div>Tél : {doctor.phone}</div>
      <div>{doctor.email}</div>
    </div>

    {/* ECG footer line */}
    <svg className="absolute" style={{ left: 0, right: 0, bottom: '14mm' }} width="100%" height="16mm" viewBox="0 0 210 16" preserveAspectRatio="none">
      <path d="M0 11h20l4-9 5 14 4-11 3 6h174" stroke={C.red} strokeWidth="1" fill="none" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  </A4Page>
);

/* ─── Template06PinkArc ─── */
/* Template 06 — "Pink Arc" (PDF p.7)
   Pink header panel with a white arc scooped from its lower edge,
   serif masthead, circled Rx, footer masthead with teal/pink rules. */

const C = {
  pink: '#EC4B8C',
  pinkMid: '#F06EA9',
  pinkSoft: '#FBD9E7',
  teal: '#29ABA2',
  ink: '#3F3F46',
  grey: '#7C7C85',
};

const Template06PinkArc: React.FC<RxTemplateProps> = ({ doctor, patient, date, items, photoUrl }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Pink header with scooped arc */}
    <svg className="absolute top-0 left-0" width="100%" height="30mm" viewBox="0 0 210 30" preserveAspectRatio="none">
      <defs>
        <linearGradient id="t6pink" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.pink} />
          <stop offset="100%" stopColor={C.pinkMid} />
        </linearGradient>
      </defs>
      <path d="M0 0H210V30H0Z" fill="url(#t6pink)" />
      <path d="M0 30C46 12 164 12 210 30V30H0Z" fill="#fff" />
      <path d="M0 30C46 12 164 12 210 30" fill="none" stroke="#fff" strokeWidth="0.6" />
    </svg>

    {/* Masthead inside the pink band */}
    <div className="absolute text-center" style={{ left: 0, right: 0, top: '6mm' }}>
      <div className="font-serif" style={{ color: '#fff', fontSize: '15pt' }}>{doctor.name}</div>
      <div style={{ color: '#FFE3EF', fontSize: '8.5pt' }}>{doctor.speciality}</div>
    </div>

    {/* Patient line */}
    <div className="absolute flex items-baseline gap-4" style={{ left: '20mm', right: '16mm', top: '34mm', fontSize: '8.5pt' }}>
      <DottedField label="Nom :" value={patient.name} grow={5} labelColor={C.ink} lineColor="#c8c8ce" />
      <DottedField label="Âge :" value={patient.age} grow={1} minWidth={20} labelColor={C.ink} lineColor="#c8c8ce" />
      <DottedField label="Sexe :" value={patient.sex} grow={1} minWidth={18} labelColor={C.ink} lineColor="#c8c8ce" />
      <DottedField label="Date :" value={date} grow={2} minWidth={32} labelColor={C.ink} lineColor="#c8c8ce" />
    </div>

    {/* Circled Rx */}
    <div className="absolute flex items-center justify-center rounded-full"
         style={{ left: '20mm', top: '42mm', width: '8.4mm', height: '8.4mm', border: `0.45mm solid ${C.pink}`, background: C.pinkSoft }}>
      <svg width="15" height="16" viewBox="0 0 15 16" fill="none" stroke={C.pink} strokeWidth="1.5" strokeLinecap="round">
        <path d="M3 2h4a3 3 0 010 6H3V2z" /><path d="M3 8v6" /><path d="M7 8l6 6M13 8L7 14" />
      </svg>
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '20mm', right: '16mm', top: '56mm', bottom: '58mm' }}>
      <DrugList items={items} accent={C.pink} nameColor={C.ink} muted={C.grey} />
    </div>

    {/* Optional photo, bottom-right */}
    <PhotoSlot src={photoUrl} width="42mm" height="46mm" hint="photo (optionnel)"
               className="absolute" style={{ right: '16mm', bottom: '4mm' }} />

    {/* Footer masthead */}
    <div className="absolute" style={{ left: '20mm', bottom: '16mm' }}>
      <div className="font-serif" style={{ color: C.pink, fontSize: '13pt' }}>Cabinet Médical</div>
      <div className="italic" style={{ color: C.grey, fontSize: '8pt' }}>INPE {doctor.registrationNumber}</div>
      <div className="mt-1.5 space-y-0.5" style={{ color: C.ink, fontSize: '7.5pt' }}>
        <div>{doctor.address}</div>
        <div>Tél : {doctor.phone}</div>
        <div>{doctor.email}</div>
      </div>
    </div>

    {/* Footer rules */}
    <div className="absolute" style={{ left: '20mm', width: '108mm', bottom: '12mm', height: '0.6mm', background: C.teal }} />
    <div className="absolute" style={{ left: '20mm', width: '108mm', bottom: '10.6mm', height: '0.5mm', background: C.pink }} />
  </A4Page>
);

/* ─── Template07BlueBandClinic ─── */
/* Template 07 — "Blue Band Clinic" (PDF p.8)
   Full-width navy band masthead with a white curved cut, clinic wordmark left,
   practitioner credentials right, navy/gold wave footer. */

const C = {
  navy: '#1B4F9C',
  navyDeep: '#143B78',
  blue: '#2C5FA8',
  gold: '#A98B54',
  goldSoft: '#C7AE83',
  ink: '#231F20',
  grey: '#6D6E71',
};

const Template07BlueBandClinic: React.FC<RxTemplateProps> = ({ doctor, patient, date, items }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Navy masthead band */}
    <svg className="absolute top-0 left-0" width="100%" height="34mm" viewBox="0 0 210 34" preserveAspectRatio="none">
      <defs>
        <linearGradient id="t7band" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={C.navyDeep} />
          <stop offset="100%" stopColor={C.blue} />
        </linearGradient>
      </defs>
      <rect width="210" height="34" fill="url(#t7band)" />
      <path d="M0 0H96C82 12 74 22 70 34H0Z" fill="#fff" />
      <path d="M96 0C82 12 74 22 70 34" fill="none" stroke={C.goldSoft} strokeWidth="0.5" />
    </svg>

    {/* Clinic wordmark (left, on white cut) */}
    <div className="absolute" style={{ left: '16mm', top: '8mm' }}>
      <div className="font-semibold leading-none" style={{ color: C.navy, fontSize: '17pt', letterSpacing: '0.02em' }}>
        CABINET
      </div>
      <div style={{ color: C.navy, fontSize: '8pt', letterSpacing: '0.16em' }}>MÉDICAL</div>
      <div className="mt-0.5" style={{ color: C.gold, fontSize: '6.5pt', letterSpacing: '0.2em' }}>DOCEASE</div>
    </div>

    {/* Practitioner credentials (right, on navy) */}
    <div className="absolute text-right" style={{ right: '16mm', top: '8mm', color: '#fff' }}>
      <div className="font-semibold" style={{ fontSize: '11pt' }}>{doctor.name}</div>
      <div style={{ fontSize: '7.5pt', opacity: 0.9 }}>{doctor.speciality}</div>
      <div style={{ fontSize: '7pt', opacity: 0.75 }}>INPE : {doctor.registrationNumber}</div>
    </div>

    {/* Patient line */}
    <div className="absolute flex items-baseline gap-5" style={{ left: '18mm', right: '16mm', top: '40mm', fontSize: '8.5pt' }}>
      <DottedField label="Nom du patient" value={patient.name} grow={5} labelColor={C.ink} lineColor="#bdbec0" />
      <DottedField label="Âge / Sexe" value={`${patient.age} · ${patient.sex}`} grow={2} minWidth={26} labelColor={C.ink} lineColor="#bdbec0" />
      <DottedField label="Date" value={date} grow={2} minWidth={30} labelColor={C.ink} lineColor="#bdbec0" />
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '18mm', right: '16mm', top: '52mm', bottom: '48mm' }}>
      <DrugList items={items} accent={C.navy} nameColor={C.ink} muted={C.grey} />
    </div>

    {/* Navy / gold wave footer */}
    <svg className="absolute bottom-0 left-0" width="100%" height="40mm" viewBox="0 0 210 40" preserveAspectRatio="none">
      <path d="M0 16C40 4 76 26 120 20 158 15 184 22 210 14V40H0Z" fill={C.goldSoft} />
      <path d="M0 21C40 9 76 31 120 25 158 20 184 27 210 19V40H0Z" fill={C.gold} />
      <path d="M0 26C42 14 78 34 122 29 160 25 186 31 210 24V40H0Z" fill={C.navy} />
    </svg>

    {/* Footer contact */}
    <div className="absolute grid grid-cols-2 gap-x-8 gap-y-1"
         style={{ left: '18mm', right: '16mm', bottom: '5mm', color: '#fff', fontSize: '7pt' }}>
      <div className="flex items-start gap-1.5">
        <span className="mt-[1px] opacity-90"><IconPin size={8} /></span><span>{doctor.address}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="opacity-90"><IconPhone size={8} /></span><span>{doctor.phone}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="opacity-90"><IconMail size={8} /></span><span>{doctor.email}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="opacity-90"><IconGlobe size={8} /></span><span>INPE {doctor.registrationNumber}</span>
      </div>
    </div>
  </A4Page>
);

/* ─── Template08BlueWaveCare ─── */
/* Template 08 — "Blue Wave Care" (PDF p.9)
   Soft cyan crest across the top, rounded wordmark left, sweeping
   multi-tone wave footer, optional portrait at lower-left. */

const C = {
  blue: '#1C7BC0',
  blueDeep: '#155F97',
  cyan: '#57BEEA',
  cyanPale: '#B7E2F6',
  cyanWash: '#E6F4FC',
  ink: '#243746',
  grey: '#6E8494',
};

const Template08BlueWaveCare: React.FC<RxTemplateProps> = ({ doctor, patient, date, items, photoUrl }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Top crest */}
    <svg className="absolute top-0 left-0" width="100%" height="46mm" viewBox="0 0 210 46" preserveAspectRatio="none">
      <path d="M0 0H210V22C160 40 92 40 42 30 26 27 12 26 0 27Z" fill={C.cyanWash} />
      <path d="M0 0H210V15C158 33 90 33 40 23 24 20 11 19 0 20Z" fill={C.cyanPale} />
      <path d="M0 0H210V8C156 25 88 25 38 15 22 12 10 11 0 12Z" fill={C.cyan} />
    </svg>

    {/* Wordmark */}
    <div className="absolute flex items-center gap-3" style={{ left: '17mm', top: '20mm' }}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        <circle cx="17" cy="17" r="16" fill={C.blue} />
        <path d="M17 9v16M9 17h16" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      <div>
        <div className="font-semibold leading-none" style={{ color: C.blueDeep, fontSize: '15pt' }}>{doctor.name}</div>
        <div style={{ color: C.grey, fontSize: '8.5pt' }}>{doctor.speciality}</div>
      </div>
    </div>

    <div className="absolute text-right" style={{ right: '17mm', top: '22mm' }}>
      <div style={{ color: C.blue, fontSize: '8.5pt', letterSpacing: '0.18em' }}>ORDONNANCE</div>
      <div style={{ color: C.grey, fontSize: '7.5pt' }}>INPE {doctor.registrationNumber}</div>
    </div>

    {/* Patient block */}
    <div className="absolute grid grid-cols-2 gap-x-9 gap-y-2.5"
         style={{ left: '18mm', right: '17mm', top: '52mm', fontSize: '9.5pt' }}>
      <RuledField label="Nom" value={patient.name} labelWidth={62} lineColor={C.cyanPale} labelColor={C.grey} valueColor={C.ink} />
      <RuledField label="Âge / Sexe" value={`${patient.age} ans · ${patient.sex}`} labelWidth={62} lineColor={C.cyanPale} labelColor={C.grey} valueColor={C.ink} />
      <RuledField label="Date" value={date} labelWidth={62} lineColor={C.cyanPale} labelColor={C.grey} valueColor={C.ink} />
      <RuledField label="Diagnostic" labelWidth={62} lineColor={C.cyanPale} labelColor={C.grey} valueColor={C.ink} />
    </div>

    {/* Body */}
    <div className="absolute" style={{ left: '18mm', right: '17mm', top: '72mm', bottom: '76mm' }}>
      <DrugList items={items} accent={C.blue} nameColor={C.ink} muted={C.grey} />
    </div>

    <div className="absolute" style={{ left: '18mm', right: '17mm', bottom: '64mm' }}>
      <SignatureLine label="Signature & Cachet" color={C.blue} width={168} />
    </div>

    {/* Optional portrait */}
    <PhotoSlot src={photoUrl} width="40mm" height="44mm" hint="photo (optionnel)"
               className="absolute" style={{ left: '18mm', bottom: '16mm' }} />

    {/* Wave footer */}
    <svg className="absolute bottom-0 left-0" width="100%" height="56mm" viewBox="0 0 210 56" preserveAspectRatio="none">
      <path d="M0 30C46 12 92 40 138 30 172 23 192 30 210 24V56H0Z" fill={C.cyanPale} />
      <path d="M0 37C46 19 92 46 138 37 172 30 192 37 210 31V56H0Z" fill={C.cyan} />
      <path d="M0 44C48 27 94 51 140 43 174 37 193 43 210 38V56H0Z" fill={C.blue} />
    </svg>

    {/* Footer contact */}
    <div className="absolute flex flex-wrap items-center justify-center gap-x-6 gap-y-1"
         style={{ left: '14mm', right: '14mm', bottom: '5mm', color: '#fff', fontSize: '7pt' }}>
      <span className="flex items-center gap-1.5"><IconPin size={8} />{doctor.address}</span>
      <span className="flex items-center gap-1.5"><IconPhone size={8} />{doctor.phone}</span>
      <span className="flex items-center gap-1.5"><IconMail size={8} />{doctor.email}</span>
    </div>
  </A4Page>
);

/* ─── Template09BlueGradientCorner ─── */
/* Template 09 — "Blue Gradient Corner" (PDF p.10)
   Diagonal gradient wedge in the top-left corner, mirrored wedge bottom-right,
   thin accent rules, banded drug table, corner-anchored footer. */

const C = {
  blue: '#1565C0',
  blueDeep: '#0D47A1',
  cyan: '#42A5F5',
  cyanPale: '#BBDEFB',
  slate: '#37474F',
  ink: '#1B2A33',
  grey: '#68808E',
};

const Template09BlueGradientCorner: React.FC<RxTemplateProps> = ({ doctor, patient, date, items }) => (
  <A4Page>
    <RxPrintStyles />

    {/* Corner wedges */}
    <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox="0 0 210 297" preserveAspectRatio="none">
      <defs>
        <linearGradient id="t9tl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={C.blueDeep} />
          <stop offset="100%" stopColor={C.cyan} />
        </linearGradient>
        <linearGradient id="t9br" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={C.blueDeep} />
          <stop offset="100%" stopColor={C.cyan} />
        </linearGradient>
      </defs>
      <path d="M0 0H132C96 22 62 44 0 52Z" fill="url(#t9tl)" />
      <path d="M0 56C64 47 100 25 138 0h10C110 30 70 54 0 64Z" fill={C.cyanPale} opacity="0.75" />
      <path d="M210 297H78C114 275 148 253 210 245Z" fill="url(#t9br)" />
      <path d="M210 241C146 250 110 272 72 297H62C100 267 140 243 210 233Z" fill={C.cyanPale} opacity="0.75" />
    </svg>

    {/* Masthead */}
    <div className="absolute" style={{ left: '16mm', top: '9mm', color: '#fff' }}>
      <div className="font-semibold leading-none" style={{ fontSize: '15pt', letterSpacing: '0.01em' }}>{doctor.name}</div>
      <div style={{ fontSize: '8.5pt', opacity: 0.92 }}>{doctor.speciality}</div>
    </div>

    <div className="absolute text-right" style={{ right: '16mm', top: '14mm' }}>
      <div className="font-semibold" style={{ color: C.blueDeep, fontSize: '12pt', letterSpacing: '0.2em' }}>ORDONNANCE</div>
      <div style={{ color: C.grey, fontSize: '7.5pt' }}>INPE {doctor.registrationNumber}</div>
    </div>

    {/* Accent rules */}
    <div className="absolute" style={{ left: '16mm', right: '16mm', top: '58mm', height: '0.5mm', background: C.blue }} />
    <div className="absolute" style={{ left: '16mm', width: '46mm', top: '59.3mm', height: '0.35mm', background: C.cyan }} />

    {/* Patient block */}
    <div className="absolute grid grid-cols-2 gap-x-10 gap-y-2.5"
         style={{ left: '16mm', right: '16mm', top: '64mm', fontSize: '9.5pt' }}>
      <RuledField label="Nom du patient" value={patient.name} labelWidth={78} lineColor="#a9c2d4" labelColor={C.grey} valueColor={C.ink} />
      <RuledField label="Âge / Sexe" value={`${patient.age} ans · ${patient.sex}`} labelWidth={78} lineColor="#a9c2d4" labelColor={C.grey} valueColor={C.ink} />
      <RuledField label="Date" value={date} labelWidth={78} lineColor="#a9c2d4" labelColor={C.grey} valueColor={C.ink} />
      <RuledField label="Diagnostic" labelWidth={78} lineColor="#a9c2d4" labelColor={C.grey} valueColor={C.ink} />
    </div>

    {/* Rx glyph */}
    <div className="absolute" style={{ left: '16mm', top: '84mm' }}>
      <RxGlyph size={26} color={C.blueDeep} strokeWidth={2.1} />
    </div>

    {/* Drug table */}
    <div className="absolute" style={{ left: '16mm', right: '16mm', top: '96mm', bottom: '82mm' }}>
      <DrugTable items={items} headerBg={C.blueDeep} headerColor="#fff" stripe="#F2F8FD" />
    </div>

    <div className="absolute" style={{ left: '16mm', right: '16mm', bottom: '70mm' }}>
      <SignatureLine label="Signature & Cachet" color={C.blue} width={168} />
    </div>

    {/* Footer contact — sits clear of the bottom wedge */}
    <div className="absolute space-y-1" style={{ left: '16mm', bottom: '14mm', fontSize: '7.5pt', color: C.slate }}>
      <div className="flex items-start gap-2">
        <span className="mt-[1px]" style={{ color: C.blue }}><IconPin size={9} /></span>
        <span className="leading-snug">{doctor.address}</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: C.blue }}><IconPhone size={9} /></span><span>{doctor.phone}</span>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: C.blue }}><IconMail size={9} /></span><span>{doctor.email}</span>
      </div>
    </div>
  </A4Page>
);

Object.assign(window, { Template01OrangeCurve, Template02NavyCaduceus, Template03PurpleHeart, Template04PastelProfile, Template05RedEcg, Template06PinkArc, Template07BlueBandClinic, Template08BlueWaveCare, Template09BlueGradientCorner });
window.RX_SHARED = { A4Page, RxPrintStyles, DottedField, RuledField, RxGlyph, DrugList, DrugTable, SignatureLine, PhotoSlot, QrMark, CaduceusMark, IconPin, IconPhone, IconMail, IconGlobe, IconStethoscope };
window.RX_LIST = [
  { id:'orange-curve',   label:'01 · Courbe orange',  accent:'#F0651F', comp:Template01OrangeCurve, photo:true },
  { id:'navy-caduceus',  label:'02 · Caducée marine', accent:'#0B2A5B', comp:Template02NavyCaduceus },
  { id:'purple-heart',   label:'03 · Cœur violet',    accent:'#6B3FD4', comp:Template03PurpleHeart },
  { id:'pastel-profile', label:'04 · Profil pastel',  accent:'#F2A3B3', comp:Template04PastelProfile },
  { id:'red-ecg',        label:'05 · ECG rouge',      accent:'#ED1C24', comp:Template05RedEcg },
  { id:'pink-arc',       label:'06 · Arc rose',       accent:'#EC4B8C', comp:Template06PinkArc, photo:true },
  { id:'blue-band',      label:'07 · Bandeau bleu',   accent:'#1B4F9C', comp:Template07BlueBandClinic },
  { id:'blue-wave',      label:'08 · Vague bleue',    accent:'#1C7BC0', comp:Template08BlueWaveCare, photo:true },
  { id:'blue-corner',    label:'09 · Angle dégradé',  accent:'#1565C0', comp:Template09BlueGradientCorner },
];
