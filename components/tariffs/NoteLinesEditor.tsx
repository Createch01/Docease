import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Percent, Plus, Trash2 } from 'lucide-react';
import {
    DISCOUNT_REASONS, DiscountInput, DiscountKind, LineInput, Preview, TariffGrid,
    gridIsEmpty, isUsableAct, tariffService, ControlOffer,
} from '../../services/tariffService';
import { formatCents } from '../../services/receiptService';
import { parseCents } from '../../utils/cents';

// Lignes d'une note (actes de la grille, ligne libre pour le médecin), remises et gratuités.
// L'interface recueille des CHOIX ; prix, remises, plafond de l'assistante, gratuité et totaux sont décidés et
// calculés par Rust (`tariff_preview` pour l'aperçu, même calcul qu'à l'émission). Aucun montant n'est additionné ici.

export interface DraftDiscount { kind: DiscountKind; percent: string; amount: string; reason: string; reasonText: string }
export interface DraftLine { key: string; actId: string; free: boolean; label: string; price: string; quantity: string; discount: DraftDiscount | null }
export interface NoteDraft { lines: DraftLine[]; noteDiscount: DraftDiscount | null }

let seq = 0;
export const newLine = (actId = '', free = false): DraftLine => ({ key: `l${++seq}`, actId, free, label: '', price: '', quantity: '1', discount: null });
export const newDiscount = (kind: DiscountKind = 'PERCENT', reason = ''): DraftDiscount => ({ kind, percent: '', amount: '', reason, reasonText: '' });
export const emptyDraft = (actId = ''): NoteDraft => ({ lines: [newLine(actId)], noteDiscount: null });

/** Brouillon → saisie envoyée à Rust. `incomplete` : motif lisible si le brouillon n'est pas encore envoyable. */
export const draftToInput = (d: NoteDraft): { lines: LineInput[]; noteDiscount: DiscountInput | null; incomplete: string | null } => {
    let incomplete: string | null = null;
    const discountOf = (x: DraftDiscount | null): DiscountInput | undefined => {
        if (!x) return undefined;
        const out: DiscountInput = { kind: x.kind, reason: x.reason };
        if (x.kind === 'PERCENT') {
            const p = parseInt(x.percent, 10);
            if (!(p >= 1)) incomplete = incomplete ?? 'Saisissez le pourcentage de la remise.';
            out.percent = Number.isFinite(p) ? p : undefined;
        }
        if (x.kind === 'AMOUNT') {
            const c = parseCents(x.amount);
            if (!c) incomplete = incomplete ?? 'Saisissez le montant de la remise.';
            out.amountCents = c ?? undefined;
        }
        if (!x.reason) incomplete = incomplete ?? 'Choisissez le motif de la remise.';
        if (x.reason === 'AUTRE') out.reasonText = x.reasonText;
        return out;
    };
    const lines: LineInput[] = [];
    for (const l of d.lines) {
        if (l.free) {
            if (!l.label.trim() && !l.price.trim()) continue;
            const cents = parseCents(l.price);
            if (!l.label.trim()) incomplete = incomplete ?? 'Saisissez le libellé de la ligne libre.';
            if (!cents) incomplete = incomplete ?? 'Saisissez le prix de la ligne libre.';
            lines.push({ label: l.label, unitPriceCents: cents ?? undefined, quantity: parseInt(l.quantity, 10) || 1, discount: discountOf(l.discount) });
        } else if (l.actId) {
            lines.push({ actId: l.actId, quantity: parseInt(l.quantity, 10) || 1, discount: discountOf(l.discount) });
        }
    }
    return { lines, noteDiscount: discountOf(d.noteDiscount) ?? null, incomplete };
};

const field = 'h-9 px-2.5 rounded-lg border text-[13px] outline-none bg-white';
const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;
const sub = { color: 'var(--color-text-subtle)' } as React.CSSProperties;

