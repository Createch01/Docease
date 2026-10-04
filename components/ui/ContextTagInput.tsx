import React, { useMemo, useRef, useState, useEffect } from 'react';
import { X, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { ContextEntry } from '../../types';
import {
    ContextKind, MIN_QUERY_LENGTH, SuggestItem, findExactRef, groupItems, itemMatches, loadUsage, makeEntry,
    makeFreeTextEntry, normalizeText, recordUsage, suggestedItems, toSuggestItems,
} from '../../services/medicalReferentials';

interface ContextTagInputProps {
    kind: ContextKind;
    entries: ContextEntry[];
    onChange: (next: ContextEntry[]) => void;
    /** Spécialité du médecin (ex. « cardiologie ») : sert uniquement à ordonner les suggestions. */
    specialty?: string;
    placeholder?: string;
    ariaLabel: string;
    /** Contenu additionnel affiché dans chaque pastille (ex. choix de la réaction d'une allergie). */
    renderChipExtra?: (entry: ContextEntry, index: number) => React.ReactNode;
    /** Teinte des pastilles. */
    tone?: 'danger' | 'neutral';
    disabled?: boolean;
}

const TONES = {
    danger: { bg: 'var(--color-danger-100)', fg: 'var(--color-danger-700)', border: 'var(--color-danger-100)' },
    neutral: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary)', border: 'var(--color-primary-100)' },
} as const;

/** Ligne navigable du panneau : un élément du référentiel (à cocher / décocher) ou l'ajout de texte libre. */
type Row = { type: 'ref'; item: SuggestItem } | { type: 'free'; text: string };

/**
 * Saisie à pastilles avec panneau de suggestions au clic (sans taper), « Voir tout » par catégorie,
 * filtre par accents / synonymes dès 2 caractères, ↑ ↓ Entrée Échap, texte libre « non codé ».
 * Un clic ajoute, un second retire ; les éléments déjà choisis apparaissent cochés.
 */
