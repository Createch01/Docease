import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, UserPlus, UserCircle, X } from 'lucide-react';
import type { Patient } from '../../types';
import { normalizeText } from '../../services/medicalReferentials';

interface PatientPickerProps {
    /** Tous les dossiers (la recherche est locale). */
    patients: Patient[];
    /** Patients de la salle d'attente, proposés avant toute saisie. */
    queue?: Patient[];
    /** Patient actuellement choisi (affiche la carte à la place de la recherche). */
    selected?: { id: string; name: string; phone?: string; /** ex. « Homme · 27 ans » */ meta?: string; metaAction?: { label: string; onClick: () => void } } | null;
    onSelect: (patient: Patient) => void;
    /** « + Nouveau patient » : reçoit le texte déjà saisi (nom). */
    onNew: (typed: string) => void;
    onClear: () => void;
    label: string;
    placeholder?: string;
}

const digits = (s: string) => s.replace(/\D+/g, '');

export function searchPatientList(patients: Patient[], query: string, limit = 8): Patient[] {
    const q = normalizeText(query);
    const d = digits(query);
    if (!q && !d) return [];
    return patients
        .filter(p => (q && normalizeText(p.name || '').includes(q)) || (d.length >= 3 && digits(p.phone || '').includes(d)))
        .slice(0, limit);
}

/**
 * Recherche d'un patient existant (nom ou téléphone) avec « + Nouveau patient ».
 * Clavier : ↑ ↓ Entrée Échap.
 */
const PatientPicker: React.FC<PatientPickerProps> = ({ patients, queue = [], selected, onSelect, onNew, onClear, label, placeholder }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const boxRef = useRef<HTMLDivElement>(null);
    const listId = useMemo(() => `pp-${Math.random().toString(36).slice(2, 8)}`, []);

    const results = useMemo(() => {
        if (query.trim()) return searchPatientList(patients, query);
        return queue.slice(0, 8);
    }, [patients, queue, query]);

    // Dernière ligne : « + Nouveau patient ».
    const rows = results.length + 1;
    const newIndex = results.length;

    useEffect(() => { setActive(-1); }, [query]);
    useEffect(() => {
        const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const pick = (p: Patient) => { setQuery(''); setOpen(false); onSelect(p); };
    const createNew = () => { const typed = query.trim(); setQuery(''); setOpen(false); onNew(typed); };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => (a + 1) % rows); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? rows - 1 : a - 1)); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (active === newIndex) createNew();
            else if (active >= 0 && results[active]) pick(results[active]);
            else if (results.length === 1) pick(results[0]);
        } else if (e.key === 'Escape') {
            if (open) { e.stopPropagation(); setOpen(false); setActive(-1); }
        }
    };

    if (selected) {
        return (
            <div>
                <span className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>{label}</span>
                <div className="h-10 pl-3 pr-1 rounded-md border bg-white flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="flex items-center gap-2 min-w-0 text-[14px]" style={{ color: 'var(--color-text)' }}>
                        <UserCircle size={16} style={{ color: 'var(--color-text-subtle)' }} />
                        <span className="truncate font-medium" title={selected.name}>{selected.name}</span>
                        {[selected.phone, selected.meta].filter(Boolean).map((x, i) => <span key={i} className="text-[12px] shrink-0" style={{ color: 'var(--color-text-subtle)' }}>· {x}</span>)}
                        {selected.metaAction && <button type="button" onClick={selected.metaAction.onClick} className="text-[11px] font-medium hover:underline shrink-0" style={{ color: 'var(--color-primary)' }}>{selected.metaAction.label}</button>}
                    </span>
                    <button type="button" onClick={onClear} aria-label="Changer de patient" title="Changer de patient"
                        className="h-8 px-2 rounded-md text-[12px] font-medium whitespace-nowrap flex items-center gap-1 hover:bg-slate-50"
                        style={{ color: 'var(--color-text-muted)' }}>
                        <X size={13} /> Changer
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div ref={boxRef} className="relative">
            <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>{label}</label>
            <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-faint)' }} />
                <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                    className="w-full h-10 pl-9 pr-3 rounded-md border text-[14px] outline-none bg-white"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
            </div>
            {open && (
                <ul id={listId} role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg z-50 overflow-hidden max-h-80 overflow-y-auto"
                    style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                    {!query.trim() && results.length > 0 && (
                        <li role="presentation" className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-subtle)' }}>Salle d'attente</li>
                    )}
                    {results.map((p, i) => (
                        <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                            onMouseDown={e => { e.preventDefault(); pick(p); }}
                            onMouseEnter={() => setActive(i)}
                            className="px-3 py-2 cursor-pointer flex items-center justify-between gap-3"
                            style={{ background: i === active ? 'var(--color-row-hover)' : 'white' }}>
                            <span className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{p.name}</span>
                            <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--color-text-subtle)' }}>
                                {[p.age ? `${p.age} ans` : null, p.phone].filter(Boolean).join(' · ')}
                            </span>
                        </li>
                    ))}
                    {query.trim() && results.length === 0 && (
                        <li role="presentation" className="px-3 py-2 text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Aucun patient trouvé.</li>
                    )}
                    <li id={`${listId}-${newIndex}`} role="option" aria-selected={active === newIndex}
                        onMouseDown={e => { e.preventDefault(); createNew(); }}
                        onMouseEnter={() => setActive(newIndex)}
                        className="px-3 py-2.5 cursor-pointer flex items-center gap-2 border-t text-[13px] font-medium whitespace-nowrap"
                        style={{ borderColor: 'var(--color-border)', background: active === newIndex ? 'var(--color-row-hover)' : 'white', color: 'var(--color-primary)' }}>
                        <UserPlus size={14} /> Nouveau patient{query.trim() ? ` « ${query.trim()} »` : ''}
                    </li>
                </ul>
            )}
        </div>
    );
};

export default PatientPicker;
