import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet, Check, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { DayPayment, PaymentMode, PaymentStatus, paymentService } from '../services/paymentService';
import { toastService } from '../services/toastService';

// Encaissement des visites du jour : une ligne par patient de la salle d'attente.
// Montant dû, montant payé, mode et statut uniquement — pas d'historique, pas de
// totaux, pas d'ordonnance, pas de tarifs (voir src-tauri/src/scoped.rs).
interface Row {
    patientId: string;
    patientName: string;
    id?: string;
    due: string;
    paid: string;
    mode: PaymentMode;
    status: PaymentStatus;
    dirty: boolean;
    saving: boolean;
}

const MODES: Array<{ id: PaymentMode; label: string }> = [
    { id: 'CASH', label: 'Espèces' },
    { id: 'CARD', label: 'Carte' },
    { id: 'TRANSFER', label: 'Virement' },
];
const STATUSES: Array<{ id: PaymentStatus; label: string }> = [
    { id: 'UNPAID', label: 'Non payé' },
    { id: 'PARTIAL', label: 'Partiel' },
    { id: 'PAID', label: 'Payé' },
];

const CashierView: React.FC = () => {
    const currency = dataService.getDoctorInfo().currency || 'DH';
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        const payments = await paymentService.listToday();
        const byPatient = new Map<string, DayPayment>(payments.map(p => [p.patientId, p]));
        const queue = dataService.getTodayQueue();
        const seen = new Set<string>();
        const next: Row[] = [];
        for (const q of queue) {
            const p = byPatient.get(q.id);
            seen.add(q.id);
            next.push({
                patientId: q.id, patientName: q.name, id: p?.id,
                due: p ? String(p.totalAmount) : '', paid: p ? String(p.amountPaid) : '',
                mode: p?.paymentMode ?? 'CASH', status: p?.status ?? 'UNPAID', dirty: false, saving: false,
            });
        }
        // Encaissements du jour de patients déjà sortis de la salle d'attente.
        for (const p of payments) {
            if (seen.has(p.patientId)) continue;
            next.push({
                patientId: p.patientId, patientName: p.patientName || '', id: p.id,
                due: String(p.totalAmount), paid: String(p.amountPaid),
                mode: p.paymentMode, status: p.status, dirty: false, saving: false,
            });
        }
        setRows(next);
        setLoading(false);
    }, []);

    useEffect(() => { void load(); }, [load]);

    const patch = (patientId: string, changes: Partial<Row>) =>
        setRows(rs => rs.map(r => (r.patientId === patientId ? { ...r, ...changes, dirty: true } : r)));

    const save = async (row: Row) => {
        const due = parseFloat(row.due.replace(',', '.'));
        const paid = row.status === 'PAID' ? due : row.status === 'UNPAID' ? 0 : parseFloat(row.paid.replace(',', '.'));
        if (!row.id && !(due >= 0)) { toastService.error('Saisissez le montant dû.'); return; }
        if (row.status === 'PARTIAL' && !(paid > 0)) { toastService.error('Saisissez le montant déjà payé.'); return; }
        setRows(rs => rs.map(r => (r.patientId === row.patientId ? { ...r, saving: true } : r)));
        try {
            const saved = await paymentService.saveToday({
                id: row.id, patientId: row.patientId, patientName: row.patientName,
                totalAmount: due, amountPaid: Number.isFinite(paid) ? paid : 0, paymentMode: row.mode, status: row.status,
            });
            setRows(rs => rs.map(r => (r.patientId === row.patientId
                ? { ...r, id: saved.id, due: String(saved.totalAmount), paid: String(saved.amountPaid), status: saved.status, mode: saved.paymentMode, dirty: false, saving: false }
                : r)));
            toastService.success('Encaissement enregistré');
        } catch (e: any) {
            setRows(rs => rs.map(r => (r.patientId === row.patientId ? { ...r, saving: false } : r)));
            toastService.error(typeof e === 'string' ? e : 'Enregistrement impossible.');
        }
    };

    const empty = useMemo(() => !loading && rows.length === 0, [loading, rows]);
    const field = 'h-10 px-3 rounded-lg border text-[14px] outline-none bg-white';
    const fieldStyle = { borderColor: 'var(--color-border)' } as React.CSSProperties;

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h1 className="text-[22px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                    <Wallet size={22} /> Encaissement
                </h1>
                <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-subtle)' }}>
                    Visites du jour : montant dû, montant payé et mode de paiement.
                </p>
            </div>

            {loading && <div className="py-12 text-center"><Loader2 className="animate-spin inline" size={20} /></div>}
            {empty && (
                <div className="py-16 text-center text-[13px] italic" style={{ color: 'var(--color-text-faint)' }}>
                    Aucun patient dans la salle d'attente aujourd'hui.
                </div>
            )}

            <div className="space-y-3">
                {rows.map(r => (
                    <div key={r.patientId} className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="min-w-[180px] flex-1">
                            <div className="text-[14px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{r.patientName}</div>
                            <div className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>{r.id ? 'Encaissement ouvert' : 'Pas encore encaissé'}</div>
                        </div>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                            Dû ({currency})
                            <input className={`${field} w-28 block mt-1`} style={fieldStyle} inputMode="decimal" value={r.due}
                                disabled={!!r.id} title={r.id ? 'Le montant dû ne se modifie pas ici' : undefined}
                                onChange={e => patch(r.patientId, { due: e.target.value })} />
                        </label>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                            Statut
                            <select className={`${field} block mt-1`} style={fieldStyle} value={r.status}
                                onChange={e => patch(r.patientId, { status: e.target.value as PaymentStatus })}>
                                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                        </label>
                        {r.status === 'PARTIAL' && (
                            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                                Payé ({currency})
                                <input className={`${field} w-28 block mt-1`} style={fieldStyle} inputMode="decimal" value={r.paid}
                                    onChange={e => patch(r.patientId, { paid: e.target.value })} />
                            </label>
                        )}
                        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>
                            Mode
                            <select className={`${field} block mt-1`} style={fieldStyle} value={r.mode}
                                onChange={e => patch(r.patientId, { mode: e.target.value as PaymentMode })}>
                                {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                        </label>
                        <button type="button" disabled={!r.dirty || r.saving} onClick={() => save(r)}
                            className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40"
                            style={{ background: 'var(--color-primary)' }}>
                            {r.saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Enregistrer
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CashierView;
