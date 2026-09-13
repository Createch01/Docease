import React from 'react';
import { A4Page, RxPrintStyles, DottedField, DrugList, PhotoSlot, RxTemplateProps } from './RxShared';

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

export default Template06PinkArc;
