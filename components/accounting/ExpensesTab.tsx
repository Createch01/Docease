import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Paperclip, Pencil, Plus, Ban } from 'lucide-react';
import { EXPENSE_MODES, ExpenseCategory, ExpenseList, ExpenseView, expenseService } from '../../services/expenseService';
import { AttachmentMeta, attachmentService } from '../../services/attachmentService';
import { formatCents } from '../../services/receiptService';
import { sessionService } from '../../services/sessionService';
import AttachmentViewer from '../dossier/AttachmentViewer';
import ExpenseDialog from './ExpenseDialog';
import ReasonPicker from '../ReasonPicker';

// Dépenses : liste filtrable, totaux par catégorie calculés par Rust, justificatifs chiffrés.
// Aucune dépense ne se modifie ni ne se supprime : annulation (motif) ou correction (annuler + recréer).

const field = 'h-9 px-2.5 rounded-lg border text-[13px] outline-none bg-white';
const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;
const modeLabel = (m: string) => EXPENSE_MODES.find(x => x.id === m)?.label ?? m;

interface Props { from: string; to: string; currency: string; refresh: number; onChanged: () => void }

const ExpensesTab: React.FC<Props> = ({ from: defFrom, to: defTo, currency, refresh, onChanged }) => {
    const isMedecin = sessionService.isMedecin();
    const [from, setFrom] = useState(defFrom);
    const [to, setTo] = useState(defTo);
    const [category, setCategory] = useState('');
    const [mode, setMode] = useState('');
    const [receipt, setReceipt] = useState<'' | 'with' | 'without'>('');
    const [categories, setCategories] = useState<ExpenseCategory[]>([]);
    const [data, setData] = useState<ExpenseList | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dialog, setDialog] = useState<{ initial?: ExpenseView } | null>(null);
    const [cancelFor, setCancelFor] = useState<ExpenseView | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelError, setCancelError] = useState<string | null>(null);
    const [metas, setMetas] = useState<Record<string, AttachmentMeta>>({});
    const [viewer, setViewer] = useState<AttachmentMeta | null>(null);

    useEffect(() => { setFrom(defFrom); setTo(defTo); }, [defFrom, defTo]);
    useEffect(() => { expenseService.categories().then(setCategories).catch(() => undefined); }, []);

    const load = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const list = isMedecin
                ? await expenseService.list(from, to, { category: category || undefined, mode: mode || undefined, receipt: receipt === '' ? undefined : receipt === 'with' })
                : await expenseService.today();
            setData(list);
            if (isMedecin) {
                const all = await attachmentService.list('__cabinet__').catch(() => [] as AttachmentMeta[]);
                setMetas(Object.fromEntries(all.map(m => [m.id, m])));
            }
        } catch (e) { setData(null); setError(e instanceof Error ? e.message : 'Lecture impossible.'); }
        finally { setBusy(false); }
    }, [from, to, category, mode, receipt, isMedecin]);
    useEffect(() => { void load(); }, [load, refresh]);

    const done = () => { setDialog(null); onChanged(); void load(); };

    const submitCancel = async () => {
        if (!cancelFor) return;
        setCancelError(null);
        try { await expenseService.cancel(cancelFor.id, cancelReason); setCancelFor(null); setCancelReason(''); onChanged(); void load(); }
        catch (e) { setCancelError(e instanceof Error ? e.message : 'Annulation impossible.'); }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-3">
                {isMedecin && (
                    <>
                        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Du
                            <input type="date" className={`${field} block mt-1`} style={border} value={from} onChange={e => setFrom(e.target.value)} /></label>
                        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Au
                            <input type="date" className={`${field} block mt-1`} style={border} value={to} onChange={e => setTo(e.target.value)} /></label>
                        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Catégorie
                            <select className={`${field} block mt-1`} style={border} value={category} onChange={e => setCategory(e.target.value)}>
                                <option value="">Toutes</option>
                                {categories.map(c => <option key={c.name} value={c.name}>{c.name}{c.active ? '' : ' (désactivée)'}</option>)}
                            </select></label>
                        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Mode
                            <select className={`${field} block mt-1`} style={border} value={mode} onChange={e => setMode(e.target.value)}>
                                <option value="">Tous</option>
                                {EXPENSE_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select></label>
                        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Justificatif
                            <select className={`${field} block mt-1`} style={border} value={receipt} onChange={e => setReceipt(e.target.value as '' | 'with' | 'without')}>
                                <option value="">Tous</option>
                                <option value="with">Avec justificatif</option>
                                <option value="without">Sans justificatif</option>
                            </select></label>
                    </>
                )}
                {busy && <Loader2 size={16} className="animate-spin mb-2" />}
                <button type="button" onClick={() => setDialog({})}
                    className="h-9 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 ml-auto" style={{ background: 'var(--color-primary)' }}>
                    <Plus size={15} /> Dépense
                </button>
            </div>
            {!isMedecin && <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Vous voyez les dépenses saisies aujourd'hui.</p>}
            {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}

            {data && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]" style={{ color: 'var(--color-text)' }}>
                        <div className="p-3 rounded-lg bg-white border" style={border}>
                            <p style={{ color: 'var(--color-text-subtle)' }}>Dépenses (hors investissement)</p>
                            <p className="text-[18px] font-semibold">{formatCents(data.totals.expensesCents)}</p>
                            <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>{data.totals.count} dépense{data.totals.count > 1 ? 's' : ''} active{data.totals.count > 1 ? 's' : ''}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border" style={border}>
                            <p style={{ color: 'var(--color-text-subtle)' }}>Achats de matériel à amortir</p>
                            <p className="text-[18px] font-semibold">{formatCents(data.totals.amortizableCents)}</p>
                            <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Listés, hors résultat</p>
                        </div>
                        <div className="p-3 rounded-lg bg-white border" style={border}>
                            <p style={{ color: 'var(--color-text-subtle)' }}>Sans justificatif</p>
                            <p className="text-[18px] font-semibold" style={data.totals.withoutReceipt > 0 ? { color: 'var(--color-warning-800, #b45309)' } : undefined}>{data.totals.withoutReceipt}</p>
                        </div>
                    </div>

                    {data.totals.byCategory.length > 0 && (
                        <div className="bg-white rounded-lg border p-3 text-[13px]" style={{ ...border, color: 'var(--color-text)' }}>
                            <p className="font-medium mb-1" style={{ color: 'var(--color-text-subtle)' }}>Total par catégorie</p>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                {data.totals.byCategory.map(c => (
                                    <li key={c.category} className="flex justify-between py-0.5"><span>{c.category}{c.amortizable ? ' · à amortir' : ''}</span><span>{formatCents(c.cents)}</span></li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="overflow-x-auto bg-white rounded-lg border" style={border}>
                        <table className="w-full text-[13px] text-left" style={{ color: 'var(--color-text)' }}>
                            <thead>
                                <tr style={{ color: 'var(--color-text-subtle)' }}>
                                    {['Date', 'N°', 'Catégorie', 'Fournisseur', 'Libellé', 'Mode', 'Montant', 'Justificatif', ''].map(h => (
                                        <th key={h} className={`py-2 px-3 font-medium ${h === 'Montant' ? 'text-right' : ''}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center" style={{ color: 'var(--color-text-subtle)' }}>Aucune dépense sur cette période.</td></tr>}
                                {data.rows.map(r => {
                                    const cancelled = r.status === 'cancelled';
                                    return (
                                        <tr key={r.seq} className="border-t align-top" style={{ borderColor: 'var(--color-border)', color: cancelled ? 'var(--color-text-subtle)' : undefined }}>
                                            <td className="py-1.5 px-3" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{r.dateExpense}</td>
                                            <td className="py-1.5 px-3 font-mono text-[12px]">{r.id}{r.migrated && <span className="block text-[11px]">migré</span>}</td>
                                            <td className="py-1.5 px-3" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{r.category}{r.subCategory ? <span className="block text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>{r.subCategory}</span> : null}</td>
                                            <td className="py-1.5 px-3" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{r.supplier || '—'}{r.supplierInvoice ? <span className="block text-[11px]">Facture {r.supplierInvoice}</span> : null}</td>
                                            <td className="py-1.5 px-3" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{r.label}
                                                {cancelled && <span className="block text-[11px]" style={{ color: 'var(--color-danger-700)' }}>Annulée le {r.cancelledOn} par {r.cancelledBy} : {r.cancelledReason}</span>}</td>
                                            <td className="py-1.5 px-3">{modeLabel(r.mode)}{r.chequeNumber ? <span className="block text-[11px]">n° {r.chequeNumber}</span> : null}</td>
                                            <td className="py-1.5 px-3 text-right" style={cancelled ? { textDecoration: 'line-through' } : undefined}>{formatCents(r.amountCents)}</td>
                                            <td className="py-1.5 px-3">
                                                {r.hasReceipt
                                                    ? r.receiptIds.map((id, i) => (
                                                        <button key={id} type="button" disabled={!metas[id]} onClick={() => metas[id] && setViewer(metas[id])} className="inline-flex items-center gap-1 text-[12px] underline disabled:no-underline mr-2" style={{ color: 'var(--color-primary)' }}>
                                                            <Paperclip size={12} /> Voir{r.receiptIds.length > 1 ? ` ${i + 1}` : ''}
                                                        </button>))
                                                    : !cancelled && <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'var(--color-warning-50, #fffbeb)', color: 'var(--color-warning-800, #b45309)' }}>Sans justificatif</span>}
                                            </td>
                                            <td className="py-1.5 px-3 whitespace-nowrap">
                                                {isMedecin && !cancelled && (
                                                    <>
                                                        <button type="button" title="Corriger (annuler et recréer)" onClick={() => setDialog({ initial: r })} className="p-1.5 rounded-md hover:bg-gray-100"><Pencil size={15} /></button>
                                                        <button type="button" title="Annuler la dépense" onClick={() => { setCancelFor(r); setCancelReason(''); setCancelError(null); }} className="p-1.5 rounded-md hover:bg-gray-100"><Ban size={15} /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {dialog && <ExpenseDialog initial={dialog.initial} currency={currency} onClose={() => setDialog(null)} onDone={done} />}
            {viewer && <AttachmentViewer meta={viewer} onClose={() => setViewer(null)} />}
            {cancelFor && (
                <div role="dialog" aria-modal="true" aria-label={`Annuler la dépense ${cancelFor.id}`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
                        <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Annuler la dépense {cancelFor.id}</h2>
                        <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>La dépense reste dans la liste, barrée, avec le motif, la date et l'auteur. Elle ne compte plus dans les totaux ni dans le résultat.</p>
                        <ReasonPicker value={cancelReason} onChange={setCancelReason} />
                        {cancelError && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{cancelError}</p>}
                        <div className="flex justify-end gap-2">
                            <button type="button" className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white" style={border} onClick={() => setCancelFor(null)}>Retour</button>
                            <button type="button" className="h-10 px-4 rounded-lg text-white text-[13px] font-medium disabled:opacity-40" style={{ background: 'var(--color-danger)' }} onClick={submitCancel} disabled={cancelReason.trim().length < 3}>Annuler la dépense</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpensesTab;
