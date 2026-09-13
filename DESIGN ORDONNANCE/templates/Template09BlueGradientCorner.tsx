import React from 'react';
import { A4Page, RxPrintStyles, RuledField, DrugTable, RxGlyph, SignatureLine, IconPin, IconPhone, IconMail, RxTemplateProps } from './RxShared';

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

export default Template09BlueGradientCorner;
