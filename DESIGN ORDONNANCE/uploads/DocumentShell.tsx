import React from 'react';
import { DoctorInfo, PrescriptionAppearance } from '../types';
import { Phone, Mail, MapPin } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface DocumentShellProps {
    id?: string;
    doctor: DoctorInfo;
    appearance: PrescriptionAppearance;
    patient: {
        name?: string;
        age?: number;
        sex?: 'M' | 'F';
        type?: string;
    };
    date: string;
    title: string;
    children: React.ReactNode;
    showQr?: boolean;
    qrValue?: string;
    scale?: number;
}

const DocumentShell: React.FC<DocumentShellProps> = ({
    id = "document-template",
    doctor,
    appearance,
    patient,
    date,
    title,
    children,
    showQr: propShowQr,
    qrValue: propQrValue,
    scale = 1
}) => {
    const fontClass = appearance.fontFamily === 'serif' ? 'font-serif' : appearance.fontFamily === 'mono' ? 'font-mono' : 'font-sans';
    const primaryColor = appearance.primaryColor || '#000000';
    const secondaryColor = appearance.secondaryColor || '#4b5563';
    const logoPosition = appearance.logoPosition || 'center';
    const layoutPreset = appearance.layoutPreset || 'classic';
    const footerVerticalOffset = appearance.footerVerticalOffset || 0;
    const showQr = propShowQr !== undefined ? propShowQr : (appearance.enableQrCode !== undefined ? appearance.enableQrCode : false);
    const qrSize = appearance.qrCodeSize || 180;

    // Default QR value if not provided
    const qrValue = propQrValue || `Dr ${doctor.nameFr}\nPatient: ${patient.name || 'N/A'}\nDate: ${date}\n${title}`;

    return (
        <>
            <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                    body * { visibility: hidden !important; border: none !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
                    .document-print-container, .document-print-container * { visibility: visible !important; }
                    .document-print-container {
                        position: fixed !important;
                        left: 0 !important;
                        top: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        background: white !important;
                        overflow: visible !important;
                        display: block !important;
                    }
                    .high-res-print {
                        transform: scale(0.32) !important;
                        transform-origin: top left !important;
                        width: 2480px !important;
                        height: 3508px !important;
                    }
                    @page { size: A4; margin: 0; }
                }
                `
            }} />
            <div
                className="document-print-container"
                style={{
                    width: scale === 1 ? '2480px' : `${2480 * scale}px`,
                    height: scale === 1 ? '3508px' : `${3508 * scale}px`,
                    overflow: 'hidden',
                    backgroundColor: 'white'
                }}
            >
                <div
                    id={id}
                    className={`high-res-print relative bg-white text-black ${fontClass}`}
                    style={{
                        width: '2480px',
                        height: '3508px',
                        position: 'relative',
                        boxSizing: 'border-box',
                        backgroundColor: 'white',
                        transform: scale !== 1 ? `scale(${scale})` : undefined,
                        transformOrigin: 'top left'
                    }}
                >
                    {/* 1. HEADER SECTION */}
                    <div style={{ position: 'absolute', left: '160px', top: '140px', width: '2160px', height: '520px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        {logoPosition === 'left' ? (
                            <>
                                <div style={{ width: '400px', height: '520px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                                    {appearance.logoUrl && (
                                        <img src={appearance.logoUrl} style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', transform: `scale(${appearance.logoScale})` }} />
                                    )}
                                </div>
                                <div style={{ width: '840px', textAlign: 'left' }}>
                                    <h1 style={{ fontSize: '58px', fontWeight: 900, marginBottom: '16px', color: primaryColor, textTransform: 'uppercase' }}>{doctor.nameFr}</h1>
                                    <p style={{ fontSize: '40px', fontWeight: 700, color: secondaryColor }}>{doctor.specialtyFr}</p>
                                    <div style={{ fontSize: '28px', color: '#6b7280', marginTop: '12px', whiteSpace: 'pre-line' }}>{doctor.diplomasFr}</div>
                                </div>
                                <div style={{ width: '840px', textAlign: 'right' }} dir="rtl">
                                    <h1 className="font-arabic" style={{ fontSize: '58px', fontWeight: 900, marginBottom: '16px', color: primaryColor }}>{doctor.nameAr}</h1>
                                    <p className="font-arabic" style={{ fontSize: '40px', fontWeight: 700, color: secondaryColor }}>{doctor.specialtyAr}</p>
                                    <div className="font-arabic" style={{ fontSize: '28px', color: '#6b7280', marginTop: '12px', whiteSpace: 'pre-line' }}>{doctor.diplomasAr}</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ width: '800px', textAlign: 'left' }}>
                                    <h1 style={{ fontSize: '58px', fontWeight: 900, color: primaryColor }}>{doctor.nameFr}</h1>
                                    <p style={{ fontSize: '40px', fontWeight: 700, color: secondaryColor }}>{doctor.specialtyFr}</p>
                                    <div style={{ fontSize: '28px', color: '#6b7280', marginTop: '12px', whiteSpace: 'pre-line' }}>{doctor.diplomasFr}</div>
                                </div>
                                <div style={{ width: '480px', display: 'flex', justifyContent: 'center' }}>
                                    {appearance.logoUrl && (
                                        <img src={appearance.logoUrl} style={{ width: '100%', maxHeight: '480px', objectFit: 'contain', transform: `scale(${appearance.logoScale})` }} />
                                    )}
                                </div>
                                <div style={{ width: '800px', textAlign: 'right' }} dir="rtl">
                                    <h1 className="font-arabic" style={{ fontSize: '58px', fontWeight: 900, color: primaryColor }}>{doctor.nameAr}</h1>
                                    <p className="font-arabic" style={{ fontSize: '40px', fontWeight: 700, color: secondaryColor }}>{doctor.specialtyAr}</p>
                                    <div className="font-arabic" style={{ fontSize: '28px', color: '#6b7280', marginTop: '12px', whiteSpace: 'pre-line' }}>{doctor.diplomasAr}</div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ position: 'absolute', left: '160px', top: '680px', width: '2160px', height: '4px', backgroundColor: primaryColor, opacity: 0.1 }} />

                    {/* 2. TITLE BLOCK */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '750px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#4e84c4',
                            color: 'white',
                            padding: '35px 120px',
                            borderRadius: '200px',
                            fontWeight: 900,
                            fontSize: '84px',
                            textTransform: 'uppercase',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
                            letterSpacing: '4px'
                        }}
                    >
                        {title}
                    </div>

                    {/* 3. DATE SECTION */}
                    <div style={{ position: 'absolute', right: '160px', top: '950px', fontSize: '44px', color: '#4b5563' }}>
                        Le : <span style={{ fontWeight: 800, color: '#111827', borderBottom: '6px dotted #cbd5e1', paddingBottom: '4px' }}>{date}</span>
                    </div>

                    {/* 4. PATIENT INFORMATION */}
                    <div style={{ position: 'absolute', left: '160px', top: '1100px', width: '2160px', textAlign: 'center' }}>
                        <h2 style={{ fontSize: '72px', fontWeight: 900, color: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px' }}>
                            <span style={{ color: secondaryColor, opacity: 0.6, fontSize: '56px' }}>
                                {patient.sex === 'F' ? 'Mme' : patient.type === 'Child' ? 'Enfant' : 'M.'}
                            </span>
                            {patient.name || '................................................'}
                        </h2>
                        {patient.age && <p style={{ fontSize: '38px', color: secondaryColor, marginTop: '20px', fontWeight: 700 }}>({patient.age} ANS)</p>}
                    </div>

                    {/* 5. MAIN CONTENT AREA */}
                    <div
                        style={{
                            position: 'absolute',
                            left: '160px',
                            top: '1350px',
                            width: '2160px',
                            height: '1650px',
                            overflow: 'visible'
                        }}
                    >
                        {children}
                    </div>

                    {/* 6. SIGNATURE AREA */}
                    {appearance.showSignature !== false && (
                        <div
                            style={{
                                position: 'absolute',
                                right: '160px',
                                bottom: `${450 - footerVerticalOffset}px`,
                                width: '600px',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '20px'
                            }}
                        >
                            <div style={{
                                width: '100%',
                                height: '2px',
                                backgroundColor: '#e5e7eb',
                                marginBottom: '10px'
                            }} />
                            <span style={{
                                fontSize: '32px',
                                color: '#9ca3af',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '2px'
                            }}>
                                {appearance.signatureLabel || 'Cachet & Signature'}
                            </span>
                        </div>
                    )}

                    {/* Watermark Logo */}
                    {appearance.logoUrl && (
                        <div style={{ position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', opacity: appearance.watermarkOpacity || 0.05 }}>
                            <img src={appearance.logoUrl} alt="Watermark" style={{ width: '60%', filter: 'grayscale(100%)' }} />
                        </div>
                    )}

                    {/* 7. FOOTER SECTION */}
                    <div
                        style={{
                            position: 'absolute',
                            left: 0,
                            bottom: `${0 - footerVerticalOffset}px`,
                            width: '2480px',
                            height: '350px',
                            backgroundColor: appearance.footerColor || '#1f2937',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 120px',
                            color: 'white'
                        }}
                    >
                        {showQr && (
                            <div style={{ padding: '15px', backgroundColor: 'white', borderRadius: '25px', marginRight: '60px' }}>
                                <QRCodeSVG value={qrValue} size={qrSize} />
                            </div>
                        )}
                        <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div className="font-arabic" style={{ fontSize: '40px', fontWeight: 900 }}>{doctor.addressAr}</div>
                            <div style={{ fontSize: '40px', opacity: 0.8 }}>{doctor.addressFr}</div>
                            <div style={{ fontSize: '36px', fontWeight: 700 }}>
                                <span style={{ marginRight: '40px' }}>{doctor.phone}</span>
                                {doctor.email && ` | ${doctor.email}`}
                            </div>
                            <div style={{ fontSize: '24px', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '2px' }}>
                                INPE: {doctor.inpe} | ICE: {doctor.ice} | IF: {doctor.taxId}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default DocumentShell;