interface DiscountProps {
    value: DraftDiscount;
    onChange: (v: DraftDiscount | null) => void;
    allowFree: boolean;
    label: string;
}

const DiscountFields: React.FC<DiscountProps> = ({ value, onChange, allowFree, label }) => (
    <div className="flex flex-wrap items-end gap-2 p-2 rounded-lg" style={{ background: 'var(--color-surface-alt, #f8fafc)' }} aria-label={label}>
        <label className="text-[11px] font-medium" style={sub}>Remise
            <select className={`${field} block mt-0.5`} style={border} value={value.kind} onChange={e => onChange({ ...value, kind: e.target.value as DiscountKind })}>
                <option value="PERCENT">Pourcentage</option>
                <option value="AMOUNT">Montant</option>
                {allowFree && <option value="FREE">Gratuité totale</option>}
            </select>
        </label>
        {value.kind === 'PERCENT' && (
            <label className="text-[11px] font-medium" style={sub}>%
                <input className={`${field} w-20 block mt-0.5`} style={border} inputMode="numeric" value={value.percent} onChange={e => onChange({ ...value, percent: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
            </label>
        )}
        {value.kind === 'AMOUNT' && (
            <label className="text-[11px] font-medium" style={sub}>Montant
                <input className={`${field} w-28 block mt-0.5`} style={border} inputMode="decimal" value={value.amount} onChange={e => onChange({ ...value, amount: e.target.value })} />
            </label>
        )}
        <label className="text-[11px] font-medium" style={sub}>Motif (obligatoire)
            <select aria-label="Motif de la remise" className={`${field} block mt-0.5`} style={border} value={value.reason} onChange={e => onChange({ ...value, reason: e.target.value })}>
                <option value="">Choisir un motif…</option>
                {DISCOUNT_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
        </label>
        {value.reason === 'AUTRE' && (
            <label className="text-[11px] font-medium flex-1 min-w-[160px]" style={sub}>Précisez le motif
                <input aria-label="Précision du motif" className={`${field} w-full block mt-0.5`} style={border} maxLength={120} value={value.reasonText} onChange={e => onChange({ ...value, reasonText: e.target.value })} />
            </label>
        )}
        <button type="button" onClick={() => onChange(null)} className="h-9 px-2 text-[12px] rounded-lg" style={{ color: 'var(--color-text-muted)' }}>Retirer la remise</button>
    </div>
);

interface Props {
    grid: TariffGrid | null;
    isMedecin: boolean;
    patientId?: string;
    currency: string;
    draft: NoteDraft;
    onChange: (d: NoteDraft) => void;
    /** Dernier aperçu calculé par Rust (null si la saisie est incomplète ou refusée). */
    onPreview?: (p: Preview | null) => void;
    /** Une seule ligne, sans ajout (facture rapide, encaissement). */
    single?: boolean;
    /** Lien vers la grille (Paramètres › Cabinet › Tarifs des actes). */
    onOpenGrid?: () => void;
}

const NoteLinesEditor: React.FC<Props> = ({ grid, isMedecin, patientId, currency, draft, onChange, onPreview, single, onOpenGrid }) => {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [offer, setOffer] = useState<ControlOffer | null>(null);
    const seqRef = useRef(0);

    const acts = useMemo(() => (grid?.acts ?? []).filter(isUsableAct).sort((a, b) => a.order - b.order), [grid]);
    const cap = grid?.settings.assistantDiscountCapPct ?? 0;
    // L'assistante ne voit la remise que si le médecin lui a donné un plafond, ou pour un contrôle gratuit proposé.
    const canDiscount = isMedecin || cap > 0;
    const canFree = isMedecin || !!offer;

    useEffect(() => {
        let alive = true;
        if (!patientId) { setOffer(null); return; }
        tariffService.freeControlOffer(patientId).then(o => { if (alive) setOffer(o); }).catch(() => { if (alive) setOffer(null); });
        return () => { alive = false; };
    }, [patientId]);

    const { lines, noteDiscount, incomplete } = useMemo(() => draftToInput(draft), [draft]);
    const signature = JSON.stringify({ lines, noteDiscount });

    useEffect(() => {
        const mine = ++seqRef.current;
        if (lines.length === 0 || incomplete) {
            setPreview(null);
            setError(incomplete && lines.length > 0 ? incomplete : null);
            onPreview?.(null);
            return;
        }
        tariffService.preview(lines, noteDiscount, patientId)
            .then(p => { if (mine === seqRef.current) { setPreview(p); setError(null); onPreview?.(p); } })
            .catch(e => { if (mine === seqRef.current) { setPreview(null); setError(e instanceof Error ? e.message : String(e)); onPreview?.(null); } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature, patientId]);

    const setLine = (key: string, patch: Partial<DraftLine>) => onChange({ ...draft, lines: draft.lines.map(l => (l.key === key ? { ...l, ...patch } : l)) });
    const removeLine = (key: string) => onChange({ ...draft, lines: draft.lines.length > 1 ? draft.lines.filter(l => l.key !== key) : [newLine()] });

    const applyFreeControl = () => onChange({ ...draft, noteDiscount: { ...newDiscount('FREE', 'CONTROLE_GRATUIT') } });

    return (
        <div className="space-y-3" data-testid="note-lines">
            {gridIsEmpty(grid) && (
                <div role="note" className="p-3 rounded-lg flex gap-2.5 items-start" style={{ background: 'var(--color-warning-50)' }}>
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-warning-800)' }} />
                    <div className="text-[13px]" style={{ color: 'var(--color-warning-800)' }}>
                        <strong className="font-semibold">Complétez vos tarifs.</strong>{' '}
                        {isMedecin
                            ? <>Aucun acte n'a de prix : la grille ne peut pas encore servir. {onOpenGrid && <button type="button" className="underline" onClick={onOpenGrid}>Ouvrir les tarifs des actes</button>}</>
                            : 'Le médecin doit renseigner les prix des actes avant que vous puissiez créer une note.'}
                    </div>
                </div>
            )}

            {offer && (
                <div role="note" className="p-3 rounded-lg flex flex-wrap gap-2 items-center justify-between" style={{ background: 'var(--color-primary-50)' }} data-testid="free-control-offer">
                    <span className="text-[13px]" style={{ color: 'var(--color-primary)' }}>
                        Consultation payée le {offer.date.split('-').reverse().join('/')}{offer.noteNumber ? ` (note ${offer.noteNumber})` : ''} : contrôle gratuit possible (délai {offer.days} jours).
                    </span>
                    {!draft.noteDiscount && (
                        <button type="button" onClick={applyFreeControl} className="h-8 px-3 rounded-lg text-[12px] font-medium bg-white border" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                            Appliquer « Contrôle gratuit »
                        </button>
                    )}
                </div>
            )}

            {draft.lines.map((l, i) => {
                const pl = preview?.lines[draft.lines.filter(x => x.free ? (x.label.trim() || x.price.trim()) : x.actId).indexOf(l)];
                return (
                    <div key={l.key} className="rounded-xl border p-3 space-y-2" style={border} data-testid="note-line">
                        <div className="flex flex-wrap items-end gap-2">
                            {l.free ? (
                                <>
                                    <label className="text-[11px] font-medium flex-1 min-w-[180px]" style={sub}>Libellé (ligne libre)
                                        <input aria-label="Libellé de la ligne libre" className={`${field} w-full block mt-0.5`} style={border} maxLength={120} value={l.label} onChange={e => setLine(l.key, { label: e.target.value })} />
                                    </label>
                                    <label className="text-[11px] font-medium" style={sub}>Prix ({currency})
                                        <input aria-label="Prix de la ligne libre" className={`${field} w-28 block mt-0.5`} style={border} inputMode="decimal" value={l.price} onChange={e => setLine(l.key, { price: e.target.value })} />
                                    </label>
                                </>
                            ) : (
                                <label className="text-[11px] font-medium flex-1 min-w-[200px]" style={sub}>Acte
                                    <select aria-label="Acte" className={`${field} w-full block mt-0.5`} style={border} value={l.actId} onChange={e => setLine(l.key, { actId: e.target.value })}>
                                        <option value="">Choisir un acte…</option>
                                        {acts.map(a => <option key={a.id} value={a.id}>{a.label} — {formatCents(a.priceCents ?? 0)}</option>)}
                                    </select>
                                </label>
                            )}
                            <label className="text-[11px] font-medium" style={sub}>Qté
                                <input aria-label="Quantité" className={`${field} w-16 block mt-0.5`} style={border} inputMode="numeric" value={l.quantity} onChange={e => setLine(l.key, { quantity: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
                            </label>
                            {pl && <div className="text-[13px] font-medium min-w-[110px] text-right pb-1.5" style={{ color: 'var(--color-text)' }}>{formatCents(pl.netCents)}</div>}
                            {canDiscount && !l.discount && (
                                <button type="button" onClick={() => setLine(l.key, { discount: newDiscount() })} className="h-9 px-2.5 rounded-lg border text-[12px] flex items-center gap-1 bg-white" style={border}><Percent size={13} /> Remise</button>
                            )}
                            {!single && (
                                <button type="button" aria-label="Retirer la ligne" onClick={() => removeLine(l.key)} className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ color: 'var(--color-text-muted)' }}><Trash2 size={15} /></button>
                            )}
                        </div>
                        {l.discount && <DiscountFields label={`Remise de la ligne ${i + 1}`} value={l.discount} allowFree={canFree} onChange={v => setLine(l.key, { discount: v })} />}
                    </div>
                );
            })}

            {!single && (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onChange({ ...draft, lines: [...draft.lines, newLine()] })} className="h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 bg-white" style={border}><Plus size={13} /> Ajouter un acte</button>
                    {isMedecin && (
                        <button type="button" onClick={() => onChange({ ...draft, lines: [...draft.lines, newLine('', true)] })} className="h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 bg-white" style={border}><Plus size={13} /> Ligne libre</button>
                    )}
                    {canDiscount && !draft.noteDiscount && (
                        <button type="button" onClick={() => onChange({ ...draft, noteDiscount: newDiscount() })} className="h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 bg-white" style={border}><Percent size={13} /> Remise sur la note</button>
                    )}
                </div>
            )}

            {draft.noteDiscount && <DiscountFields label="Remise sur la note" value={draft.noteDiscount} allowFree={canFree} onChange={v => onChange({ ...draft, noteDiscount: v })} />}

            {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}

            {preview && (
                <dl className="rounded-xl p-4 space-y-1.5 text-[13px]" style={{ background: 'var(--color-surface-alt, #f8fafc)' }} data-testid="note-totals">
                    <div className="flex justify-between"><dt style={sub}>Sous-total au tarif</dt><dd data-testid="total-gross">{formatCents(preview.grossCents)}</dd></div>
                    {preview.discountCents > 0 && <div className="flex justify-between"><dt style={sub}>Remises</dt><dd data-testid="total-discount">− {formatCents(preview.discountCents)}</dd></div>}
                    <div className="flex justify-between text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}><dt>Net à payer</dt><dd data-testid="total-net">{formatCents(preview.netCents)}</dd></div>
                    <div className="text-[12px] italic" style={sub}>{preview.inWords}</div>
                    {preview.netCents === 0 && <div className="text-[12px] font-medium" style={{ color: 'var(--color-primary)' }}>Note à 0 DH : statut « Gratuit », hors reste à encaisser.</div>}
                </dl>
            )}
        </div>
    );
};

export default NoteLinesEditor;
