import React, { useEffect, useState } from 'react';
import { AlertTriangle, History, Plus, Save, Tags } from 'lucide-react';
import { SettingsCard } from './SettingsUI';
import { useTariffGrid } from '../tariffs/useTariffGrid';
import {
    ACT_CATEGORIES, Act, ActCategory, TariffGrid, categoryLabel, gridIsEmpty, tariffService,
} from '../../services/tariffService';
import { centsToText, parseCents } from '../../utils/cents';
import { formatCents } from '../../services/receiptService';
import { toastService } from '../../services/toastService';

// Paramètres > Cabinet > Tarifs des actes (médecin : création / modification ; l'assistante lit et utilise la
// grille dans les notes). Rust valide tout (code et libellé uniques, prix > 0, catégorie) ; un acte ne se
// supprime pas, il se désactive ; changer un prix n'affecte que les NOUVELLES notes.

const field = 'h-9 px-2.5 rounded-md border text-[13px] outline-none bg-white';
const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;

interface RowDraft {
    id?: string;
    code: string;
    label: string;
    category: ActCategory;
    price: string;
    ngapLetter: string;
    ngapCoefficient: string;
    order: string;
}

const toDraft = (a: Act): RowDraft => ({
    id: a.id, code: a.code, label: a.label, category: a.category,
    price: a.priceCents == null ? '' : centsToText(a.priceCents),
    ngapLetter: a.ngapLetter ?? '', ngapCoefficient: a.ngapCoefficient ?? '', order: String(a.order),
});

const emptyDraft = (): RowDraft => ({ code: '', label: '', category: 'AUTRE', price: '', ngapLetter: '', ngapCoefficient: '', order: '' });

const differs = (a: RowDraft, b: RowDraft) => (Object.keys(a) as (keyof RowDraft)[]).some(k => a[k] !== b[k]);

