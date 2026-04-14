import React from 'react';
import { DoctorInfo, PrescriptionAppearance, PrescriptionItem, PatientType, Patient } from '../types';
import { Phone, Mail, FlaskConical, Pill } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface CombinedConsultationTemplateProps {
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: Partial<Patient>;
    items: PrescriptionItem[];
    tests: string[] | { category: string; items: string[] }[];
    date?: string;
    notes?: string;
    isPrinting?: boolean;
    scale?: number;
}

import DocumentShell from './DocumentShell';

const CombinedConsultationTemplate: React.FC<CombinedConsultationTemplateProps> = ({
    doctor,
    appearance,
    patient,
    items,
    tests,
    date = new Date().toLocaleDateString('fr-FR'),
    notes,
    isPrinting = false,
    scale = 1
}) => {
    // Helper to group tests if they aren't already grouped
    const groupedTests = Array.isArray(tests) && tests.length > 0 && typeof tests[0] === 'object'
        ? (tests as { category: string; items: string[] }[])
        : [{ category: "Analyses demandées", items: tests as string[] }];

    return (
        <DocumentShell
            id="combined-template"
            doctor={doctor}
            appearance={appearance}
            patient={patient}
            date={date}
            title="Consultation"
            scale={scale}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '60px' }}>
                {/* 1. MEDICATIONS SECTION */}
                {items.length > 0 && (
                    <div style={{ border: '4px solid #f1f5f9', borderRadius: '40px', padding: '60px', backgroundColor: '#fafbfc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '50px', borderBottom: '4px solid #4e84c4', paddingBottom: '20px', width: 'fit-content' }}>
                            <Pill size={48} className="text-emerald-600" />
                            <h3 style={{ fontSize: '56px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>ORDONNANCE</h3>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '50px' }}>
                            {items.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start' }}>
                                    <div style={{ width: '100px', fontSize: '44px', fontWeight: 900, color: '#94a3b8' }}>{idx + 1}/</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '48px', fontWeight: 800, textTransform: 'uppercase', color: '#111827', display: 'flex', alignItems: 'center', gap: '30px' }}>
                                            {item.medicineName}
                                            {(item.strength || item.form) && <span style={{ fontSize: '32px', color: '#64748b', backgroundColor: '#edf2f7', padding: '8px 25px', borderRadius: '12px' }}>{item.strength} {item.form}</span>}
                                        </div>
                                        <div style={{ fontSize: '38px', color: '#475569', fontWeight: 600, marginTop: '10px' }}>
                                            {item.dosage} {item.timing && item.timing !== 'Indifférent' && <span>{item.timing}</span>} {item.duration && `pendant ${item.duration}`}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. LAB TESTS SECTION */}
                {(tests.length > 0 || (Array.isArray(tests) && tests.length > 0)) && (
                    <div style={{ border: '4px solid #f1f5f9', borderRadius: '40px', padding: '60px', backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '50px', borderBottom: '4px solid #4e84c4', paddingBottom: '20px', width: 'fit-content' }}>
                            <FlaskConical size={48} className="text-blue-600" />
                            <h3 style={{ fontSize: '56px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>BILAN BIOLOGIQUE</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '30px' }}>
                            {groupedTests.map((group, gIdx) => (
                                <div key={gIdx} style={{ breakInside: 'avoid' }}>
                                    {group.category !== "Analyses demandées" && <h4 style={{ fontSize: '34px', fontWeight: 900, color: '#4e84c4', marginBottom: '15px', textTransform: 'uppercase' }}>{group.category}</h4>}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        {group.items.map((item, iIdx) => (
                                            <div key={iIdx} style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                                <div style={{ width: '32px', height: '32px', border: '3px solid #cbd5e1', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '24px', fontWeight: 900, color: '#4e84c4' }}>✓</span>
                                                </div>
                                                <span style={{ fontSize: '34px', fontWeight: 700, color: '#334155' }}>{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {notes && (
                    <div style={{ fontSize: '38px', fontStyle: 'italic', color: '#64748b', marginTop: '20px' }}>
                        <strong>Note:</strong> {notes}
                    </div>
                )}
            </div>
        </DocumentShell>
    );
};

export default CombinedConsultationTemplate;
