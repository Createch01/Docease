import React from 'react';
import { DoctorInfo } from '../types';
import { resolveCabinetLogo } from '../utils/cabinetLogo';
import { PAYMENT_MODE_LABEL, ReceiptView, formatCents, legalLines } from '../services/receiptService';

// Reçu de paiement, A5 portrait (148 × 210 mm). Il ne reçoit QUE l'entrée figée du registre
// (`ReceiptView`) et l'en-tête du cabinet : aucun patient, consultation, ordonnance ni résultat n'est
// lu ici, donc aucune donnée de santé ne peut s'y glisser. Les mentions légales viennent de l'entrée
// (figées à l'émission), jamais de la fiche cabinet actuelle.

interface Props {
    receipt: ReceiptView;
    doctor: DoctorInfo;
    /** Impression d'un duplicata : rang et horodatage fournis par Rust. */
    duplicate?: { rank: number; printedAt: string };
    id?: string;
}

const dateFr = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const timeFr = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const ReceiptTemplate: React.FC<Props> = ({ receipt, doctor, duplicate, id = 'receipt-template' }) => {
    const isCancellation = receipt.kind === 'cancellation';
    const cancelled = receipt.status === 'cancelled';
    const logo = resolveCabinetLogo(doctor, null);
    const name = doctor.cabinetName || doctor.nameFr || doctor.name || '';
    const ids = legalLines(receipt.legal);
    const title = isCancellation ? "REÇU D'ANNULATION" : 'REÇU DE PAIEMENT';

    return (
        <div
            id={id}
            className="document-print-container print-a5"
            style={{ width: '148mm', height: '210mm', boxSizing: 'border-box', padding: '12mm 12mm 10mm', background: 'white', color: '#0f172a', fontFamily: 'Inter, Arial, sans-serif', fontSize: '10.5pt', position: 'relative', overflow: 'hidden' }}
        >
            <style>{'@media print { @page { size: A5 portrait; margin: 0; } }'}</style>

            {/* En-tête du cabinet */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4mm', borderBottom: '0.5mm solid #cbd5e1', paddingBottom: '4mm' }}>
                {logo && <img src={logo} alt="" style={{ height: '16mm', maxWidth: '30mm', objectFit: 'contain' }} />}
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '13pt' }}>{name}</div>
                    {doctor.specialtyFr && <div style={{ fontSize: '9pt', color: '#475569' }}>{doctor.specialtyFr}</div>}
                    {doctor.addressFr && <div style={{ fontSize: '9pt', color: '#475569' }}>{doctor.addressFr}</div>}
                    {doctor.phone && <div style={{ fontSize: '9pt', color: '#475569' }}>Tél. {doctor.phone}</div>}
                </div>
            </div>

            <div style={{ textAlign: 'center', margin: '7mm 0 2mm' }}>
                <div style={{ fontWeight: 800, fontSize: '15pt', letterSpacing: '0.04em' }}>{title}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '12pt', marginTop: '1.5mm' }}>N° {receipt.number}</div>
                <div style={{ fontSize: '9.5pt', color: '#475569' }}>Date : {dateFr(receipt.date)}</div>
            </div>

            {duplicate && (
                <div data-testid="duplicate-banner" style={{ textAlign: 'center', border: '0.4mm solid #0f172a', fontWeight: 700, padding: '1.5mm', margin: '3mm 0' }}>
                    DUPLICATA n° {duplicate.rank} — imprimé le {timeFr(duplicate.printedAt)}
                </div>
            )}

            {isCancellation && (
                <div data-testid="cancellation-ref" style={{ textAlign: 'center', margin: '3mm 0', fontWeight: 600 }}>
                    Annule le reçu n° {receipt.cancelsNumber}
                </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4mm', fontSize: '10.5pt' }}>
                <tbody>
                    <tr>
                        <td style={{ padding: '2mm 0', color: '#475569', width: '38%' }}>{isCancellation ? 'Remboursé à' : 'Reçu de'}</td>
                        <td style={{ padding: '2mm 0', fontWeight: 600 }}>{receipt.patientName}</td>
                    </tr>
                    <tr>
                        <td style={{ padding: '2mm 0', color: '#475569' }}>Pour</td>
                        <td style={{ padding: '2mm 0' }}>{receipt.label}</td>
                    </tr>
                    <tr>
                        <td style={{ padding: '2mm 0', color: '#475569' }}>Mode de paiement</td>
                        <td style={{ padding: '2mm 0' }}>{PAYMENT_MODE_LABEL[receipt.paymentMode] ?? receipt.paymentMode}</td>
                    </tr>
                </tbody>
            </table>

            <div style={{ border: '0.5mm solid #0f172a', borderRadius: '2mm', padding: '4mm', margin: '5mm 0 3mm', textAlign: 'center' }}>
                <div data-testid="amount-digits" style={{ fontWeight: 800, fontSize: '18pt' }}>{formatCents(receipt.amountCents)}</div>
                <div data-testid="amount-words" style={{ fontSize: '10pt', marginTop: '1.5mm' }}>{receipt.amountInWords}</div>
            </div>

            {!isCancellation && receipt.balanceDueCents > 0 && (
                <div data-testid="balance-due" style={{ textAlign: 'right', fontSize: '10pt' }}>Reste dû : {formatCents(receipt.balanceDueCents)}</div>
            )}
            {isCancellation && receipt.reason && (
                <div data-testid="cancellation-reason" style={{ fontSize: '10pt', marginTop: '2mm' }}>Motif : {receipt.reason}</div>
            )}

            {/* Cachet et signature du médecin */}
            <div style={{ position: 'absolute', right: '12mm', bottom: '26mm', width: '45mm', height: '24mm', textAlign: 'center' }}>
                {doctor.stampUrl && <img src={doctor.stampUrl} alt="" style={{ maxHeight: '24mm', maxWidth: '45mm', objectFit: 'contain' }} />}
                {doctor.signatureUrl && <img src={doctor.signatureUrl} alt="" style={{ position: 'absolute', inset: 0, margin: 'auto', maxHeight: '24mm', maxWidth: '45mm', objectFit: 'contain' }} />}
            </div>

            {/* Pied : mentions légales renseignées seulement */}
            {(ids.length > 0 || receipt.legal.vatNote) && (
                <div data-testid="legal" style={{ position: 'absolute', left: '12mm', right: '12mm', bottom: '8mm', borderTop: '0.3mm solid #cbd5e1', paddingTop: '2mm', fontSize: '8pt', color: '#475569', textAlign: 'center' }}>
                    {ids.length > 0 && <div>{ids.join('  ·  ')}</div>}
                    {receipt.legal.vatNote && <div>{receipt.legal.vatNote}</div>}
                </div>
            )}

            {(cancelled || isCancellation) && (
                <div data-testid="watermark" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ transform: 'rotate(-28deg)', border: '1.2mm solid rgba(185,28,28,0.45)', color: 'rgba(185,28,28,0.45)', fontWeight: 900, fontSize: '34pt', padding: '2mm 8mm', textAlign: 'center', lineHeight: 1.1 }}>
                        {isCancellation ? 'ANNULATION' : <>ANNULÉ<div style={{ fontSize: '11pt', fontWeight: 700 }}>voir {receipt.cancelledBy}</div></>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceiptTemplate;
