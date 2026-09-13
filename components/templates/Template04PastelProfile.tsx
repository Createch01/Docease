import React from 'react';
import { A4Page, RxPrintStyles, DrugList, IconPin, IconPhone, IconMail, RxTemplateProps } from './RxShared';

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

export default Template04PastelProfile;
