import React from 'react';
import { A4Page, RxPrintStyles, RuledField, DrugList, CaduceusMark, SignatureLine, RxTemplateProps } from './RxShared';

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

export default Template02NavyCaduceus;
