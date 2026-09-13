import React from 'react';
import { A4Page, RxPrintStyles, RuledField, DrugList, PhotoSlot, SignatureLine, IconPin, IconPhone, IconMail, RxTemplateProps } from './RxShared';

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

export default Template08BlueWaveCare;
