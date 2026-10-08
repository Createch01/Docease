import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import {
    KINDS, KIND_LABEL, Period, PeriodKind, addDays, canGoNext, customPeriod, getPeriod, mondayOf, monthsOf, parseDay, periodAround,
    periodLabel, periodToday, setPeriod, shiftPeriod, subscribePeriod, validateCustom,
} from '../../utils/period';
import { localDateStr, todayLocal } from '../../utils/localDate';
import { accountingService } from '../../services/accountingService';
import { periodService } from '../../services/expenseService';
import { sessionService } from '../../services/sessionService';

// Sélecteur de période PARTAGÉ (Aperçu, Journal des recettes, Dépenses, Patients). La période est mémorisée pour la
// session (utils/period.ts, jamais dans le stockage chiffré). Aucun montant ici : seulement des bornes AAAA-MM-JJ.

export const usePeriod = (): Period => useSyncExternalStore(subscribePeriod, () => getPeriod(todayLocal()));

const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;
const btn = 'h-9 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--color-surface-alt)]';
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ─── Calendrier (jour ou semaine) ────────────────────────────────────────────

const Calendar: React.FC<{ value: Period; weekMode: boolean; today: string; onPick: (day: string) => void }> = ({ value, weekMode, today, onPick }) => {
    const [month, setMonth] = useState(value.to.slice(0, 7));
    const first = `${month}-01`;
    const start = mondayOf(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const [y, m] = month.split('-').map(Number);
    const shift = (n: number) => setMonth(localDateStr(new Date(y, m - 1 + n, 1)).slice(0, 7));
    return (
        <div className="w-[272px]">
            <div className="flex items-center justify-between mb-2">
                <button type="button" aria-label="Mois précédent" className={`${btn} w-8 !h-8`} style={border} onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
                <span className="text-[13px] font-medium capitalize">{new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
                <button type="button" aria-label="Mois suivant" className={`${btn} w-8 !h-8`} style={border} onClick={() => shift(1)} disabled={`${month}` >= today.slice(0, 7)}><ChevronRight size={15} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] mb-1" style={{ color: 'var(--color-text-subtle)' }}>{WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map(d => {
                    const inMonth = d.slice(0, 7) === month;
                    const future = d > today;
                    const selected = d >= value.from && d <= value.to;
                    return (
                        <button key={d} type="button" disabled={future} onClick={() => onPick(d)}
                            className="h-8 text-[13px] rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                                color: inMonth ? 'var(--color-text)' : 'var(--color-text-faint)',
                                background: selected ? 'var(--color-primary)' : d === today ? 'var(--color-primary-50)' : 'transparent',
                                ...(selected ? { color: '#fff' } : {}),
                                borderRadius: weekMode && selected ? (d === value.from ? '6px 0 0 6px' : d === value.to ? '0 6px 6px 0' : 0) : 6,
                            }}>
                            {Number(d.slice(8))}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Sélecteur ───────────────────────────────────────────────────────────────

const PeriodSelector: React.FC = () => {
    const period = usePeriod();
    const today = todayLocal();
    const [open, setOpen] = useState(false);
    const [years, setYears] = useState<number[]>([Number(today.slice(0, 4))]);
    const [pickYear, setPickYear] = useState(Number(period.to.slice(0, 4)));
    const [customFrom, setCustomFrom] = useState(period.from);
    const [customTo, setCustomTo] = useState(period.to);
    const [closed, setClosed] = useState<string[]>([]);
    const box = useRef<HTMLDivElement>(null);

    // Années ayant des écritures (calculées par Rust) + année courante.
    useEffect(() => {
        const thisYear = Number(today.slice(0, 4));
        accountingService.summary('2000-01-01', `${thisYear}-12-31`, 'year').then(s => {
            const active = s.buckets.filter(b => b.paymentsCount > 0 || b.refundsCents > 0 || b.invoicedCount > 0 || b.expensesCents > 0).map(b => Number(b.key));
            setYears(Array.from(new Set([...active, thisYear])).sort((a, b) => b - a));
        }).catch(() => undefined);
    }, [today]);

    useEffect(() => { if (sessionService.isMedecin()) periodService.list().then(v => setClosed(v.closed)).catch(() => setClosed([])); }, [period]);

    useEffect(() => { setCustomFrom(period.from); setCustomTo(period.to); setPickYear(Number(period.to.slice(0, 4))); }, [period]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const closedInPeriod = useMemo(() => monthsOf(period).filter(m => closed.includes(m)), [period, closed]);
    const customError = period.kind === 'custom' || open ? validateCustom(customFrom, customTo) : null;

    const changeKind = (kind: PeriodKind) => {
        if (kind === period.kind) { setOpen(o => !o); return; }
        if (kind === 'custom') {
            const to = period.to > today ? today : period.to; // une période personnalisée ne se termine pas dans le futur
            setPeriod(validateCustom(period.from, to) === null ? { kind: 'custom', from: period.from, to } : periodToday('custom', today));
            setOpen(true);
            return;
        }
        const anchor = period.to > today ? today : period.to;
        setPeriod(periodAround(kind, anchor));
        setOpen(false);
    };
    const go = (dir: -1 | 1) => setPeriod(shiftPeriod(period, dir));
    const choose = (p: Period) => { setPeriod(p); setOpen(false); };

    return (
        <div className="flex flex-wrap items-center gap-3" ref={box}>
            <div className="inline-flex rounded-lg border bg-white p-0.5 whitespace-nowrap" style={border} role="group" aria-label="Type de période">
                {KINDS.map(k => (
                    <button key={k} type="button" onClick={() => changeKind(k)} aria-pressed={period.kind === k}
                        className="h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors"
                        style={period.kind === k ? { background: 'var(--color-primary)', color: '#fff' } : { color: 'var(--color-text-muted)' }}>
                        {KIND_LABEL[k]}
                    </button>
                ))}
            </div>

            <div className="inline-flex items-center gap-1.5 relative">
                <button type="button" aria-label="Période précédente" className={`${btn} w-9`} style={border} onClick={() => go(-1)}><ChevronLeft size={16} /></button>
                <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
                    className={`${btn} px-3 min-w-[196px] justify-between`} style={border}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap"><CalendarDays size={15} /> {periodLabel(period)}</span>
                </button>
                <button type="button" aria-label="Période suivante" className={`${btn} w-9`} style={border} onClick={() => go(1)} disabled={!canGoNext(period, today)}><ChevronRight size={16} /></button>
                <button type="button" className={`${btn} px-3`} style={border} onClick={() => setPeriod(periodToday(period.kind, today, period))}>Aujourd'hui</button>

                {open && (
                    <div role="dialog" aria-label="Choisir la période" className="absolute left-0 top-11 z-40 bg-white rounded-xl border shadow-xl p-3" style={border}>
                        {(period.kind === 'day' || period.kind === 'week') && (
                            <Calendar value={period} weekMode={period.kind === 'week'} today={today}
                                onPick={d => choose(period.kind === 'week' ? periodAround('week', d) : periodAround('day', d))} />
                        )}
                        {period.kind === 'month' && (
                            <div className="w-[272px]">
                                <div className="flex items-center justify-between mb-2">
                                    <button type="button" aria-label="Année précédente" className={`${btn} w-8 !h-8`} style={border} onClick={() => setPickYear(y => y - 1)}><ChevronLeft size={15} /></button>
                                    <span className="text-[13px] font-medium">{pickYear}</span>
                                    <button type="button" aria-label="Année suivante" className={`${btn} w-8 !h-8`} style={border} onClick={() => setPickYear(y => y + 1)} disabled={pickYear >= Number(today.slice(0, 4))}><ChevronRight size={15} /></button>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {MONTHS.map((label, i) => {
                                        const key = `${pickYear}-${String(i + 1).padStart(2, '0')}`;
                                        const future = `${key}-01` > today;
                                        const selected = period.from.slice(0, 7) === key;
                                        return (
                                            <button key={key} type="button" disabled={future} onClick={() => choose(periodAround('month', `${key}-01`))}
                                                className="h-9 rounded-md text-[13px] disabled:opacity-30 disabled:cursor-not-allowed capitalize"
                                                style={selected ? { background: 'var(--color-primary)', color: '#fff' } : { color: 'var(--color-text)', background: 'var(--color-surface-alt)' }}>
                                                {label}{closed.includes(key) && <Lock size={11} className="inline ml-1 -mt-0.5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {period.kind === 'year' && (
                            <div className="w-[200px]">
                                <p className="text-[12px] mb-2" style={{ color: 'var(--color-text-subtle)' }}>Années avec des écritures</p>
                                <ul className="max-h-56 overflow-y-auto space-y-1">
                                    {years.map(y => (
                                        <li key={y}>
                                            <button type="button" onClick={() => choose(periodAround('year', `${y}-01-01`))} className="w-full h-9 rounded-md text-[13px] text-left px-3"
                                                style={period.from.startsWith(String(y)) ? { background: 'var(--color-primary)', color: '#fff' } : { background: 'var(--color-surface-alt)', color: 'var(--color-text)' }}>
                                                {y}{y === Number(today.slice(0, 4)) ? ' (en cours)' : ''}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {period.kind === 'custom' && (
                            <div className="w-[272px] space-y-3">
                                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Du
                                    <input type="date" max={today} className="h-9 px-2.5 rounded-lg border text-[13px] outline-none bg-white block w-full mt-1" style={border} value={customFrom} onChange={e => setCustomFrom(e.target.value)} /></label>
                                <label className="block text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Au
                                    <input type="date" min={customFrom} max={today} className="h-9 px-2.5 rounded-lg border text-[13px] outline-none bg-white block w-full mt-1" style={border} value={customTo} onChange={e => setCustomTo(e.target.value)} /></label>
                                {customError && <p role="alert" className="text-[12px]" style={{ color: 'var(--color-danger-700)' }}>{customError}</p>}
                                <button type="button" disabled={!!customError || !parseDay(customFrom)} onClick={() => choose(customPeriod(customFrom, customTo))}
                                    className="h-9 w-full rounded-lg text-white text-[13px] font-medium disabled:opacity-40" style={{ background: 'var(--color-primary)' }}>Appliquer</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {closedInPeriod.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-[12px] font-medium whitespace-nowrap" title={closedInPeriod.join(', ')}
                    style={{ background: 'var(--color-warning-50, #fffbeb)', color: 'var(--color-warning-800, #92400e)' }}>
                    <Lock size={13} /> Mois clôturé
                </span>
            )}
        </div>
    );
};

export default PeriodSelector;