const ContextTagInput: React.FC<ContextTagInputProps> = ({
    kind, entries, onChange, specialty, placeholder, ariaLabel, renderChipExtra, tone = 'neutral', disabled,
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [active, setActive] = useState(-1);
    const [usage, setUsage] = useState(() => loadUsage(kind));
    const boxRef = useRef<HTMLDivElement>(null);
    const items = useMemo(() => toSuggestItems(kind), [kind]);
    const listId = useMemo(() => `ctx-${kind}-${Math.random().toString(36).slice(2, 8)}`, [kind]);
    const colors = TONES[tone];
    const selectedRefs = useMemo(() => new Set(entries.filter(e => e.ref).map(e => e.ref as string)), [entries]);

    const q = query.trim();
    const filtering = normalizeText(q).length >= MIN_QUERY_LENGTH;

    /** Sections affichées (et, dans le même ordre, lignes navigables au clavier). */
    const sections = useMemo(() => {
        if (filtering) {
            const matches = items.filter(i => itemMatches(i, q))
                .sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0)
                    || (specialty ? (a.specialtyRank?.[specialty] ?? 99) - (b.specialtyRank?.[specialty] ?? 99) : 0)
                    || a.label.localeCompare(b.label, 'fr'));
            return [{ key: 'results', label: '', items: matches }];
        }
        if (showAll) return groupItems(items, kind, usage);
        return [{ key: 'frequent', label: kind === 'allergy' ? 'Les plus fréquentes' : 'Les plus fréquentes pour votre spécialité', items: suggestedItems(items, kind, usage, specialty) }];
    }, [filtering, q, items, usage, showAll, kind, specialty]);

    const rows: Row[] = useMemo(() => {
        const refs: Row[] = sections.flatMap(s => s.items.map(item => ({ type: 'ref', item }) as Row));
        if (!filtering) return refs;
        const alreadyFree = entries.some(e => normalizeText(e.label) === normalizeText(q));
        return findExactRef(kind, q) || alreadyFree ? refs : [...refs, { type: 'free', text: q }];
    }, [sections, filtering, entries, q, kind]);

    useEffect(() => { setActive(-1); }, [q, showAll]);

    useEffect(() => {
        const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    // Garde l'élément actif visible pendant la navigation au clavier.
    useEffect(() => {
        if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, listId]);

    const toggleRef = (item: SuggestItem) => {
        if (selectedRefs.has(item.id)) {
            onChange(entries.filter(e => e.ref !== item.id));
            return;
        }
        recordUsage(kind, item.id);
        setUsage(loadUsage(kind));
        onChange([...entries, makeEntry(kind, { id: item.id, label: item.label })]);
    };

    const addFree = (text: string) => {
        const label = text.trim();
        if (!label) return;
        const exact = findExactRef(kind, label);
        if (exact) {
            if (!selectedRefs.has(exact.id)) {
                recordUsage(kind, exact.id);
                setUsage(loadUsage(kind));
                onChange([...entries, makeEntry(kind, exact)]);
            }
        } else if (!entries.some(e => normalizeText(e.label) === normalizeText(label))) {
            onChange([...entries, makeFreeTextEntry(label)]);
        }
        setQuery('');
    };

    const activate = (row: Row) => (row.type === 'ref' ? toggleRef(row.item) : addFree(row.text));

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            if (!rows.length) return;
            setActive(a => (e.key === 'ArrowDown' ? (a + 1) % rows.length : a <= 0 ? rows.length - 1 : a - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0 && rows[active]) activate(rows[active]);
            else if (q) addFree(q);
        } else if (e.key === 'Escape') {
            if (open) { e.stopPropagation(); setOpen(false); setActive(-1); }
        } else if (e.key === 'Backspace' && !query && entries.length) {
            onChange(entries.slice(0, -1));
        }
    };

    const remove = (index: number) => onChange(entries.filter((_, i) => i !== index));

    // Le panneau se ferme quand le focus quitte tout le composant (Tab, clic ailleurs).
    const onBlur = (e: React.FocusEvent) => {
        if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
    };

    let rowIndex = -1;
    const renderChip = (item: SuggestItem) => {
        rowIndex += 1;
        const idx = rowIndex;
        const on = selectedRefs.has(item.id);
        const isActive = idx === active;
        return (
            <li key={item.id} id={`${listId}-${idx}`} role="option" aria-selected={on}
                onMouseDown={e => { e.preventDefault(); toggleRef(item); }}
                onMouseEnter={() => setActive(idx)}
                title={item.code ? `${item.label} (${item.code})` : item.label}
                className="h-8 pl-2.5 pr-3 rounded-md border text-[12px] font-medium whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 select-none transition-colors"
                style={{
                    background: on ? colors.bg : isActive ? 'var(--color-row-hover)' : 'white',
                    color: on ? colors.fg : 'var(--color-text-muted)',
                    borderColor: on ? colors.fg : isActive ? 'var(--color-primary)' : 'var(--color-border)',
                    outline: isActive ? '2px solid var(--color-primary-100)' : 'none',
                }}>
                <span className="w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0"
                    style={{ borderColor: on ? colors.fg : 'var(--color-border)', background: on ? colors.fg : 'white', color: 'white' }}>
                    {on && <Check size={10} strokeWidth={3} />}
                </span>
                {item.short ?? item.label}
            </li>
        );
    };

    const showPanel = open && !disabled;

    return (
        <div ref={boxRef} className="relative space-y-2" onBlur={onBlur}>
            {entries.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label={ariaLabel}>
                    {entries.map((e, i) => (
                        <li key={`${e.ref ?? 'free'}-${e.label}-${i}`} className="flex items-center gap-1.5 pl-2.5 pr-1 h-7 rounded-md border text-[12px] font-medium"
                            style={{ background: e.coded ? colors.bg : 'white', color: colors.fg, borderColor: e.coded ? colors.border : 'var(--color-warning-hover)' }}>
                            {!e.coded && (
                                <span title="Non codé — non vérifié automatiquement" aria-label="Non codé, non vérifié automatiquement" role="img" className="flex">
                                    <AlertTriangle size={12} style={{ color: 'var(--color-warning-hover)' }} />
                                </span>
                            )}
                            <span>{e.label}</span>
                            {renderChipExtra?.(e, i)}
                            {!disabled && (
                                <button type="button" onClick={() => remove(i)} aria-label={`Retirer ${e.label}`}
                                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-black/10">
                                    <X size={12} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <input
                type="text"
                value={query}
                disabled={disabled}
                onChange={e => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onClick={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                role="combobox"
                aria-label={ariaLabel}
                aria-expanded={showPanel}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--color-border)' }}
            />

            {showPanel && (
                <div className="absolute left-0 right-0 min-w-[320px] top-full mt-1 bg-white border rounded-lg z-50 flex flex-col"
                    style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                    <div id={listId} role="listbox" aria-multiselectable="true" aria-label={`Suggestions : ${ariaLabel}`} className="space-y-3 p-3 overflow-y-auto max-h-[min(18rem,45vh)]">
                        {sections.map(section => (
                            <div key={section.key} role="presentation">
                                {section.label && (
                                    <div role="presentation" className="mb-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-text-subtle)', letterSpacing: '0.06em' }}>
                                        {section.label}
                                    </div>
                                )}
                                {section.items.length > 0
                                    ? <ul role="presentation" className="flex flex-wrap gap-1.5">{section.items.map(renderChip)}</ul>
                                    : <div role="presentation" className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>Aucun résultat dans le référentiel.</div>}
                            </div>
                        ))}
                        {rows.length > 0 && rows[rows.length - 1].type === 'free' && (() => {
                            const free = rows[rows.length - 1] as Extract<Row, { type: 'free' }>;
                            const idx = rows.length - 1;
                            return (
                                <div key="free" id={`${listId}-${idx}`} role="option" aria-selected={false}
                                    onMouseDown={e => { e.preventDefault(); addFree(free.text); }}
                                    onMouseEnter={() => setActive(idx)}
                                    className="h-9 px-2.5 rounded-md border border-dashed text-[12px] cursor-pointer flex items-center gap-1.5 whitespace-nowrap overflow-hidden"
                                    style={{ background: idx === active ? 'var(--color-row-hover)' : 'white', color: 'var(--color-text-muted)', borderColor: 'var(--color-warning-hover)' }}>
                                    <AlertTriangle size={12} className="shrink-0" style={{ color: 'var(--color-warning-hover)' }} />
                                    <span className="truncate">Ajouter « {free.text} » (non codé)</span>
                                </div>
                            );
                        })()}
                    </div>
                    {!filtering && (
                        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowAll(v => !v)}
                            className="h-9 px-3 border-t text-[12px] font-medium whitespace-nowrap flex items-center gap-1 hover:bg-slate-50 rounded-b-lg"
                            style={{ color: 'var(--color-primary)', borderColor: 'var(--color-border)' }}>
                            {showAll ? <><ChevronUp size={13} /> Afficher les plus fréquentes</> : <><ChevronDown size={13} /> Voir tout</>}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default ContextTagInput;
