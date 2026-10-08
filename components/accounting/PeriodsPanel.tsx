import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Lock, LockOpen } from 'lucide-react';
import { PeriodsView, monthLabel, periodService } from '../../services/expenseService';
import { sessionService } from '../../services/sessionService';
import { localDateStr } from '../../utils/localDate';

// Clôture de période (médecin) : un mois clôturé n'accepte plus aucune écriture datée dans ce mois (contrôle Rust).
// Seul un mois déjà terminé se clôture. La réouverture exige un motif et reste tracée.

const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;

/** Les 12 derniers mois TERMINÉS, du plus récent au plus ancien (AAAA-MM). */
const lastClosedCandidates = (): string[] => {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 12; i++) {
        d.setMonth(d.getMonth() - 1);
        out.push(localDateStr(d).slice(0, 7));
    }
    return out;
};

const PeriodsPanel: React.FC<{ from: string; to: string; refresh: number; onChanged: () => void }> = ({ from, to, refresh, onChanged }) => {
    const [view, setView] = useState<PeriodsView | null>(null);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reopen, setReopen] = useState<{ month: string; reason: string } | null>(null);

    const load = useCallback(() => { periodService.list().then(setView).catch(() => setView(null)); }, []);
    useEffect(() => { if (sessionService.isMedecin()) load(); }, [load, refresh]);

    if (!sessionService.isMedecin() || !view) return null;

    const inRange = view.closed.filter(m => m >= from.slice(0, 7) && m <= to.slice(0, 7));
    const act = async (month: string, fn: () => Promise<unknown>) => {
        setBusy(month);
        setError(null);
        try { await fn(); setReopen(null); load(); onChanged(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Opération impossible.'); }
        finally { setBusy(null); }
    };

    return (
        <div className="flex flex-col gap-2 -mt-3">
            <div className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: 'var(--color-text)' }}>
                {inRange.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md" style={{ background: 'var(--color-warning-50, #fffbeb)', color: 'var(--color-warning-800, #92400e)' }}>
                        <Lock size={13} /> {inRange.length > 1 ? 'Mois clôturés' : 'Mois clôturé'} : {inRange.map(monthLabel).join(', ')}
                    </span>
                )}
                <button type="button" onClick={() => setOpen(o => !o)} className="h-7 px-3 rounded-md border text-[12px] font-medium bg-white" style={border}>
                    {open ? 'Masquer les clôtures' : 'Clôtures de périodes'}
                </button>
            </div>
            {open && (
                <div className="bg-white rounded-lg border p-3 text-[13px] space-y-2" style={{ ...border, color: 'var(--color-text)' }}>
                    <p style={{ color: 'var(--color-text-muted)' }}>Un mois clôturé n'accepte plus aucune écriture (encaissement, remboursement, dépense, annulation) datée dans ce mois. Le mois en cours ne se clôture pas.</p>
                    {error && <p role="alert" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        {lastClosedCandidates().map(m => {
                            const closed = view.closed.includes(m);
                            return (
                                <li key={m} className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">{closed ? <Lock size={13} /> : <LockOpen size={13} />} {monthLabel(m)}</span>
                                    {busy === m ? <Loader2 size={14} className="animate-spin" /> : closed
                                        ? <button type="button" className="text-[12px] underline" onClick={() => setReopen({ month: m, reason: '' })}>Rouvrir</button>
                                        : <button type="button" className="text-[12px] underline" onClick={() => act(m, () => periodService.close(m))}>Clôturer</button>}
                                </li>
                            );
                        })}
                    </ul>
                    {reopen && (
                        <div className="p-3 rounded-md space-y-2" style={{ background: 'var(--color-bg, #f8fafc)' }}>
                            <p>Rouvrir {monthLabel(reopen.month)} : motif obligatoire (tracé au registre des clôtures).</p>
                            <input className="h-9 px-2.5 rounded-lg border text-[13px] w-full bg-white" style={border} maxLength={200} value={reopen.reason} onChange={e => setReopen({ ...reopen, reason: e.target.value })} placeholder="Ex. : facture du comptable oubliée" />
                            <div className="flex gap-2 justify-end">
                                <button type="button" className="h-8 px-3 rounded-lg border text-[12px] bg-white" style={border} onClick={() => setReopen(null)}>Retour</button>
                                <button type="button" className="h-8 px-3 rounded-lg text-white text-[12px] disabled:opacity-40" style={{ background: 'var(--color-danger)' }} disabled={reopen.reason.trim().length < 3} onClick={() => act(reopen.month, () => periodService.reopen(reopen.month, reopen.reason))}>Rouvrir le mois</button>
                            </div>
                        </div>
                    )}
                    {view.entries.length > 0 && (
                        <details>
                            <summary className="cursor-pointer text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Historique ({view.entries.length})</summary>
                            <ul className="mt-1 text-[12px]">{view.entries.slice().reverse().map(e => <li key={e.seq}>{e.date} · {e.kind === 'close' ? 'Clôture' : 'Réouverture'} de {monthLabel(e.month)} par {e.by}{e.reason ? ` — ${e.reason}` : ''}</li>)}</ul>
                        </details>
                    )}
                    {view.problems.length > 0 && <p role="alert" style={{ color: 'var(--color-danger-700)' }}>{view.problems.join(' ')}</p>}
                </div>
            )}
        </div>
    );
};

export default PeriodsPanel;
