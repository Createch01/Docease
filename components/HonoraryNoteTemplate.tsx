
import React from 'react';
import { DoctorInfo, HonoraryNote } from '../types';

interface HonoraryNoteTemplateProps {
    doctor: DoctorInfo;
    note: HonoraryNote;
    scale?: number;
}

import DocumentShell from './DocumentShell';
import { settingsService } from '../services/settingsService';

const HonoraryNoteTemplate: React.FC<HonoraryNoteTemplateProps> = ({ doctor, note, scale = 1 }) => {
    const appearance = settingsService.getAppearance();

    return (
        <DocumentShell
            id="honorary-note-template"
            doctor={doctor}
            appearance={appearance}
            patient={{
                name: note.patientName
            }}
            date={note.date}
            title="Note d'Honoraire"
            scale={scale}
        >
            <div style={{ padding: '0 80px' }}>
                {/* Nature de prestation (Listed Professional Table) */}
                <div style={{ marginBottom: '60px' }}>
                    <h3 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '50px', color: '#1e293b', textTransform: 'uppercase', borderBottom: '6px solid #4e84c4', paddingBottom: '20px', width: 'fit-content' }}>
                        Détails des Prestations:
                    </h3>

                    <div style={{ borderRadius: '30px', overflow: 'hidden', border: '2px solid #f1f5f9' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', backgroundColor: '#f8fafc', padding: '30px 50px', borderBottom: '2px solid #f1f5f9' }}>
                            <span style={{ fontSize: '30px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Description</span>
                            <span style={{ fontSize: '30px', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Montant</span>
                        </div>
                        {note.services.filter(s => s.checked).map((service, index) => (
                            <div key={index} style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 200px',
                                padding: '35px 50px',
                                borderBottom: index === note.services.filter(s => s.checked).length - 1 ? 'none' : '2px solid #f1f5f9',
                                backgroundColor: index % 2 === 0 ? 'white' : '#fafbfc'
                            }}>
                                <span style={{ fontSize: '38px', fontWeight: 700, color: '#334155' }}>{service.name}</span>
                                <span style={{ fontSize: '38px', fontWeight: 800, color: '#1e293b', textAlign: 'right' }}>{service.price} DH</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Total Section (Premium Stamp View) */}
                <div style={{
                    marginTop: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end'
                }}>
                    <div style={{
                        width: '100%',
                        backgroundColor: '#1e293b',
                        borderRadius: '40px',
                        padding: '60px 80px',
                        color: 'white',
                        position: 'relative',
                        boxShadow: '0 30px 60px -12px rgba(30, 41, 59, 0.25)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                            <span style={{ fontSize: '36px', fontWeight: 800, opacity: 0.7, textTransform: 'uppercase' }}>Total Net à Payer:</span>
                            <span style={{ fontSize: '84px', fontWeight: 900 }}>{note.totalAmount} DH</span>
                        </div>
                        <div style={{ borderTop: '2px solid rgba(255,255,255,0.1)', paddingTop: '30px', fontSize: '38px', fontWeight: 700, fontStyle: 'italic', opacity: 0.9 }}>
                            Arrêté la présente facture à la somme de: <br />
                            <span style={{ color: '#60a5fa', textTransform: 'uppercase', marginTop: '10px', display: 'block' }}>{note.totalInWords}</span>
                        </div>
                    </div>
                </div>
            </div>
        </DocumentShell>
    );
};

export default HonoraryNoteTemplate;
