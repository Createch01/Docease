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