const ActRow: React.FC<{ act: Act; onGrid: (g: TariffGrid) => void }> = ({ act, onGrid }) => {
    const saved = toDraft(act);
    const [d, setD] = useState<RowDraft>(saved);
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState(false);
    useEffect(() => setD(toDraft(act)), [act]);
    const dirty = differs(d, saved);

    const save = async () => {
        const price = d.price.trim() === '' ? null : parseCents(d.price);
        if (d.price.trim() !== '' && price === null) { toastService.error('Prix invalide : deux décimales au plus.'); return; }
        setBusy(true);
        try {
            onGrid(await tariffService.saveAct({
                id: d.id, code: d.code, label: d.label, category: d.category, priceCents: price,
                ngapLetter: d.ngapLetter.trim() || null, ngapCoefficient: d.ngapCoefficient.trim() || null,
                order: parseInt(d.order, 10) || undefined,
            }));
            toastService.success('Acte enregistré');
        } catch (e) {
            toastService.error(e instanceof Error ? e.message : 'Enregistrement impossible.');
        } finally {
            setBusy(false);
        }
    };

    const toggle = async () => {
        setBusy(true);
        try { onGrid(await tariffService.setActive(act.id, !act.active)); }
        catch (e) { toastService.error(e instanceof Error ? e.message : 'Opération impossible.'); }
        finally { setBusy(false); }
    };

    return (
        <div className="p-3 rounded-lg border bg-white space-y-2" style={border} data-testid="act-row">
            <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] font-medium w-14" style={{ color: 'var(--color-text-subtle)' }}>Ordre
                    <input aria-label="Ordre d'affichage" className={`${field} w-full block mt-0.5`} style={border} inputMode="numeric" value={d.order} onChange={e => setD({ ...d, order: e.target.value.replace(/\D/g, '') })} /></label>
                <label className="text-[11px] font-medium w-24" style={{ color: 'var(--color-text-subtle)' }}>Code
                    <input aria-label="Code" className={`${field} w-full block mt-0.5`} style={border} maxLength={12} value={d.code} onChange={e => setD({ ...d, code: e.target.value })} /></label>
                <label className="text-[11px] font-medium flex-1 min-w-[180px]" style={{ color: 'var(--color-text-subtle)' }}>Libellé
                    <input aria-label="Libellé" className={`${field} w-full block mt-0.5`} style={border} maxLength={80} value={d.label} onChange={e => setD({ ...d, label: e.target.value })} /></label>
                <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Catégorie
                    <select aria-label="Catégorie" className={`${field} block mt-0.5`} style={border} value={d.category} onChange={e => setD({ ...d, category: e.target.value as ActCategory })}>
                        {ACT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select></label>
                <label className="text-[11px] font-medium w-28" style={{ color: 'var(--color-text-subtle)' }}>Prix (DH)
                    <input aria-label="Prix" className={`${field} w-full block mt-0.5`} style={border} inputMode="decimal" placeholder="Non renseigné" value={d.price} onChange={e => setD({ ...d, price: e.target.value })} /></label>
                <label className="text-[11px] font-medium w-20" style={{ color: 'var(--color-text-subtle)' }}>Lettre clé
                    <input aria-label="Lettre clé NGAP" className={`${field} w-full block mt-0.5`} style={border} maxLength={6} placeholder="—" value={d.ngapLetter} onChange={e => setD({ ...d, ngapLetter: e.target.value })} /></label>
                <label className="text-[11px] font-medium w-20" style={{ color: 'var(--color-text-subtle)' }}>Coeff.
                    <input aria-label="Coefficient NGAP" className={`${field} w-full block mt-0.5`} style={border} inputMode="decimal" placeholder="—" value={d.ngapCoefficient} onChange={e => setD({ ...d, ngapCoefficient: e.target.value })} /></label>
                <button type="button" disabled={!dirty || busy} onClick={save} className="h-9 px-3 rounded-lg text-white text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>
                    <Save size={13} /> Enregistrer
                </button>
                <button type="button" disabled={busy} onClick={toggle} className="h-9 px-3 rounded-lg border text-[12px] font-medium bg-white" style={border}>
                    {act.active ? 'Désactiver' : 'Réactiver'}
                </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                {!act.active && <span className="font-medium" style={{ color: 'var(--color-danger-700)' }}>Désactivé : non sélectionnable dans les notes.</span>}
                {act.priceCents == null && act.active && <span style={{ color: 'var(--color-warning-800)' }}>Sans prix : non utilisable.</span>}
                {act.priceHistory.length > 0 && (
                    <button type="button" onClick={() => setHistory(h => !h)} className="inline-flex items-center gap-1 underline"><History size={12} /> Historique des prix ({act.priceHistory.length})</button>
                )}
            </div>
            {history && (
                <ul className="text-[12px] space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {[...act.priceHistory].reverse().map((h, i) => (
                        <li key={i}>{h.from.split('-').reverse().join('/')} — {h.priceCents == null ? 'prix retiré' : formatCents(h.priceCents)} ({h.by})</li>
                    ))}
                    <li className="italic">Un changement de prix n'affecte que les nouvelles notes.</li>
                </ul>
            )}
        </div>
    );
};

