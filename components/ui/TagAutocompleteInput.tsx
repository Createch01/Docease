import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';

interface TagAutocompleteInputProps {
  options: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  otherTags?: string[];
  onOtherTagsChange?: (tags: string[]) => void;
  placeholder?: string;
  otherHint?: string;
  accent?: 'emerald' | 'rose' | 'amber';
  icon?: React.ReactNode;
  size?: 'default' | 'compact';
}

const normalize = (s: string) =>
  s
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const TagAutocompleteInput: React.FC<TagAutocompleteInputProps> = ({
  options,
  selectedTags = [],
  onTagsChange,
  otherTags = [],
  onOtherTagsChange,
  placeholder,
  otherHint,
  accent = 'emerald',
  icon,
  size = 'default',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter available options:
  // - Au clic/focus : afficher toutes les options disponibles (non encore sélectionnées)
  // - Dès la saisie : filtrage instantané insensible à la casse et aux accents par début du mot
  const suggestions = useMemo(() => {
    const unselected = options.filter((opt) => !selectedTags.includes(opt));
    const q = normalize(query);
    if (!q) {
      return unselected;
    }
    return unselected.filter((opt) => normalize(opt).startsWith(q));
  }, [query, options, selectedTags]);

  const exactMatch = options.some((opt) => normalize(opt) === normalize(query));

  // Fermeture automatique au clic à l'extérieur
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Défilement automatique de l'élément surligné
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-suggestion-item]');
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const addTag = (tag: string) => {
    if (!selectedTags.includes(tag)) {
      onTagsChange([...selectedTags, tag]);
    }
    setQuery('');
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const addOther = () => {
    const val = query.trim();
    if (!val || !onOtherTagsChange) return;
    if (!otherTags.includes(val)) {
      onOtherTagsChange([...otherTags, val]);
    }
    setQuery('');
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onTagsChange(selectedTags.filter((t) => t !== tag));
  };

  const removeOther = (tag: string) => {
    if (onOtherTagsChange) {
      onOtherTagsChange(otherTags.filter((t) => t !== tag));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        addTag(suggestions[highlightedIndex]);
      } else if (suggestions.length > 0 && query.trim()) {
        addTag(suggestions[0]);
      } else if (!exactMatch && query.trim() && onOtherTagsChange) {
        addOther();
      }
    }
  };

  // Mise en valeur du préfixe saisi dans les suggestions
  const renderOptionLabel = (option: string) => {
    const qTrim = query.trim();
    if (!qTrim) {
      return <span>{option}</span>;
    }
    const qNorm = normalize(qTrim);
    const optNorm = normalize(option);
    if (!optNorm.startsWith(qNorm)) {
      return <span>{option}</span>;
    }

    let matchLen = 0;
    for (let i = 1; i <= option.length; i++) {
      if (normalize(option.slice(0, i)) === qNorm || normalize(option.slice(0, i)).startsWith(qNorm)) {
        matchLen = i;
        break;
      }
    }
    if (matchLen === 0) {
      matchLen = Math.min(qTrim.length, option.length);
    }
    const prefix = option.slice(0, matchLen);
    const suffix = option.slice(matchLen);

    return (
      <span>
        <span className="font-bold underline decoration-current/30 underline-offset-2">
          {prefix}
        </span>
        <span>{suffix}</span>
      </span>
    );
  };

  const ring = accent === 'rose'
    ? 'focus:ring-rose-500/10 focus:border-rose-400'
    : accent === 'amber'
    ? 'focus:ring-amber-500/10 focus:border-amber-400'
    : 'focus:ring-emerald-500/10 focus:border-emerald-400';

  const bg = accent === 'rose'
    ? 'bg-rose-50/40 border-rose-200'
    : accent === 'amber'
    ? 'bg-amber-50/40 border-amber-200'
    : 'bg-slate-50/50 border-slate-200';

  const chipBg = accent === 'rose'
    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/60'
    : accent === 'amber'
    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/60'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/60';

  const itemHover = accent === 'rose'
    ? 'hover:bg-rose-50 hover:text-rose-900'
    : accent === 'amber'
    ? 'hover:bg-amber-50 hover:text-amber-900'
    : 'hover:bg-emerald-50 hover:text-emerald-900';

  const itemSelected = accent === 'rose'
    ? 'bg-rose-50 text-rose-900 font-semibold'
    : accent === 'amber'
    ? 'bg-amber-50 text-amber-900 font-semibold'
    : 'bg-emerald-50 text-emerald-900 font-semibold';

  const isCompact = size === 'compact';
  const inputSizing = isCompact
    ? `h-10 ${icon ? 'pl-9' : 'pl-3'} pr-8 rounded-md focus:ring-2 font-medium text-[13px]`
    : `py-3.5 ${icon ? 'pl-12' : 'pl-4'} pr-8 rounded-xl focus:ring-4 font-semibold text-sm`;
  const iconInset = isCompact ? 'left-3' : 'left-4';

  const chipSizing = isCompact
    ? 'px-2.5 py-1 rounded-md text-[11px] font-medium'
    : 'px-3 py-1.5 rounded-lg text-xs font-semibold';

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <div className="relative">
        <div className={`absolute inset-y-0 ${iconInset} flex items-center pointer-events-none`}>
          {icon}
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onClick={() => {
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full ${inputSizing} ${bg} border ${ring} outline-none text-slate-900 placeholder-slate-400 transition-all`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setHighlightedIndex(-1);
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
            title="Effacer"
          >
            <X size={14} />
          </button>
        )}

        {/* Dropdown sous le champ */}
        {isOpen && (
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in duration-100"
            style={{ minWidth: '220px' }}
          >
            {/* Entête discrète du dropdown */}
            <div className="px-3 py-1.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>
                {suggestions.length} disponible{suggestions.length > 1 ? 's' : ''}
              </span>
              {query.trim() && (
                <span className="text-[10px] text-slate-400 truncate max-w-[130px]">
                  Début : « {query.trim()} »
                </span>
              )}
            </div>

            {/* Liste défilable des suggestions */}
            <div ref={listRef} className="max-h-60 overflow-y-auto divide-y divide-slate-50">
              {suggestions.map((opt, idx) => {
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={opt}
                    data-suggestion-item
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => addTag(opt)}
                    className={`w-full px-3 py-2 text-left text-[13px] transition-colors flex items-center justify-between ${
                      isHighlighted ? itemSelected : `text-slate-700 ${itemHover}`
                    }`}
                  >
                    <span>{renderOptionLabel(opt)}</span>
                    <Plus size={13} className="text-slate-400 opacity-60 ml-2 shrink-0" />
                  </button>
                );
              })}

              {suggestions.length === 0 && (
                <div className="px-3 py-4 text-center text-[12px] text-slate-400">
                  Aucun résultat commençant par « {query.trim()} »
                </div>
              )}

              {!exactMatch && query.trim() && onOtherTagsChange && (
                <button
                  type="button"
                  onClick={addOther}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 text-[12px] font-medium text-slate-500 flex items-center gap-2 border-t border-slate-100 bg-slate-50/50"
                >
                  <Plus size={13} className="text-slate-400 shrink-0" />
                  <span>{otherHint || 'Ajouter'} "{query.trim()}" (Autre — non structuré)</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Badges / Chips des sélections */}
      {(selectedTags.length > 0 || (otherTags && otherTags.length > 0)) && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1.5 border transition-all ${chipSizing} ${chipBg}`}
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="hover:opacity-75 focus:outline-none p-0.5 rounded hover:bg-black/5 inline-flex items-center justify-center transition-opacity"
                title={`Supprimer ${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {otherTags && otherTags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1.5 border border-dashed border-slate-300 bg-slate-50 text-slate-600 transition-all ${chipSizing}`}
            >
              <span>{tag}</span>
              <span className="text-[9px] text-slate-400 font-normal">(non structuré)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeOther(tag);
                }}
                className="hover:opacity-75 focus:outline-none p-0.5 rounded hover:bg-black/5 inline-flex items-center justify-center transition-opacity"
                title={`Supprimer ${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagAutocompleteInput;
