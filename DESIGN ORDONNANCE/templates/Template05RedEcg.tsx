import React from 'react';
import { A4Page, RxPrintStyles, DottedField, DrugList, RxTemplateProps } from './RxShared';

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

export default Template05RedEcg;
