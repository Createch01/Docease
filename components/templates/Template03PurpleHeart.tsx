import React from 'react';
import { A4Page, RxPrintStyles, RuledField, DrugList, QrMark, SignatureLine, IconPin, IconPhone, IconMail, RxTemplateProps } from './RxShared';

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

export default Template03PurpleHeart;
