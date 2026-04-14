import React from 'react';
import { DoctorInfo, PrescriptionAppearance, Patient } from '../types';
import DocumentShell from './DocumentShell';

interface AnalysisPrescriptionTemplateProps {
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: Partial<Patient>;
    tests: string[] | { category: string; items: string[] }[];
    date?: string;
    notes?: string;
    isPrinting?: boolean;
    scale?: number;
}

const AnalysisPrescriptionTemplate: React.FC<AnalysisPrescriptionTemplateProps> = ({
    doctor,
    appearance,
    patient,
    tests,
    date = new Date().toLocaleDateString('fr-FR'),
    notes,
    isPrinting = false,
    scale = 1
}) => {
    // Generate QR Content
    const qrValue = `Dr ${doctor.nameFr}\nAnalyse pour: ${patient.name || 'N/A'}\nDate: ${date}`;

    return (
        <DocumentShell
            id="analysis-template"
            doctor={doctor}
            appearance={appearance}
            patient={{
                name: patient.name,
                age: patient.age,
                sex: patient.sex as 'M' | 'F'
            }}
            date={date}
            title="Bilan Biologique"
            scale={scale}
            qrValue={qrValue}
        >
            <div style={{ padding: '0 80px' }}>
                {/* Content Message */}
                <div style={{
                    fontSize: '44px',
                    fontWeight: 700,
                    color: '#1e293b',
                    fontStyle: 'italic',
                    opacity: 0.8,
                    marginBottom: '60px'
                }}>
                    Prière de pratiquer les examens biologiques suivants :
                </div>

                {/* Tests List - Dynamic Layout - CLEAN GRID */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '40px 60px',
                        alignContent: 'start'
                    }}
                >
                    {Array.isArray(tests) && tests.length > 0 && typeof tests[0] === 'string' ? (
                        (tests as string[]).map((test, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '25px',
                                breakInside: 'avoid'
                            }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: '4px solid #1e293b',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    <span style={{ fontSize: '30px', fontWeight: 900, color: '#4e84c4' }}>✓</span>
                                </div>
                                <span style={{
                                    fontSize: '38px',
                                    fontWeight: 700,
                                    color: '#1e293b',
                                    lineHeight: '1.2',
                                    wordBreak: 'break-word',
                                    display: 'block'
                                }}>
                                    {test}
                                </span>
                            </div>
                        ))
                    ) : (
                        (tests as { category: string; items: string[] }[]).map((group, gIdx) => (
                            <div key={gIdx} style={{
                                breakInside: 'avoid',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '25px',
                                backgroundColor: '#f8fafc',
                                padding: '30px',
                                borderRadius: '24px',
                                border: '2px solid #e2e8f0'
                            }}>
                                <h3 style={{
                                    fontSize: '34px',
                                    fontWeight: 900,
                                    color: '#4e84c4',
                                    textTransform: 'uppercase',
                                    borderBottom: '4px solid #4e84c4',
                                    paddingBottom: '10px',
                                    marginBottom: '10px'
                                }}>
                                    {group.category}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {group.items.map((item, iIdx) => (
                                        <div key={iIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                border: '3px solid #cbd5e1',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                                marginTop: '6px'
                                            }}>
                                                <span style={{ fontSize: '24px', fontWeight: 900, color: '#4e84c4' }}>✓</span>
                                            </div>
                                            <span style={{
                                                fontSize: '32px',
                                                fontWeight: 700,
                                                color: '#334155',
                                                lineHeight: '1.2',
                                                wordBreak: 'break-word'
                                            }}>
                                                {item}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {notes && (
                    <div style={{ marginTop: '100px', fontSize: '38px', fontStyle: 'italic', color: '#4b5563' }}>
                        <strong style={{ textTransform: 'uppercase' }}>Note :</strong> {notes}
                    </div>
                )}
            </div>
        </DocumentShell>
    );
};

export default AnalysisPrescriptionTemplate;