const TariffsSettings: React.FC = () => {
    const { grid, setGrid, error } = useTariffGrid();
    const [add, setAdd] = useState<RowDraft | null>(null);
    const [cap, setCap] = useState('');
    const [days, setDays] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!grid) return;
        setCap(String(grid.settings.assistantDiscountCapPct));
        setDays(String(grid.settings.freeControlDays));
    }, [grid]);

    const addAct = async () => {
        if (!add) return;
        const price = add.price.trim() === '' ? null : parseCents(add.price);
        if (add.price.trim() !== '' && price === null) { toastService.error('Prix invalide : deux décimales au plus.'); return; }
        setBusy(true);
        try {
            setGrid(await tariffService.saveAct({
                code: add.code, label: add.label, category: add.category, priceCents: price,
                ngapLetter: add.ngapLetter.trim() || null, ngapCoefficient: add.ngapCoefficient.trim() || null,
            }));
            setAdd(null);
            toastService.success('Acte ajouté');
        } catch (e) {
            toastService.error(e instanceof Error ? e.message : 'Ajout impossible.');
        } finally {
            setBusy(false);
        }
    };

    const saveSettings = async () => {
        setBusy(true);
        try {
            setGrid(await tariffService.saveSettings(parseInt(cap, 10) || 0, parseInt(days, 10) || 0));
            toastService.success('Réglages des remises enregistrés');
        } catch (e) {
            toastService.error(e instanceof Error ? e.message : 'Enregistrement impossible.');
        } finally {
            setBusy(false);
        }
    };

    if (error) return <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>;
    if (!grid) return null;
    const sorted = [...grid.acts].sort((a, b) => a.order - b.order);
    const settingsDirty = cap !== String(grid.settings.assistantDiscountCapPct) || days !== String(grid.settings.freeControlDays);

    return (
        <div className="space-y-5 max-w-5xl">
            {gridIsEmpty(grid) && (
                <div role="note" data-testid="complete-tariffs" className="p-3.5 rounded-md flex gap-2.5" style={{ background: 'var(--color-warning-50)' }}>
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-warning-800)' }} />
                    <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-warning-800)' }}>
                        <strong className="font-semibold">Complétez vos tarifs.</strong> Aucun prix n'est renseigné : les actes ci-dessous sont proposés sans prix,
                        et un acte sans prix n'est pas utilisable dans une note.
                    </p>
                </div>
            )}

            <SettingsCard
                title="Tarifs des actes" icon={<Tags size={16} />}
                description="Lettre clé NGAP et coefficient sont facultatifs et informatifs (rien n'est déduit). Un acte déjà utilisé n'est jamais supprimé : désactivez-le."
                actions={<button type="button" onClick={() => setAdd(emptyDraft())} className="h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 bg-white" style={border}><Plus size={13} /> Nouvel acte</button>}
            >
                {add && (
                    <div className="p-3 rounded-lg border bg-white flex flex-wrap items-end gap-2" style={border}>
                        <label className="text-[11px] font-medium w-24" style={{ color: 'var(--color-text-subtle)' }}>Code
                            <input aria-label="Code du nouvel acte" className={`${field} w-full block mt-0.5`} style={border} maxLength={12} value={add.code} onChange={e => setAdd({ ...add, code: e.target.value })} /></label>
                        <label className="text-[11px] font-medium flex-1 min-w-[180px]" style={{ color: 'var(--color-text-subtle)' }}>Libellé
                            <input aria-label="Libellé du nouvel acte" className={`${field} w-full block mt-0.5`} style={border} maxLength={80} value={add.label} onChange={e => setAdd({ ...add, label: e.target.value })} /></label>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Catégorie
                            <select className={`${field} block mt-0.5`} style={border} value={add.category} onChange={e => setAdd({ ...add, category: e.target.value as ActCategory })}>
                                {ACT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select></label>
                        <label className="text-[11px] font-medium w-28" style={{ color: 'var(--color-text-subtle)' }}>Prix (DH)
                            <input aria-label="Prix du nouvel acte" className={`${field} w-full block mt-0.5`} style={border} inputMode="decimal" value={add.price} onChange={e => setAdd({ ...add, price: e.target.value })} /></label>
                        <button type="button" disabled={busy} onClick={addAct} className="h-9 px-3 rounded-lg text-white text-[12px] font-medium disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>Ajouter</button>
                        <button type="button" onClick={() => setAdd(null)} className="h-9 px-3 text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Annuler</button>
                    </div>
                )}
                <div className="space-y-2">
                    {sorted.map(a => <ActRow key={a.id} act={a} onGrid={setGrid} />)}
                </div>
                <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                    Catégories : {ACT_CATEGORIES.map(c => categoryLabel(c.id)).join(' · ')}.
                </p>
            </SettingsCard>

            <SettingsCard title="Remises et gratuités" description="Le motif d'une remise est toujours obligatoire. L'assistante ne peut remettre que dans la limite ci-dessous ; la gratuité totale reste réservée au médecin, sauf « Contrôle gratuit ».">
                <div className="flex flex-wrap items-end gap-4">
                    <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Plafond de remise de l'assistante (% du montant de la note)
                        <input aria-label="Plafond de remise de l'assistante" className={`${field} w-28 block mt-1`} style={border} inputMode="numeric" value={cap} onChange={e => setCap(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                    </label>
                    <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Délai de contrôle gratuit (jours, 0 = désactivé)
                        <input aria-label="Délai de contrôle gratuit" className={`${field} w-28 block mt-1`} style={border} inputMode="numeric" value={days} onChange={e => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                    </label>
                    <button type="button" disabled={!settingsDirty || busy} onClick={saveSettings} className="h-9 px-4 rounded-lg text-white text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>
                        <Save size={13} /> Enregistrer
                    </button>
                </div>
                <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                    Avec un délai, si le patient a une consultation payée dans ce délai, le contrôle gratuit est <em>proposé</em> (jamais appliqué d'office) en rappelant la date de la consultation.
                </p>
            </SettingsCard>
        </div>
    );
};

export default TariffsSettings;
