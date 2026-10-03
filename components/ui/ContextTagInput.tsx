import React, { useMemo, useRef, useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { ContextEntry } from '../../types';
import {
    ContextKind, MIN_QUERY_LENGTH, SuggestItem, findExactRef, loadUsage, makeEntry, makeFreeTextEntry,
    normalizeText, recordUsage, searchSuggestions, toSuggestItems,
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

type Option = { type: 'ref'; item: SuggestItem } | { type: 'free'; text: string };

/**
 * Saisie à pastilles avec autocomplétion sur un référentiel local.
 * Suggestions dès 2 caractères, ↑ ↓ Entrée Échap, texte libre autorisé mais marqué « non codé ».
 */
const ContextTagInput: React.FC<ContextTagInputProps> = ({
    kind, entries, onChange, specialty, placeholder, ariaLabel, renderChipExtra, tone = 'neutral', disabled,
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [usage, setUsage] = useState(() => loadUsage(kind));
    const boxRef = useRef<HTMLDivElement>(null);
    const items = useMemo(() => toSuggestItems(kind), [kind]);
    const listId = useMemo(() => `ctx-${kind}-${Math.random().toString(36).slice(2, 8)}`, [kind]);
    const colors = TONES[tone];

    const q = query.trim();
    const options: Option[] = useMemo(() => {
        if (normalizeText(q).length < MIN_QUERY_LENGTH) return [];
        const exclude = entries.filter(e => e.ref).map(e => e.ref as string);
        const refs = searchSuggestions(items, q, { usage, specialty, exclude }).map(item => ({ type: 'ref', item }) as Option);
        const alreadyFree = entries.some(e => normalizeText(e.label) === normalizeText(q));
        const exact = findExactRef(kind, q);
        return exact || alreadyFree ? refs : [...refs, { type: 'free', text: q }];
    }, [q, items, usage, specialty, entries, kind]);

    useEffect(() => { setActive(-1); }, [q]);

    useEffect(() => {
        const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const reset = () => { setQuery(''); setOpen(false); setActive(-1); };

    const addRef = (item: SuggestItem) => {
        if (entries.some(e => e.ref === item.id)) { reset(); return; }
        recordUsage(kind, item.id);
        setUsage(loadUsage(kind));
        onChange([...entries, makeEntry(kind, { id: item.id, label: item.label })]);
        reset();
    };

    const addFree = (text: string) => {
        const label = text.trim();
        if (!label) return;
        const exact = findExactRef(kind, label);
        if (exact) {
            if (!entries.some(e => e.ref === exact.id)) {
                recordUsage(kind, exact.id);
                setUsage(loadUsage(kind));
                onChange([...entries, makeEntry(kind, exact)]);
            }
        } else if (!entries.some(e => normalizeText(e.label) === normalizeText(label))) {
            onChange([...entries, makeFreeTextEntry(label)]);
        }
        reset();
    };

    const choose = (o: Option) => (o.type === 'ref' ? addRef(o.item) : addFree(o.text));

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!options.length) return;
            setOpen(true);
            setActive(a => (a + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!options.length) return;
            setActive(a => (a <= 0 ? options.length - 1 : a - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0 && options[active]) choose(options[active]);
            else if (q) addFree(q);
        } else if (e.key === 'Escape') {
            if (open) { e.stopPropagation(); setOpen(false); setActive(-1); }
        } else if (e.key === 'Backspace' && !query && entries.length) {
            onChange(entries.slice(0, -1));
        }
    };

    const remove = (index: number) => onChange(entries.filter((_, i) => i !== index));

    const showList = open && options.length > 0;

    return (
        <div ref={boxRef} className="relative space-y-2">
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
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                role="combobox"
                aria-label={ariaLabel}
                aria-expanded={showList}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                className="w-full h-10 px-3 rounded-md border text-[13px] outline-none bg-white"
                style={{ borderColor: 'var(--color-border)' }}
            />

            {showList && (
                <ul id={listId} role="listbox"
                    className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg z-50 overflow-hidden max-h-64 overflow-y-auto"
                    style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                    {options.map((o, i) => (
                        <li key={o.type === 'ref' ? o.item.id : 'free'} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                            onMouseDown={e => { e.preventDefault(); choose(o); }}
                            onMouseEnter={() => setActive(i)}
                            className="px-3 py-2 text-[13px] cursor-pointer flex items-center justify-between gap-2"
                            style={{ background: i === active ? 'var(--color-row-hover)' : 'white', color: 'var(--color-text)' }}>
                            {o.type === 'ref' ? (
                                <>
                                    <span>{o.item.label}</span>
                                    {o.item.code && <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-subtle)' }}>{o.item.code}</span>}
                                </>
                            ) : (
                                <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                    <AlertTriangle size={12} style={{ color: 'var(--color-warning-hover)' }} />
                                    Ajouter « {o.text} » (non codé)
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ContextTagInput;
