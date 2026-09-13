import React from 'react';
import { A4Page, RxPrintStyles, DottedField, DrugList, IconPin, IconPhone, IconMail, IconGlobe, RxTemplateProps } from './RxShared';

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

export default Template07BlueBandClinic;
