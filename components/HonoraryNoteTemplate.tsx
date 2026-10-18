
import React from 'react';
import { DoctorInfo, HonoraryNote, NoteDiscount, NoteLine } from '../types';
import DocumentShell from './DocumentShell';
import { settingsService } from '../services/settingsService';
import { formatCents } from '../services/receiptService';
import { reasonLabel } from '../services/tariffService';
import { useStamp } from './tariffs/useStamp';

interface HonoraryNoteTemplateProps {
    doctor: DoctorInfo;
    note: HonoraryNote;
    scale?: number;
    isPrinting?: boolean;
}

/** Mention d'une remise : « Gratuit – Famille / proche », « Remise 10 % – Confrère »… (motif de Rust). */
export const discountText = (d: NoteDiscount): string => {
    const why = d.reason === 'AUTRE' && d.reasonText ? `Autre : ${d.reasonText}` : reasonLabel(d.reason);
    if (d.kind === 'FREE') return `Gratuit – ${why}`;
    if (d.kind === 'PERCENT') return `Remise ${d.percent} % – ${why}`;
    return `Remise – ${why}`;
};

/** Pied de page : identité FIGÉE à l'émission (IF, TP, ICE, INPE) ; seules les mentions renseignées apparaissent. */
export const legalFooterOf = (note: HonoraryNote, doctor: DoctorInfo): string => {
    const i = note.issuer;
    const parts: [string, string | undefined][] = i
        ? [['IF', i.ifNumber], ['TP', i.tp], ['ICE', i.ice], ['INPE', i.inpe], ['CNSS', i.cnss]]
        : [['IF', doctor.taxId], ['TP', doctor.patente], ['ICE', doctor.ice], ['INPE', doctor.inpe], ['CNSS', doctor.cnssEmployer]];
    return parts.filter(([, v]) => v && v.trim()).map(([k, v]) => `${k} ${v!.trim()}`).join('  ·  ');
};

/** Fiche cabinet « figée » : l'en-tête d'une note ancienne ne change pas si l'adresse change ensuite. */
export const issuerDoctor = (note: HonoraryNote, doctor: DoctorInfo): DoctorInfo => {
    const i = note.issuer;
    if (!i) return doctor;
    return {
        ...doctor,
        nameFr: i.name ?? doctor.nameFr,
        nameAr: i.nameAr ?? doctor.nameAr,
        specialtyFr: i.specialty ?? doctor.specialtyFr,
        addressFr: i.address ?? doctor.addressFr,
        phone: i.phone ?? doctor.phone,
        email: i.email ?? doctor.email,
        inpe: i.inpe ?? doctor.inpe,
        ice: i.ice ?? doctor.ice,
        taxId: i.ifNumber ?? doctor.taxId,
    };
};

const th: React.CSSProperties = { fontSize: '30px', fontWeight: 600, color: '#64748b', padding: '26px 24px', textAlign: 'right', backgroundColor: '#f8fafc' };
const td: React.CSSProperties = { fontSize: '36px', color: '#1e293b', padding: '26px 24px', textAlign: 'right', borderTop: '2px solid #f1f5f9', verticalAlign: 'top' };

