import React from 'react';
import { DoctorInfo, PrescriptionAppearance, PrescriptionItem, PatientType } from '../types';
import { Barcode, Mail, Phone, MapPin } from 'lucide-react';

interface ExactPrescriptionTemplateProps {
    id?: string;
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: {
        name?: string;
        age?: number;
        type?: PatientType;
    };
    items: PrescriptionItem[];
    date?: string;
    isPrinting?: boolean;
    scale?: number;
    variant?: 'classic_moroccan' | 'modern_wave' | 'minimal_clean' | 'cardio_pro';
}

import DocumentShell from './DocumentShell';

const ExactPrescriptionTemplate: React.FC<ExactPrescriptionTemplateProps> = ({
    id = "prescription-template",
    doctor,
    appearance,
    patient,
    items,
    date = new Date().toLocaleDateString('fr-FR'),
    isPrinting = false,
    scale = 1,
    variant = 'classic_moroccan'
}) => {
    const contentPadding = appearance.contentVerticalPadding || 40;
    const numberColor = variant === 'minimal_clean' ? '#9ca3af' : (appearance.secondaryColor || '#4b5563');
    const accentBorderColor = variant === 'cardio_pro' ? (appearance.primaryColor || '#dc2626')
        : variant === 'minimal_clean' ? '#111827'
        : (appearance.primaryColor || '#10b981');

    return (
        <DocumentShell
            id={id}
            doctor={doctor}
            appearance={appearance}
            patient={patient}
            date={date}
            title="Ordonnance"
            scale={scale}
            variant={variant}
        >
            <div
                style={{
                    paddingTop: `${contentPadding}px`
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '80px' }}>
                    {items.map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', gap: '40px' }}>
                            <div style={{ fontSize: '48px', fontWeight: 900, color: numberColor, opacity: 0.3 }}>{idx + 1}.</div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '56px',
                                    fontWeight: 900,
                                    textTransform: 'uppercase',
                                    marginBottom: '15px',
                                    color: '#000000',
                                    paddingLeft: '30px',
                                    borderLeft: `12px solid ${accentBorderColor}`
                                }}>
                                    {item.medicineName}
                                    {item.strength && <span style={{ fontSize: '44px', opacity: 0.8, marginLeft: '15px', textTransform: 'none' }}>({item.strength})</span>}
                                    {item.packaging && <span style={{ fontSize: '40px', opacity: 0.8, marginLeft: '15px', textTransform: 'none' }}>{item.packaging}</span>}
                                </div>
                                <div style={{
                                    fontSize: '46px',
                                    color: '#1f2937',
                                    lineHeight: '1.4',
                                    paddingLeft: '72px',
                                    fontWeight: 700
                                }}>
                                    {item.dosage}
                                    {item.timing && item.timing !== 'Indifférent' && <span style={{ marginLeft: '15px', opacity: 0.9 }}>({item.timing})</span>}
                                    {item.duration && <span style={{ marginLeft: '15px', color: '#dc2626' }}>pendant {item.duration}</span>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </DocumentShell>
    );
};

export default ExactPrescriptionTemplate;
