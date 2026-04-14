import React from 'react';
import { Patient, DoctorInfo, LabRequest } from '../types';

interface LabRequestTemplateProps {
    patient: Patient;
    labRequest: LabRequest;
    doctor: DoctorInfo;
    scale?: number;
}

import DocumentShell from './DocumentShell';
import { settingsService } from '../services/settingsService';

const LabRequestTemplate: React.FC<LabRequestTemplateProps> = ({ patient, labRequest, doctor, scale = 1 }) => {
    const appearance = settingsService.getAppearance();

    return (
        <DocumentShell
            id="lab-request-template"
            doctor={doctor}
            appearance={appearance}
            patient={patient}
            date={labRequest.date}
            title="Demande d'Analyses"
            scale={scale}
        >
            <div style={{ padding: '0 80px' }}>
                {/* --- CONTENT --- */}
                <div style={{ fontSize: '48px', fontWeight: 900, marginBottom: '60px', color: '#111827' }}>
                    Prière de faire les analyses suivantes:
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px 80px' }}>
                    {labRequest.tests.map((test, index) => (
                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '30px', fontSize: '42px', fontWeight: 700, color: '#1f2937' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                border: '4px solid #4e84c4',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <span style={{ color: '#4e84c4', fontSize: '30px', fontWeight: 900 }}>✓</span>
                            </div>
                            <span style={{ lineHeight: '1.2' }}>{test}</span>
                        </div>
                    ))}
                </div>

                {labRequest.notes && (
                    <div style={{ marginTop: '100px', fontSize: '38px', fontStyle: 'italic', color: '#4b5563', backgroundColor: '#f9fafb', padding: '40px', borderRadius: '20px', borderLeft: '10px solid #4e84c4' }}>
                        <strong>Note:</strong> {labRequest.notes}
                    </div>
                )}
            </div>
        </DocumentShell>
    );
};

export default LabRequestTemplate;
