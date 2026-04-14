
import React from 'react';
import { DoctorInfo, MedicalCertificate, PrescriptionAppearance } from '../types';
import { Mail, Phone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface MedicalCertificateTemplateProps {
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    certificate: MedicalCertificate;
    isPrinting?: boolean;
    scale?: number;
}

import DocumentShell from './DocumentShell';

const MedicalCertificateTemplate: React.FC<MedicalCertificateTemplateProps> = ({
    doctor,
    appearance,
    certificate,
    isPrinting = false,
    scale = 1
}) => {
    const secondaryColor = appearance.secondaryColor || '#4b5563';

    return (
        <DocumentShell
            id="certificate-template"
            doctor={doctor}
            appearance={appearance}
            patient={{
                name: certificate.patientName
            }}
            date={certificate.date}
            title="Certificat Médical"
            scale={scale}
        >
            <div
                style={{
                    fontSize: '52px',
                    lineHeight: '1.8',
                    color: '#1e293b',
                    whiteSpace: 'pre-line',
                    padding: '0 80px'
                }}
            >
                <div style={{ marginBottom: '60px' }}>
                    Je soussigné, <span style={{ fontWeight: 900 }}>{doctor.nameFr}</span>, certifie après avoir examiné le patient :
                </div>

                <div style={{
                    backgroundColor: '#f8fafc',
                    padding: '60px',
                    borderRadius: '40px',
                    border: '2px solid #e2e8f0',
                    marginBottom: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}>
                    <div style={{ display: 'flex', gap: '30px' }}>
                        <span style={{ fontWeight: 700, color: '#64748b', minWidth: '400px' }}>Nom & Prénom :</span>
                        <span style={{ fontWeight: 900, color: '#1e293b', textTransform: 'uppercase' }}>{certificate.patientName}</span>
                    </div>
                </div>

                <div style={{ fontSize: '56px', fontWeight: 500, color: '#334155', minHeight: '600px' }}>
                    {certificate.content}
                </div>

                {certificate.type === 'REPOS' && certificate.duration && (
                    <div style={{ marginTop: '80px', fontWeight: 800, color: '#e11d48', fontSize: '60px', textAlign: 'center' }}>
                        Repos médical de {certificate.duration} jours
                        {certificate.startDate && <div style={{ fontSize: '38px', color: '#94a3b8', marginTop: '10px' }}>À compter du : {certificate.startDate}</div>}
                    </div>
                )}
            </div>
        </DocumentShell>
    );
};

export default MedicalCertificateTemplate;
