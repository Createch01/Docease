import React from 'react';
import { A4Page, RxPrintStyles, DottedField, DrugList, IconPin, IconPhone, IconMail, IconGlobe, PhotoSlot, RxTemplateProps } from './RxShared';

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

export default Template01OrangeCurve;
