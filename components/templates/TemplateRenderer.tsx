import React from 'react';
import { DoctorInfo, PrescriptionAppearance, PrescriptionItem, PatientType } from '../../types';
import { RxTemplateProps, RxDoctor, RxPatient, RxItem } from './RxShared';

import Template01OrangeCurve from './Template01OrangeCurve';
import Template02NavyCaduceus from './Template02NavyCaduceus';
import Template03PurpleHeart from './Template03PurpleHeart';
import Template04PastelProfile from './Template04PastelProfile';
import Template05RedEcg from './Template05RedEcg';
import Template06PinkArc from './Template06PinkArc';
import Template07BlueBandClinic from './Template07BlueBandClinic';
import Template08BlueWaveCare from './Template08BlueWaveCare';
import Template09BlueGradientCorner from './Template09BlueGradientCorner';
import CustomTemplate, { DEFAULT_CUSTOM_TEMPLATE_CONFIG } from './CustomTemplate';

export type PrescriptionTemplateId =
    | 'letterhead_simple'
    | 'pediatric'
    | 'navy_wave'
    | 'purple_heart'
    | 'script_elegant'
    | 'cardio_ecg'
    | 'gyneco_pink'
    | 'teal_hospital'
    | 'corporate_clean'
    | 'custom';

interface Props {
    templateId?: PrescriptionTemplateId;
    id?: string;
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: { name?: string; age?: number; sex?: string; type?: PatientType };
    items: PrescriptionItem[];
    date?: string;
    isPrinting?: boolean;
    scale?: number;
}

// Builds the QR payload for each qrCodeType option exposed in Réglages > Documents.
// Mirrors the four choices shown there: Auto, Contact (vCard), WhatsApp, Lien Web.
const buildQrValue = (doctor: DoctorInfo, appearance: PrescriptionAppearance): string => {
    if (appearance.customQrUrl) return appearance.customQrUrl;

    const digitsOnly = (phone: string) => phone.replace(/[^\d+]/g, '');
    const vCard = () =>
        `BEGIN:VCARD\nVERSION:3.0\nN:${doctor.nameFr}\nFN:Dr ${doctor.nameFr}\n` +
        `TEL:${doctor.phone || ''}\nEMAIL:${doctor.email || ''}\nADR:;;${doctor.addressFr || ''}\nEND:VCARD`;
    const whatsapp = () => doctor.phone ? `https://wa.me/${digitsOnly(doctor.phone)}` : '';
    const url = () => doctor.mapsUrl || appearance.website || '';

    switch (appearance.qrCodeType) {
        case 'VCARD': return vCard();
        case 'WHATSAPP': return whatsapp() || vCard();
        case 'URL': return url() || vCard();
        case 'AUTOMATIC':
        default:
            return url() || whatsapp() || vCard();
    }
};

const TEMPLATES: Record<Exclude<PrescriptionTemplateId, 'custom'>, React.FC<RxTemplateProps>> = {
    letterhead_simple: Template07BlueBandClinic,
    pediatric: Template04PastelProfile,
    navy_wave: Template02NavyCaduceus,
    purple_heart: Template03PurpleHeart,
    script_elegant: Template01OrangeCurve,
    cardio_ecg: Template05RedEcg,
    gyneco_pink: Template06PinkArc,
    teal_hospital: Template08BlueWaveCare,
    corporate_clean: Template09BlueGradientCorner,
};

// Single source of truth for the "Modèles" gallery in Réglages > Documents —
// built from the exact same registry TemplateRenderer uses, so the gallery can
// never drift out of sync with what actually prints.
export const PRESCRIPTION_TEMPLATE_META: { id: Exclude<PrescriptionTemplateId, 'custom'>; label: string; accent: string; component: React.FC<RxTemplateProps> }[] = [
    { id: 'letterhead_simple', label: 'Cabinet classique', accent: '#1B4F9C', component: Template07BlueBandClinic },
    { id: 'pediatric', label: 'Pédiatrie pastel', accent: '#F2A3B3', component: Template04PastelProfile },
    { id: 'navy_wave', label: 'Caducée marine', accent: '#0B2A5B', component: Template02NavyCaduceus },
    { id: 'purple_heart', label: 'Violet élégant', accent: '#6B3FD4', component: Template03PurpleHeart },
    { id: 'script_elegant', label: 'Courbe orange', accent: '#F0651F', component: Template01OrangeCurve },
    { id: 'cardio_ecg', label: 'Cardiologie ECG', accent: '#ED1C24', component: Template05RedEcg },
    { id: 'gyneco_pink', label: 'Gynécologie rose', accent: '#EC4B8C', component: Template06PinkArc },
    { id: 'teal_hospital', label: 'Hôpital vague bleue', accent: '#1C7BC0', component: Template08BlueWaveCare },
    { id: 'corporate_clean', label: 'Angle dégradé', accent: '#1565C0', component: Template09BlueGradientCorner },
];