const HonoraryNoteTemplate: React.FC<HonoraryNoteTemplateProps> = ({ doctor, note, scale = 1 }) => {
    const appearance = settingsService.getAppearance();
    const stamp = useStamp();
    const shown = issuerDoctor(note, doctor);
    const lines: NoteLine[] | null = note.lines && note.lines.length > 0 ? note.lines : null;
    // Note héritée sans lignes : une ligne par prestation cochée (affichage seulement).
    const legacy = (note.services || []).filter(s => s.checked);
    const hasDiscounts = (note.discountCents ?? 0) > 0;
    const paidCents = note.paidCents;
    const balanceCents = note.balanceCents;
    const words = note.totalInWords;

    return (
        <DocumentShell
            id="honorary-note-template"
            doctor={shown}
            appearance={appearance}
            patient={{ name: note.patientName }}
            date={note.date}
            title="Note d'honoraires"
            scale={scale}
            legalFooter={legalFooterOf(note, doctor)}
            stampUrl={stamp}
        >
            <div style={{ padding: '0 40px' }}>
                {note.invoiceNumber && (
                    <div data-testid="note-number" style={{ fontSize: '40px', fontWeight: 700, color: '#475569', marginBottom: '28px', fontFamily: 'monospace' }}>N° {note.invoiceNumber}</div>
                )}
                {note.cancelledAt && (
                    <div data-testid="note-cancelled" style={{ border: '8px solid #b91c1c', color: '#b91c1c', padding: '24px 50px', marginBottom: '36px', fontWeight: 800, fontSize: '40px', textAlign: 'center' }}>
                        NOTE ANNULÉE le {note.cancelledAt.slice(0, 10)}
                        {note.cancellationReason && <div style={{ fontSize: '30px', fontWeight: 600, marginTop: '10px' }}>Motif : {note.cancellationReason}</div>}
                    </div>
                )}

                <table data-testid="note-lines" style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #f1f5f9' }}>
                    <thead>
                        <tr>
                            <th style={{ ...th, textAlign: 'left' }}>Désignation</th>
                            <th style={{ ...th, width: '120px' }}>Qté</th>
                            <th style={{ ...th, width: '300px' }}>P.U.</th>
                            <th style={{ ...th, width: '480px' }}>Remise</th>
                            <th style={{ ...th, width: '300px' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines && lines.map((l, i) => (
                            <tr key={i}>
                                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                                    {l.label}
                                    {l.code && <span style={{ fontSize: '26px', color: '#94a3b8', marginLeft: '16px', fontWeight: 400 }}>{l.code}</span>}
                                </td>
                                <td style={td}>{l.quantity ?? 1}</td>
                                <td style={td}>{formatCents(l.unitPriceCents ?? 0)}</td>
                                <td style={{ ...td, fontSize: '30px' }}>
                                    {l.discount ? (
                                        <>
                                            <div data-testid="line-discount" style={{ fontWeight: 600 }}>{l.discount.kind === 'FREE' ? 'Gratuit' : `− ${formatCents(l.discount.cents ?? l.discountCents ?? 0)}`}</div>
                                            <div style={{ fontSize: '26px', color: '#64748b' }}>{discountText(l.discount)}</div>
                                        </>
                                    ) : '—'}
                                </td>
                                <td style={{ ...td, fontWeight: 700 }}>{formatCents(l.netCents ?? 0)}</td>
                            </tr>
                        ))}
                        {!lines && legacy.map((s, i) => (
                            <tr key={i}>
                                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{s.name}</td>
                                <td style={td}>1</td>
                                <td style={td}>{s.price} DH</td>
                                <td style={td}>—</td>
                                <td style={{ ...td, fontWeight: 700 }}>{s.price} DH</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div style={{ marginTop: '40px', marginLeft: 'auto', width: '1100px', fontSize: '34px', color: '#334155' }} data-testid="note-summary">
                    {lines && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                            <span>Sous-total au tarif</span><span data-testid="gross">{formatCents(note.grossCents ?? 0)}</span>
                        </div>
                    )}
                    {hasDiscounts && lines && lines.filter(l => l.discount).map((l, i) => (
                        <div key={`d${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '30px', color: '#475569' }}>
                            <span>{l.label} : {discountText(l.discount!)}</span><span>− {formatCents(l.discount!.cents ?? l.discountCents ?? 0)}</span>
                        </div>
                    ))}
                    {note.noteDiscount && (
                        <div data-testid="note-discount" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '30px', color: '#475569' }}>
                            <span>Note : {discountText(note.noteDiscount)}</span><span>− {formatCents(note.noteDiscount.cents ?? 0)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', marginTop: '10px', borderTop: '4px solid #1e293b', fontSize: '44px', fontWeight: 800, color: '#0f172a' }}>
                        <span>Net à payer</span>
                        <span data-testid="net">{lines ? formatCents(note.netCents ?? 0) : `${note.totalAmount} DH`}</span>
                    </div>
                    {note.status === 'FREE' && (
                        <div data-testid="note-free" style={{ textAlign: 'right', fontSize: '32px', fontWeight: 700, color: '#475569' }}>Gratuit</div>
                    )}
                    {paidCents != null && balanceCents != null && note.status !== 'FREE' && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span>Déjà payé</span><span data-testid="paid">{formatCents(paidCents)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 700 }}><span>Reste à payer</span><span data-testid="balance">{formatCents(balanceCents)}</span></div>
                        </>
                    )}
                </div>

                {words && (
                    <p data-testid="in-words" style={{ marginTop: '40px', fontSize: '34px', fontStyle: 'italic', color: '#334155' }}>
                        Arrêtée la présente note à la somme de : <strong style={{ fontStyle: 'normal' }}>{words}</strong>
                    </p>
                )}
            </div>
        </DocumentShell>
    );
};

export default HonoraryNoteTemplate;
