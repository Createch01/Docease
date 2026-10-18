import React, { useEffect, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { EXPENSE_MODES, ExpenseCategory, ExpenseInput, ExpenseMode, ExpenseView, expenseService } from '../../services/expenseService';
import { checkFile, defaultTitle } from '../../services/attachmentService';
import { sessionService } from '../../services/sessionService';
import { todayLocal } from '../../utils/localDate';
import { parseCents } from '../../utils/cents';
import ReasonPicker from '../ReasonPicker';

// Saisie (ou correction) d'une dépense. L'interface ne fait que recueillir : numéro DEP, date de saisie, auteur,
// catégories valides, mois clôturés et montants sont contrôlés par Rust. « Corriger » = annuler + recréer
// (motif obligatoire), une seule écriture côté Rust.

const field = 'h-10 px-3 rounded-lg border text-[14px] outline-none bg-white w-full';
const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;
const label = 'block text-[12px] font-medium';
const sub = { color: 'var(--color-text-subtle)' } as React.CSSProperties;

export { parseCents };
const toText = (cents?: number): string => (cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));

interface Props { initial?: ExpenseView; currency: string; onClose: () => void; onDone: () => void }

const ExpenseDialog: React.FC<Props> = ({ initial, currency, onClose, onDone }) => {
    const isMedecin = sessionService.isMedecin();
    const [categories, setCategories] = useState<ExpenseCategory[]>([]);
    const [suppliers, setSuppliers] = useState<string[]>([]);
    const [date, setDate] = useState(initial?.dateExpense ?? todayLocal());
    const [category, setCategory] = useState(initial?.category ?? '');
    const [subCategory, setSubCategory] = useState(initial?.subCategory ?? '');
    const [supplier, setSupplier] = useState(initial?.supplier ?? '');
    const [invoice, setInvoice] = useState(initial?.supplierInvoice ?? '');
    const [text, setText] = useState(initial?.label ?? '');
    const [amount, setAmount] = useState(toText(initial?.amountCents));
    const [vat, setVat] = useState(toText(initial?.vatCents));
    const [mode, setMode] = useState<ExpenseMode>(initial?.mode ?? 'CASH');
    const [cheque, setCheque] = useState(initial?.chequeNumber ?? '');
    const [receipts, setReceipts] = useState<{ id: string; name: string }[]>((initial?.receiptIds ?? []).map(id => ({ id, name: 'Justificatif existant' })));
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        expenseService.categories().then(cs => {
            setCategories(cs);
            setCategory(c => c || cs.find(x => x.active)?.name || '');
        }).catch(() => undefined);
        expenseService.suppliers().then(setSuppliers).catch(() => undefined);
    }, []);

    const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const check = checkFile(file);
        if (check.ok === false) { setError(check.message); return; }
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const meta = await expenseService.addReceipt(bytes, defaultTitle(file.name));
            setReceipts(r => [...r, { id: meta.id, name: file.name }]);
            setError(null);
        } catch (err) {
            setError(typeof err === 'string' ? err : (err as Error)?.message || "Impossible d'ajouter le justificatif.");
        }
    };

    const submit = async () => {
        const cents = parseCents(amount);
        if (!cents || cents <= 0) { setError('Saisissez un montant TTC valide (deux décimales au plus).'); return; }
        const vatCents = vat.trim() === '' ? undefined : parseCents(vat);
        if (vatCents === null) { setError('TVA invalide.'); return; }
        if (initial && reason.trim().length < 3) { setError('Le motif de la correction est obligatoire.'); return; }
        const input: ExpenseInput = {
            dateExpense: date, category, subCategory: subCategory.trim() || undefined, supplier: supplier.trim(),
            supplierInvoice: invoice.trim() || undefined, label: text.trim(), amountCents: cents, vatCents,
            mode, chequeNumber: mode === 'CHEQUE' && cheque.trim() ? cheque.trim() : undefined, receiptIds: receipts.map(r => r.id),
        };
        setBusy(true);
        setError(null);
        try {
            if (initial) await expenseService.correct(initial.id, reason, input);
            else await expenseService.add(input);
            onDone();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
            setBusy(false);
        }
    };

    const usable = categories.filter(c => c.active && (isMedecin || !c.amortizable));

    return (
        <div role="dialog" aria-modal="true" aria-label={initial ? `Corriger la dépense ${initial.id}` : 'Nouvelle dépense'} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
                <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>{initial ? `Corriger la dépense ${initial.id}` : 'Nouvelle dépense'}</h2>
                {initial && (
                    <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                        L'originale est annulée (elle reste visible, barrée) et une nouvelle dépense est créée avec les valeurs ci-dessous, en une seule écriture.
                    </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={label} style={sub}>Date de la dépense
                        <input type="date" max={todayLocal()} className={`${field} mt-1`} style={border} value={date} onChange={e => setDate(e.target.value)} disabled={!isMedecin} /></label>
                    <label className={label} style={sub}>Catégorie
                        <select className={`${field} mt-1`} style={border} value={category} onChange={e => setCategory(e.target.value)}>
                            {usable.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            {initial && !usable.some(c => c.name === initial.category) && <option value={initial.category}>{initial.category}</option>}
                        </select></label>
                    <label className={label} style={sub}>Sous-catégorie (facultatif)
                        <input className={`${field} mt-1`} style={border} value={subCategory} onChange={e => setSubCategory(e.target.value)} maxLength={80} /></label>
                    <label className={label} style={sub}>Fournisseur
                        <input className={`${field} mt-1`} style={border} list="expense-suppliers" value={supplier} onChange={e => setSupplier(e.target.value)} maxLength={120} />
                        <datalist id="expense-suppliers">{suppliers.map(s => <option key={s} value={s} />)}</datalist></label>
                    <label className={label} style={sub}>N° de facture du fournisseur
                        <input className={`${field} mt-1`} style={border} value={invoice} onChange={e => setInvoice(e.target.value)} maxLength={60} /></label>
                    <label className={`${label} sm:col-span-2`} style={sub}>Libellé
                        <input className={`${field} mt-1`} style={border} value={text} onChange={e => setText(e.target.value)} maxLength={200} placeholder="Ex. : loyer d'octobre" /></label>
                    <label className={label} style={sub}>Montant TTC ({currency})
                        <input className={`${field} mt-1`} style={border} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
                    <label className={label} style={sub}>dont TVA ({currency}, facultatif, informatif)
                        <input className={`${field} mt-1`} style={border} inputMode="decimal" value={vat} onChange={e => setVat(e.target.value)} /></label>
                    <label className={label} style={sub}>Mode de paiement
                        <select className={`${field} mt-1`} style={border} value={mode} onChange={e => setMode(e.target.value as ExpenseMode)}>
                            {EXPENSE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select></label>
                    {mode === 'CHEQUE' && (
                        <label className={label} style={sub}>N° de chèque
                            <input className={`${field} mt-1`} style={border} value={cheque} onChange={e => setCheque(e.target.value)} maxLength={30} /></label>
                    )}
                </div>

                {(
                    <div className="space-y-2">
                        <p className={label} style={sub}>Justificatifs (PDF, JPG ou PNG ; stockés chiffrés)</p>
                        <div className="flex flex-wrap gap-2 items-center">
                            {receipts.map(r => (
                                <span key={r.id} className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] border" style={border}>
                                    <Paperclip size={13} /> {r.name}
                                    <button type="button" aria-label="Retirer" onClick={() => setReceipts(rs => rs.filter(x => x.id !== r.id))}><X size={13} /></button>
                                </span>
                            ))}
                            <label className="h-8 px-3 rounded-lg border text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer bg-white" style={border}>
                                <Paperclip size={13} /> Ajouter un justificatif
                                <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={pick} />
                            </label>
                        </div>
                        {receipts.length === 0 && <p className="text-[12px]" style={{ color: 'var(--color-warning-800, #92400e)' }}>Sans justificatif : la dépense sera signalée « Sans justificatif ».</p>}
                    </div>
                )}

                {initial && (
                    <ReasonPicker title="Motif de la correction (obligatoire)" value={reason} onChange={setReason} />
                )}

                {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40" style={border} onClick={onClose} disabled={busy}>Retour</button>
                    <button type="button" className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-40" style={{ background: 'var(--color-primary)' }} onClick={submit} disabled={busy || !category}>
                        {busy && <Loader2 size={15} className="animate-spin" />} {initial ? 'Annuler et recréer' : 'Enregistrer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExpenseDialog;