// Renders a real template component scaled to fit its container exactly —
// live thumbnails that can never go stale, no separate image-generation step.
export const TemplateThumbnail: React.FC<{ component: React.FC<RxTemplateProps>; doctor: DoctorInfo }> = ({ component: Comp, doctor }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [scale, setScale] = React.useState(0.25);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const MM_TO_PX = 96 / 25.4;
        const A4_W = 210 * MM_TO_PX;
        const update = () => { if (el.clientWidth > 0) setScale(el.clientWidth / A4_W); };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const rxDoctor: RxDoctor = {
        name: `Dr ${doctor.nameFr || 'Nom Prénom'}`,
        speciality: doctor.specialtyFr || 'Spécialité médicale',
        phone: doctor.phone || '+212 5 00 00 00 00',
        address: doctor.addressFr || 'Adresse du cabinet',
        email: doctor.email || '',
        registrationNumber: doctor.inpe || doctor.ordreNumber || '',
    };
    const rxPatient: RxPatient = { name: 'Ahmed Benali', age: '42', sex: 'M' };
    const rxItems: RxItem[] = [
        { drugName: 'Amoxicilline', strength: '500 mg', dosage: '1-0-1', duration: '7 jours' },
        { drugName: 'Paramétacol', strength: '1 g', dosage: '1-1-1', duration: '5 jours' },
    ];

    return (
        <div ref={ref} style={{ width: '100%', aspectRatio: '210 / 297', overflow: 'hidden', background: '#fff', position: 'relative' }}>
            <div style={{ width: '210mm', height: '297mm', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <Comp doctor={rxDoctor} patient={rxPatient} date="27/05/2026" items={rxItems} />
            </div>
        </div>
    );
};

const TemplateRenderer: React.FC<Props> = ({ templateId, doctor, patient, items, date, appearance, id, scale }) => {
    const Template = (templateId && templateId !== 'custom' && TEMPLATES[templateId]) || TEMPLATES.letterhead_simple;

    const rxDoctor: RxDoctor = {
        name: `Dr ${doctor.nameFr}`,
        speciality: doctor.specialtyFr || '',
        phone: doctor.phone || '',
        address: doctor.addressFr || '',
        email: doctor.email || '',
        registrationNumber: doctor.inpe || doctor.ordreNumber || '',
    };

    const rxPatient: RxPatient = {
        name: patient.name || '',
        age: patient.age ? String(patient.age) : '',
        sex: patient.sex || (patient.type === 'Child' ? 'Enfant' : 'M/F'),
    };

    const rxItems: RxItem[] = items.map(item => ({
        drugName: item.medicineName,
        strength: item.strength,
        form: item.form,
        packaging: item.packaging,
        dosage: item.dosage,
        duration: item.duration,
        timing: item.timing,
    }));

    const qrCode = appearance.enableQrCode
        ? {
            value: buildQrValue(doctor, appearance) || `Dr ${doctor.nameFr}`,
            size: appearance.qrCodeSize || 120,
            position: appearance.qrCodePosition || 'bottom-right' as const,
        }
        : undefined;

    return (
        <div 
            style={{
                width: scale ? `calc(210mm * ${scale})` : '210mm',
                height: scale ? `calc(297mm * ${scale})` : '297mm',
                overflow: 'hidden',
                backgroundColor: 'white',
            }}
        >
            <div 
                id={id}
                style={{ 
                    transform: scale ? `scale(${scale})` : undefined,
                    transformOrigin: 'top left',
                    width: '210mm',
                    height: '297mm',
                    backgroundColor: 'white',
                    boxSizing: 'border-box'
                }}
            >
                {templateId === 'custom' ? (
                    <CustomTemplate
                        config={appearance.customTemplateConfig || DEFAULT_CUSTOM_TEMPLATE_CONFIG}
                        doctor={doctor}
                        patient={rxPatient}
                        date={date || ''}
                        items={rxItems}
                    />
                ) : (
                    <Template
                        doctor={rxDoctor}
                        patient={rxPatient}
                        date={date || ''}
                        items={rxItems}
                        photoUrl={appearance.logoUrl}
                        accentColor={appearance.primaryColor}
                        qrCode={qrCode}
                    />
                )}
            </div>
        </div>
    );
};

export default TemplateRenderer;
