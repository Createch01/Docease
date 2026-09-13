/* Ordonnance — pixel-close render of the reference screenshot, fully driven
   by `appearance`. Props: { doctor, patient, date, items, appearance, mode }
   mode: 'preview' (screen, boxed) | 'print' (bare, for @media print).

   Exports (window): OrdonnanceTemplate, OrdonnanceWatermark, OrdonnanceQr
*/
(() => {
const PAGE = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };

function hexToRgba(hex, alpha) {
  const h = (hex || '#000000').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* Watermark reuses the header logo image. Opacity is capped at print time by
   a CSS custom property + min() so it can never come out darker than 8%
   even if the editor slider is set higher. */
function OrdonnanceWatermark({ show, opacity, size, logoUrl }) {
  if (!show) return null;
  return (
    <div className="rx-ord-watermark absolute inset-0 flex items-center justify-center pointer-events-none"
         style={{ '--wm-opacity': opacity, opacity, zIndex: 0 }}>
      {logoUrl ? (
        <img src={logoUrl} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
      ) : (
        <div className="ed-noprint flex flex-col items-center justify-center gap-2"
             style={{ width: size, height: size, border: '1px dashed #CBD5E0', borderRadius: 12, color: '#94A3B8' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.8" /><path d="m21 15-5-5L5 21" />
          </svg>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em' }}>logo requis</span>
        </div>
      )}
    </div>
  );
}

/* deterministic decorative QR — no data encoded, purely visual */
function OrdonnanceQr({ size = 70, seed = 'docease', color = '#0B2A5B' }) {
  const n = 19;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = (i) => { let x = (h ^ Math.imul(i + 1, 2654435761)) >>> 0; x ^= x >>> 15; return ((x >>> 0) % 100) / 100; };
  const finder = (r, c) => [[0, 0], [0, n - 6], [n - 6, 0]].some(([fr, fc]) => r >= fr && r < fr + 6 && c >= fc && c < fc + 6);
  const cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (finder(r, c)) continue;
    if (rnd(r * n + c) > 0.52) cells.push(<rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill={color} />);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      {cells}
      {[[0, 0], [0, n - 6], [n - 6, 0]].map(([r, c], i) => (
        <g key={i}>
          <rect x={c} y={r} width="6" height="6" fill={color} />
          <rect x={c + 1} y={r + 1} width="4" height="4" fill="#fff" />
          <rect x={c + 2} y={r + 2} width="2" height="2" fill={color} />
        </g>
      ))}
    </svg>
  );
}

function OrdonnanceTemplate({ doctor = {}, patient = {}, date = '', items = [], appearance, mode = 'preview' }) {
  const A = appearance;
  const page = PAGE[A.paperSize] || PAGE.A4;
  const font = window.RX_ORD_FONTS[A.fontFamily] || window.RX_ORD_FONTS.serif;
  const dotStyle = A.patientLine.style === 'dashed' ? 'dashed' : A.patientLine.style === 'solid' ? 'solid' : 'dotted';

  const Logo = () => (
    A.header.logo.show ? (
      doctor.logoUrl || A.header.logo.url ? (
        <img src={doctor.logoUrl || A.header.logo.url} alt=""
             style={{ width: A.header.logo.size, height: A.header.logo.size, objectFit: 'contain' }} />
      ) : (
        <div className="ed-noprint flex flex-col items-center justify-center gap-1"
             style={{ width: A.header.logo.size, height: A.header.logo.size, border: '1px dashed #CBD5E0',
                      borderRadius: 8, color: '#94A3B8', fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.8" /><path d="m21 15-5-5L5 21" />
          </svg>
          logo
        </div>
      )
    ) : null
  );

  const frBlock = (
    <div style={{ textAlign: A.header.name.align, flex: 1 }}>
      <div style={{ fontSize: A.header.name.fontSize, color: A.header.name.color, fontWeight: 700, lineHeight: 1.2 }}>
        Dr. {doctor.name}
      </div>
      {A.header.speciality.show && (
        <>
          <div style={{ fontSize: A.header.speciality.fontSize, color: '#334155', marginTop: 3, maxWidth: 260 }}>
            {doctor.speciality}
          </div>
          {doctor.diplomasFr && (
            <div style={{ fontSize: A.header.speciality.fontSize - 1.5, color: '#64748B', marginTop: 2, whiteSpace: 'pre-line', maxWidth: 260 }}>
              {doctor.diplomasFr}
            </div>
          )}
        </>
      )}
    </div>
  );

  const arBlock = A.header.arabic.show ? (
    <div dir="rtl" style={{ textAlign: 'right', flex: 1 }}>
      <div style={{ fontSize: A.header.arabic.nameFontSize, color: A.header.name.color, fontWeight: 700, fontFamily: window.RX_ORD_FONTS.arabic, lineHeight: 1.3 }}>
        الدكتور {doctor.nameAr}
      </div>
      <div style={{ fontSize: A.header.arabic.specialityFontSize, color: '#334155', marginTop: 3, fontFamily: window.RX_ORD_FONTS.arabic, maxWidth: 260, marginLeft: 'auto' }}>
        {doctor.specialityAr}
      </div>
      {doctor.diplomasAr && (
        <div style={{ fontSize: A.header.arabic.specialityFontSize - 1, color: '#64748B', marginTop: 2, fontFamily: window.RX_ORD_FONTS.arabic, whiteSpace: 'pre-line', maxWidth: 260, marginLeft: 'auto' }}>
          {doctor.diplomasAr}
        </div>
      )}
    </div>
  ) : null;

  const logoPos = A.header.logo.position;

  return (
    <div className="rx-ord-page relative bg-white overflow-hidden"
         style={{ width: `${page.w}mm`, height: `${page.h}mm`, fontFamily: font, color: '#1A202C' }}>
      <OrdonnanceWatermark show={A.watermark.show} opacity={A.watermark.opacity} size={A.watermark.size}
                           logoUrl={doctor.logoUrl || A.header.logo.url} />

      <div className="relative" style={{ zIndex: 1, background: hexToRgba(A.header.bg, A.header.bgOpacity) }}>
        <div className="flex items-start" style={{ padding: '9mm 10mm 4mm', gap: '4mm' }}>
          {logoPos === 'left' && <Logo />}
          {frBlock}
          {logoPos === 'center' && <Logo />}
          {arBlock}
          {logoPos === 'right' && <Logo />}
        </div>
        <div style={{ height: 2, background: A.badge.bg, margin: '0 10mm' }} />
      </div>

      <div className="relative flex items-center justify-center" style={{ zIndex: 1, marginTop: '6mm' }}>
        <span style={{
          background: A.badge.bg, color: A.badge.color, fontWeight: 700, letterSpacing: '2px',
          fontSize: A.badge.fontSize, borderRadius: A.badge.radius,
          padding: `${A.badge.paddingY}px ${A.badge.paddingX}px`,
        }}>
          {A.badge.text}
        </span>
      </div>

      <div className="relative flex justify-end" style={{ zIndex: 1, padding: '3mm 10mm 0' }}>
        <span style={{ fontSize: 9.5, color: '#334155' }}>
          Le : <strong>{date}</strong>
        </span>
      </div>

      <div className="relative flex items-baseline" style={{ zIndex: 1, padding: '5mm 10mm 0', gap: 6, fontSize: 9.5 }}>
        <span>M. </span>
        <span style={{ flex: 1, borderBottom: `1px ${dotStyle} #94A3B8`, minHeight: 12, paddingBottom: 1 }}>
          {patient.name}
        </span>
        {(patient.age || patient.sex) && (
          <>
            <span style={{ marginLeft: 8 }}>Âge : {patient.age}</span>
            <span style={{ marginLeft: 8 }}>Sexe : {patient.sex}</span>
          </>
        )}
      </div>

      <div className="relative" style={{ zIndex: 1, padding: '7mm 10mm', minHeight: '90mm' }}>
        <ol className="space-y-2.5">
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
                </div>
                {(it.dosage || it.duration) && (
                  <div className="flex flex-wrap gap-x-4" style={{ fontSize: 9, color: '#475569' }}>
                    {it.dosage && <span>{it.dosage}</span>}
                    {it.duration && <span>pendant {it.duration}</span>}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {A.signature.show && (
        <div className="absolute text-center"
             style={{ zIndex: 1, [A.signature.position === 'left' ? 'left' : 'right']: '10mm',
                      bottom: `${(A.footer.bg ? 28 : 8)}mm`, width: A.signature.size }}>
          {A.signature.url ? (
            <img src={A.signature.url} alt="" style={{ width: '100%', height: 'auto', margin: '0 auto 4px' }} />
          ) : null}
          <div style={{ borderBottom: '1px solid #CBD5E0', marginBottom: 4 }} />
          <span style={{ fontSize: 7.5, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {A.signature.label}
          </span>
        </div>
      )}

      <div className="absolute left-0 right-0 bottom-0 flex items-center"
           style={{ zIndex: 1, background: A.footer.bg, color: A.footer.textColor, padding: '4mm 10mm', gap: '4mm', minHeight: '22mm' }}>
        {A.qr.show && (
          <div className="flex items-center justify-center bg-white rounded shrink-0" style={{ padding: 4 }}>
            <OrdonnanceQr size={A.qr.size} seed={A.qr.value || doctor.addressFr || doctor.name} color={A.badge.bg} />
          </div>
        )}
        <div className="flex-1">
          {A.footer.arabic.show && (
            <div dir="rtl" style={{ fontSize: 8.5, fontWeight: 600, fontFamily: window.RX_ORD_FONTS.arabic, textAlign: 'center', marginBottom: 2 }}>
              {doctor.addressAr}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-x-4" style={{ fontSize: 8, textAlign: 'center' }}>
            {A.footer.show.address && (
              <span className="flex items-center gap-1">
                {A.footer.showIcons && <IconMini name="pin" />}
                {doctor.addressFr}
              </span>
            )}
            {A.footer.show.phone && (
              <span className="flex items-center gap-1">
                {A.footer.showIcons && <IconMini name="phone" />}
                {doctor.phone}{doctor.gsm ? ` / ${doctor.gsm}` : ''}
              </span>
            )}
            {A.footer.show.email && (
              <span className="flex items-center gap-1">
                {A.footer.showIcons && <IconMini name="mail" />}
                {doctor.email}
              </span>
            )}
            {A.footer.show.fax && doctor.fax && (
              <span className="flex items-center gap-1">
                {A.footer.showIcons && <IconMini name="fax" />}
                {doctor.fax}
              </span>
            )}
          </div>
          <div style={{ fontSize: 6.5, opacity: 0.7, textAlign: 'center', marginTop: 2, textTransform: 'uppercase', letterSpacing: '1px' }}>
            INPE {doctor.inpe} · ICE {doctor.ice} · IF {doctor.taxId}
          </div>
        </div>
        {A.qr.show && <div style={{ width: A.qr.size + 8, flexShrink: 0 }} />}
      </div>
    </div>
  );
}

function IconMini({ name }) {
  const d = {
    pin: 'M12 21.6c3.9-5.1 6.4-8.7 6.4-11.7A6.4 6.4 0 0 0 5.6 9.9c0 3 2.5 6.6 6.4 11.7z',
    phone: 'M7.3 3.1c.8-.7 2-.5 2.6.4l2 3.1c.5.8.3 1.8-.4 2.4l-1.3 1c-.3.2-.4.6-.3 1 .8 2 2.6 3.8 4.6 4.6.4.1.8 0 1-.3l1-1.3c.6-.7 1.6-.9 2.4-.4l3.1 2c.9.6 1.1 1.8.4 2.6l-1.5 1.6c-1.1 1.2-2.9 1.6-4.4 1C11.9 19.4 7 14.5 4.7 8.6c-.6-1.5-.2-3.3 1-4.4z',
    mail: 'M2.9 5.8 12 13l9.1-7.2',
    fax: 'M7 3h10v5.4H7z',
  };
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d[name]} />
    </svg>
  );
}

Object.assign(window, { OrdonnanceTemplate, OrdonnanceWatermark, OrdonnanceQr });

})();
