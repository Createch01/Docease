import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, Plus, AlertTriangle, FlaskConical, Search } from 'lucide-react';

interface UnifiedMedicalTagSearchProps {
  allergyOptions: string[];
  pathologyOptions: string[];
  selectedAllergyTags: string[];
  onAllergyTagsChange: (tags: string[]) => void;
  allergyOtherTags?: string[];
  onAllergyOtherTagsChange?: (tags: string[]) => void;
  selectedPathologyTags: string[];
  onPathologyTagsChange: (tags: string[]) => void;
  pathologyOtherTags?: string[];
  onPathologyOtherTagsChange?: (tags: string[]) => void;
  placeholder?: string;
}

type FlatEntry = { type: 'allergy' | 'pathology'; label: string };

// Unicode combining diacritical marks range (U+0300–U+036F), built from code points to avoid encoding issues in source.
const COMBINING_MARKS_RE = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

const normalize = (s: string) =>
  s
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(COMBINING_MARKS_RE, '')
    .trim()
    .toUpperCase();

const UnifiedMedicalTagSearch: React.FC<UnifiedMedicalTagSearchProps> = ({
  allergyOptions,
  pathologyOptions,
  selectedAllergyTags = [],
  onAllergyTagsChange,
  allergyOtherTags = [],
  onAllergyOtherTagsChange,
  selectedPathologyTags = [],
  onPathologyTagsChange,
  pathologyOtherTags = [],
  onPathologyOtherTagsChange,
  placeholder,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const q = normalize(query);

  const allergyMatches = useMemo(() => {
    const unselected = allergyOptions.filter((opt) => !selectedAllergyTags.includes(opt));
    if (!q) return unselected;
    return unselected.filter((opt) => normalize(opt).startsWith(q));
  }, [q, allergyOptions, selectedAllergyTags]);

  const pathologyMatches = useMemo(() => {
    const unselected = pathologyOptions.filter((opt) => !selectedPathologyTags.includes(opt));
    if (!q) return unselected;
    return unselected.filter((opt) => normalize(opt).startsWith(q));
  }, [q, pathologyOptions, selectedPathologyTags]);

  const flatList: FlatEntry[] = useMemo(() => [
    ...allergyMatches.map((label) => ({ type: 'allergy' as const, label })),
    ...pathologyMatches.map((label) => ({ type: 'pathology' as const, label })),
  ], [allergyMatches, pathologyMatches]);

  const exactMatch =
    allergyOptions.some((opt) => normalize(opt) === q) ||
    pathologyOptions.some((opt) => normalize(opt) === q);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-suggestion-item]');
      if (items[highlightedIndex]) {
        (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const addEntry = (entry: FlatEntry) => {
    if (entry.type === 'allergy') {
      if (!selectedAllergyTags.includes(entry.label)) {
        onAllergyTagsChange([...selectedAllergyTags, entry.label]);
      }
    } else {
      if (!selectedPathologyTags.includes(entry.label)) {
        onPathologyTagsChange([...selectedPathologyTags, entry.label]);
      }
    }
    setQuery('');
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const addOther = (type: 'allergy' | 'pathology') => {
    const val = query.trim();
    if (!val) return;
    if (type === 'allergy' && onAllergyOtherTagsChange) {
      if (!allergyOtherTags.includes(val)) onAllergyOtherTagsChange([...allergyOtherTags, val]);
    } else if (type === 'pathology' && onPathologyOtherTagsChange) {
      if (!pathologyOtherTags.includes(val)) onPathologyOtherTagsChange([...pathologyOtherTags, val]);
    }
    setQuery('');
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const removeAllergy = (tag: string) => onAllergyTagsChange(selectedAllergyTags.filter((t) => t !== tag));
  const removePathology = (tag: string) => onPathologyTagsChange(selectedPathologyTags.filter((t) => t !== tag));
  const removeAllergyOther = (tag: string) => onAllergyOtherTagsChange && onAllergyOtherTagsChange(allergyOtherTags.filter((t) => t !== tag));
  const removePathologyOther = (tag: string) => onPathologyOtherTagsChange && onPathologyOtherTagsChange(pathologyOtherTags.filter((t) => t !== tag));

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
      setHighlightedIndex((prev) => (prev < flatList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : flatList.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flatList.length) {
        addEntry(flatList[highlightedIndex]);
      } else if (flatList.length > 0 && query.trim()) {
        addEntry(flatList[0]);
      }
    }
  };

  const renderOptionLabel = (option: string) => {
    const qTrim = query.trim();
    if (!qTrim) return <span>{option}</span>;
    const qNorm = normalize(qTrim);
    const optNorm = normalize(option);
    if (!optNorm.startsWith(qNorm)) return <span>{option}</span>;

    let matchLen = 0;
    for (let i = 1; i <= option.length; i++) {
      if (normalize(option.slice(0, i)) === qNorm || normalize(option.slice(0, i)).startsWith(qNorm)) {
        matchLen = i;
        break;
      }
    }
    if (matchLen === 0) matchLen = Math.min(qTrim.length, option.length);
    const prefix = option.slice(0, matchLen);
    const suffix = option.slice(matchLen);
    return (
      <span>
        <span className="font-bold underline decoration-current/30 underline-offset-2">{prefix}</span>
        <span>{suffix}</span>
      </span>
    );
  };

  const hasAnyTags = selectedAllergyTags.length > 0 || allergyOtherTags.length > 0 ||
    selectedPathologyTags.length > 0 || pathologyOtherTags.length > 0;

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <Search size={14} className="text-slate-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder || 'Rechercher une allergie ou une pathologie…'}
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
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full h-10 pl-9 pr-8 rounded-md border bg-slate-50/50 border-slate-200 focus:ring-2 focus:ring-sky-500/10 focus:border-sky-400 outline-none text-slate-900 placeholder-slate-400 font-medium text-[13px] transition-all"
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

        {isOpen && (
          <div
            className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in duration-100"
            style={{ minWidth: '260px' }}
          >
            <div ref={listRef} className="max-h-72 overflow-y-auto">
              {/* Allergies group */}
              <div className="px-3 py-1.5 bg-red-50/70 border-b border-red-100 flex items-center gap-1.5 text-[11px] font-semibold text-red-700 sticky top-0">
                <span>⚠️ Allergies</span>
                <span className="font-normal text-red-400">({allergyMatches.length})</span>
              </div>
              {allergyMatches.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-slate-400">Aucune allergie correspondante</div>
              )}
              {allergyMatches.map((opt) => {
                const idx = flatList.findIndex((e) => e.type === 'allergy' && e.label === opt);
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`a-${opt}`}
                    data-suggestion-item
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => addEntry({ type: 'allergy', label: opt })}
                    className={`w-full px-3 py-2 text-left text-[13px] transition-colors flex items-center justify-between ${
                      isHighlighted ? 'bg-red-50 text-red-900 font-semibold' : 'text-slate-700 hover:bg-red-50 hover:text-red-900'
                    }`}
                  >
                    <span>{renderOptionLabel(opt)}</span>
                    <Plus size={13} className="text-red-300 opacity-70 ml-2 shrink-0" />
                  </button>
                );
              })}

              {/* Pathologies group */}
              <div className="px-3 py-1.5 bg-amber-50/70 border-b border-t border-amber-100 flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 sticky top-0">
                <span>🔬 Pathologies</span>
                <span className="font-normal text-amber-500">({pathologyMatches.length})</span>
              </div>
              {pathologyMatches.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-slate-400">Aucune pathologie correspondante</div>
              )}
              {pathologyMatches.map((opt) => {
                const idx = flatList.findIndex((e) => e.type === 'pathology' && e.label === opt);
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`p-${opt}`}
                    data-suggestion-item
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => addEntry({ type: 'pathology', label: opt })}
                    className={`w-full px-3 py-2 text-left text-[13px] transition-colors flex items-center justify-between ${
                      isHighlighted ? 'bg-amber-50 text-amber-900 font-semibold' : 'text-slate-700 hover:bg-amber-50 hover:text-amber-900'
                    }`}
                  >
                    <span>{renderOptionLabel(opt)}</span>
                    <Plus size={13} className="text-amber-300 opacity-70 ml-2 shrink-0" />
                  </button>
                );
              })}

              {!exactMatch && query.trim() && (onAllergyOtherTagsChange || onPathologyOtherTagsChange) && (
                <div className="border-t border-slate-100 bg-slate-50/50 flex divide-x divide-slate-100">
                  {onAllergyOtherTagsChange && (
                    <button
                      type="button"
                      onClick={() => addOther('allergy')}
                      className="flex-1 px-3 py-2 text-left hover:bg-red-50 text-[12px] font-medium text-red-600 flex items-center gap-1.5"
                    >
                      <Plus size={13} className="shrink-0" />
                      <span>Allergie "{query.trim()}"</span>
                    </button>
                  )}
                  {onPathologyOtherTagsChange && (
                    <button
                      type="button"
                      onClick={() => addOther('pathology')}
                      className="flex-1 px-3 py-2 text-left hover:bg-amber-50 text-[12px] font-medium text-amber-700 flex items-center gap-1.5"
                    >
                      <Plus size={13} className="shrink-0" />
                      <span>Pathologie "{query.trim()}"</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {hasAnyTags && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {selectedAllergyTags.map((tag) => (
            <span key={`sa-${tag}`} className="inline-flex items-center gap-1.5 border transition-all px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/60">
              <AlertTriangle size={10} />
              <span>{tag}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeAllergy(tag); }} className="hover:opacity-75 focus:outline-none p-0.5 rounded hover:bg-black/5 inline-flex items-center justify-center transition-opacity" title={`Supprimer ${tag}`}>
                <X size={11} />
              </button>
            </span>
          ))}
          {allergyOtherTags.map((tag) => (
            <span key={`sao-${tag}`} className="inline-flex items-center gap-1.5 border border-dashed transition-all px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-50/50 text-rose-600 border-rose-200">
              <AlertTriangle size={10} />
              <span>{tag}</span>
              <span className="text-[9px] text-rose-400 font-normal">(non structuré)</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeAllergyOther(tag); }} className="hover:opacity-75 focus:outline-none p-0.5 rounded hover:bg-black/5 inline-flex items-center justify-center transition-opacity" title={`Supprimer ${tag}`}>
                <X size={11} />
              </button>
            </span>
          ))}
          {selectedPathologyTags.map((tag) => (
            <span key={`sp-${tag}`} className="inline-flex items-center gap-1.5 border transition-all px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/60">
              <FlaskConical size={10} />
              <span>{tag}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); removePathology(tag); }} className="hover:opacity-75 focus:outline-none p-0.5 rounded hover:bg-black/5 inline-flex items-center justify-center transition-opacity" title={`Supprimer ${tag}`}>
                <X size={11} />
              </button>
            </span>
          ))}
          {pathologyOtherTags.map((tag) => (
            <span key={`spo-${tag}`} className="inline-flex items-center gap-1.5 border border-dashed transition-all px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50/50 text-amber-700 border-amber-200">
              <FlaskConical size={10} />
              <span>{tag}</span>
              <span className="text-[9px] text-amber-400 font-normal">(non structuré)</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); removePathologyOther(tag); }} className="hover:opacity-75 focus:outline-none p-0.5 rounded hover:bg-black/5 inline-flex items-center justify-center transition-opacity" title={`Supprimer ${tag}`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default UnifiedMedicalTagSearch;
