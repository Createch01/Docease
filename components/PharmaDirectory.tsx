import React, {
  useState, useEffect, useMemo, useCallback, useRef, KeyboardEvent,
} from 'react';
import {
  Search, X, Pill, FlaskConical, Syringe, Wind,
  Droplets, Activity, ChevronLeft, ChevronRight, AlertCircle, Package,
  Building2, ShieldAlert, Baby, HeartPulse, CheckCircle2,
  Stethoscope, Heart, Brain, Zap, Bug, Microscope, Leaf, Eye, Apple,
  HelpCircle, Sun, LayoutGrid,
} from 'lucide-react';
import {
  loadAllDrugs,
  getAutocompleteSuggestions,
  searchWithFuzzyFallback,
  type DrugGroup,
  type DrugVariant,
} from '../services/pharmaDirService';
import { checkGroupAgainstProfile, type SafetyAlert } from '../services/drugSafetyCheck';
import { useActiveProfile } from './ui/ActiveProfileContext';
import { isProfileActive } from '../services/activeProfileService';
import ActiveProfilePicker from './ActiveProfilePicker';
import {
  ANATOMICAL_GROUPS, NON_CLASSE_KEY, classifyDrugLevel1, groupBySubClass, type SubClassBucket,
} from '../services/therapeuticClassification';

// ─── Browse-by-category (level 1: 14 official ATC groups, level 2: dynamic
// therapeutic_group sub-classes) — reuses the same DrugGroup data, the same
// DrugGroupCard, and the same DrugDetail (+ drugSafetyCheck.ts) as search.
// Classification rules live in services/therapeuticClassification.ts; this
// component only owns tile presentation (icon/color). ─────────────────────────

interface CategoryUI {
  icon: React.ReactNode;
  color: string;
  accent: string;
  textColor: string;
}

const CATEGORY_UI: Record<string, CategoryUI> = {
  A: { icon: <Apple size={22} />, color: 'bg-lime-50', accent: 'border-lime-200 bg-lime-100', textColor: 'text-lime-700' },
  B: { icon: <Droplets size={22} />, color: 'bg-red-50', accent: 'border-red-200 bg-red-100', textColor: 'text-red-600' },
  C: { icon: <Heart size={22} />, color: 'bg-red-50', accent: 'border-red-200 bg-red-100', textColor: 'text-red-700' },
  D: { icon: <Sun size={22} />, color: 'bg-orange-50', accent: 'border-orange-200 bg-orange-100', textColor: 'text-orange-600' },
  G: { icon: <Baby size={22} />, color: 'bg-pink-50', accent: 'border-pink-200 bg-pink-100', textColor: 'text-pink-700' },
  H: { icon: <Zap size={22} />, color: 'bg-amber-50', accent: 'border-amber-200 bg-amber-100', textColor: 'text-amber-700' },
  J: { icon: <Bug size={22} />, color: 'bg-yellow-50', accent: 'border-yellow-200 bg-yellow-100', textColor: 'text-yellow-700' },
  L: { icon: <Microscope size={22} />, color: 'bg-rose-50', accent: 'border-rose-200 bg-rose-100', textColor: 'text-rose-700' },
  M: { icon: <Stethoscope size={22} />, color: 'bg-teal-50', accent: 'border-teal-200 bg-teal-100', textColor: 'text-teal-700' },
  N: { icon: <Brain size={22} />, color: 'bg-purple-50', accent: 'border-purple-200 bg-purple-100', textColor: 'text-purple-700' },
  P: { icon: <Leaf size={22} />, color: 'bg-lime-50', accent: 'border-lime-200 bg-lime-100', textColor: 'text-lime-600' },
  R: { icon: <Wind size={22} />, color: 'bg-sky-50', accent: 'border-sky-200 bg-sky-100', textColor: 'text-sky-700' },
  S: { icon: <Eye size={22} />, color: 'bg-cyan-50', accent: 'border-cyan-200 bg-cyan-100', textColor: 'text-cyan-700' },
  V: { icon: <Pill size={22} />, color: 'bg-slate-50', accent: 'border-slate-200 bg-slate-100', textColor: 'text-slate-600' },
  [NON_CLASSE_KEY]: { icon: <HelpCircle size={22} />, color: 'bg-neutral-50', accent: 'border-neutral-200 bg-neutral-100', textColor: 'text-neutral-500' },
};

interface Category {
  key: string;
  label: string;
  ui: CategoryUI;
}

const CATEGORIES: Category[] = [
  ...ANATOMICAL_GROUPS.map(g => ({ key: g.key, label: `${g.key} — ${g.label}`, ui: CATEGORY_UI[g.key] })),
  { key: NON_CLASSE_KEY, label: 'Non classé', ui: CATEGORY_UI[NON_CLASSE_KEY] },
];

// Level-1 groups with too few drugs to be worth a sub-class drill-down show a
// flat list instead.
const SUBCLASS_MIN_COUNT = 20;

function classify(atcCode?: string | null): string {
  return classifyDrugLevel1({ atc_code: atcCode });
}

// ─── Emoji helpers ────────────────────────────────────────────────────────────

function getFormEmoji(form: string): string {
  const f = form.toLowerCase();
  if (/inject|intraven|intramusc|\biv\b|\bim\b|seringue|perfusion|lyophilis/i.test(f)) return '💉';
  if (/collyre|ophtalmique|oculaire/i.test(f)) return '👁️';
  if (/inhalat|aérosol|nébulisation|spray|poudre.à.inhaler/i.test(f)) return '🫁';
  if (/sirop|suspension|gouttes|buvable|flacon/i.test(f)) return '🧴';
  if (/solution|ampoule/i.test(f)) return '🧪';
  if (/pommade|crème|gel|lotion|topique|cutané|émulsion/i.test(f)) return '🩹';
  if (/patch|timbre|transdermique/i.test(f)) return '🩹';
  if (/sachet/i.test(f)) return '📦';
  if (/suppositoire/i.test(f)) return '💊';
  return '💊';
}

// ─── Lucide icon (for detail header) ─────────────────────────────────────────

function FormIcon({ form, size = 16 }: { form: string; size?: number }) {
  const f = form.toLowerCase();
  if (/inject|intraven|intramusc|\biv\b|\bim\b|seringue|perfusion|lyophilis/i.test(f))
    return <Syringe size={size} />;
  if (/sirop|suspension|solution|gouttes|collyre|buvable|ampoule|flacon/i.test(f))
    return <FlaskConical size={size} />;
  if (/inhalat|aérosol|nébulisation|spray.nasal|poudre.à.inhaler/i.test(f))
    return <Wind size={size} />;
  if (/pommade|crème|gel|lotion|émulsion|topique|cutané/i.test(f))
    return <Droplets size={size} />;
  if (/patch|timbre|transdermique/i.test(f))
    return <Activity size={size} />;
  return <Pill size={size} />;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  // Prescription / scheduling status (spec)
  if (s.includes('sans ordonnance'))
    return <Chip cls="bg-green-50 text-green-700 border-green-200">{status}</Chip>;
  if (s.includes('liste i') && !s.includes('ii'))
    return <Chip cls="bg-amber-50 text-amber-700 border-amber-200">{status}</Chip>;
  if (s.includes('liste ii') || s.includes('liste iii'))
    return <Chip cls="bg-orange-50 text-orange-700 border-orange-200">{status}</Chip>;
  if (s.includes('ordonnance'))
    return <Chip cls="bg-red-50 text-red-700 border-red-200">{status}</Chip>;
  // Market authorization status (existing data)
  if (s.includes('commercialisé'))
    return <Chip cls="bg-emerald-50 text-emerald-700 border-emerald-200">{status}</Chip>;
  if (s.includes('autorisé'))
    return <Chip cls="bg-blue-50 text-blue-600 border-blue-200">{status}</Chip>;
  if (s.includes('suspendu'))
    return <Chip cls="bg-amber-50 text-amber-700 border-amber-200">{status}</Chip>;
  if (s.includes('retiré') || s.includes('annulé'))
    return <Chip cls="bg-red-50 text-red-600 border-red-200">{status}</Chip>;
  return <Chip cls="bg-slate-100 text-slate-500 border-slate-200">{status}</Chip>;
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

// ─── Highlight matched substring ──────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="font-black text-blue-600 not-italic">
        {text.slice(idx, idx + query.length)}
      </strong>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-5 w-3/5 bg-slate-200 rounded" />
          <div className="h-3.5 w-2/5 bg-slate-100 rounded" />
        </div>
        <div className="w-16 h-5 bg-slate-100 rounded-full ml-3" />
      </div>
      <div className="flex gap-1.5 mt-3">
        <div className="h-6 w-20 bg-blue-50 rounded-full" />
        <div className="h-6 w-16 bg-slate-50 rounded-full" />
        <div className="h-6 w-14 bg-slate-50 rounded-full" />
      </div>
    </div>
  );
}

// ─── Form badge (emoji + label, used on cards) ────────────────────────────────

function FormBadge({ form }: { key?: React.Key; form: string }) {
  const emoji = getFormEmoji(form);
  const label = form.length > 16 ? form.slice(0, 15) + '…' : form;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-50 border border-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
      <span className="leading-none">{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

// ─── Drug group card ──────────────────────────────────────────────────────────

interface DrugGroupCardProps {
  key?: React.Key;
  group: DrugGroup;
  query: string;
  onClick: () => void;
}

function DrugGroupCard({ group, query, onClick }: DrugGroupCardProps) {
  const uniqueForms = useMemo(
    () => [...new Set(group.variants.map(v => v.form))].slice(0, 4),
    [group.variants],
  );
  const n = group.presentationsCount;

  return (
    <button
      onClick={onClick}
      className="w-full text-left group bg-white rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-5 focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      {/* Top row: name + count badge */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 text-sm leading-tight truncate group-hover:text-blue-700 transition-colors">
            <Highlight text={group.brand_name} query={query} />
          </p>
          <p className="text-xs text-slate-400 italic leading-snug mt-0.5 truncate">
            <Highlight text={group.generic_name} query={query} />
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">
          {n} prés.
        </span>
      </div>

      {/* Therapeutic class */}
      {group.therapeutic_group && (
        <p className="text-[11px] text-slate-400 mb-2.5 truncate">{group.therapeutic_group}</p>
      )}

      {/* Form badges */}
      <div className="flex flex-wrap gap-1.5">
        {uniqueForms.map((f, i) => <FormBadge key={i} form={f} />)}
        {group.atc_code && (
          <span className="text-[11px] font-mono text-slate-300 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
            {group.atc_code}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Autocomplete dropdown ────────────────────────────────────────────────────

interface AutocompleteDropdownProps {
  query: string;
  brands: DrugGroup[];
  generics: DrugGroup[];
  highlightedIndex: number;   // -1 = none; 0..brands.length-1 = brand; brands.length.. = generic
  onSelect: (g: DrugGroup) => void;
  onSubmit: () => void;       // Enter with no selection highlighted
}

function AutocompleteDropdown({
  query, brands, generics, highlightedIndex, onSelect, onSubmit,
}: AutocompleteDropdownProps) {
  const totalBrands = brands.length;
  const hasAny = brands.length > 0 || generics.length > 0;

  return (
    <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl overflow-hidden border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-2xl animate-fade-in">
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeInDown 0.15s cubic-bezier(0.16,1,0.3,1); }
      `}</style>

      {!hasAny ? (
        <div className="flex items-center gap-3 px-5 py-4 text-slate-400">
          <Search size={15} className="shrink-0" />
          <span className="text-sm">Aucun résultat pour «&nbsp;{query}&nbsp;»</span>
        </div>
      ) : (
        <>
          {/* Brands section */}
          {brands.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Noms Commerciaux
                </p>
              </div>
              {brands.map((g, i) => {
                const isHighlighted = highlightedIndex === i;
                return (
                  <button
                    key={g.key}
                    onClick={() => onSelect(g)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${isHighlighted ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                  >
                    <span className="text-base leading-none shrink-0">
                      {getFormEmoji(g.variants[0]?.form ?? '')}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">
                      <Highlight text={g.brand_name} query={query} />
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                      {g.presentationsCount}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {/* Generics section */}
          {generics.length > 0 && (
            <>
              <div className={`px-4 pt-3 pb-1 ${brands.length > 0 ? 'border-t border-slate-100 mt-1' : ''}`}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Principes Actifs
                </p>
              </div>
              {generics.map((g, i) => {
                const globalIdx = totalBrands + i;
                const isHighlighted = highlightedIndex === globalIdx;
                return (
                  <button
                    key={g.key}
                    onClick={() => onSelect(g)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors ${isHighlighted ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                  >
                    <span className="text-base leading-none shrink-0 opacity-50">🔬</span>
                    <div className="flex-1 min-w-0 min-h-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {g.brand_name}
                      </p>
                      <p className="text-[11px] text-slate-400 italic truncate">
                        <Highlight text={g.generic_name} query={query} />
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                      {g.presentationsCount}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {/* Footer hint */}
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[9px]">↑↓</kbd>
              {' '}naviguer ·{' '}
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[9px]">Entrée</kbd>
              {' '}sélectionner ·{' '}
              <kbd className="bg-white border border-slate-200 rounded px-1 font-mono text-[9px]">Échap</kbd>
              {' '}fermer
            </p>
            <button
              onMouseDown={e => { e.preventDefault(); onSubmit(); }}
              className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Voir tous les résultats →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Detail flat rows ─────────────────────────────────────────────────────────

interface FlatRow {
  variantId: string;
  form: string;
  strength: string | null;
  packaging: string | null;
  price: number | null;
  laboratory: string | null;
  status: string;
}

function buildFlatRows(variants: DrugVariant[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const v of variants) {
    for (const m of v.market_data) {
      rows.push({
        variantId: v.id,
        form: v.form,
        strength: v.strength,
        packaging: m.packaging,
        price: m.price_ppv_dhs,
        laboratory: m.laboratory,
        status: m.status,
      });
    }
  }
  return rows;
}

// ─── Drug detail ──────────────────────────────────────────────────────────────

interface DrugDetailProps {
  group: DrugGroup;
  onBack: () => void;
}

function DrugDetail({ group, onBack }: DrugDetailProps) {
  const rows = useMemo(() => buildFlatRows(group.variants), [group]);
  const n = group.presentationsCount;
  const primaryForm = group.variants[0]?.form ?? 'Comprimé';
  const { profile } = useActiveProfile();
  const alerts = useMemo(
    () => (isProfileActive(profile) ? checkGroupAgainstProfile(group, profile) : []),
    [group, profile],
  );

  return (
    <>
      <style>{`
        @keyframes slideFromRight {
          from { opacity: 0; transform: translateX(1.5rem); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .slide-from-right { animation: slideFromRight 0.22s cubic-bezier(0.16,1,0.3,1); }
      `}</style>

      <div className="slide-from-right">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-6 transition-colors group"
        >
          <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Retour aux résultats
        </button>

        {/* Patient safety alerts — non-dismissible, above the fold */}
        {alerts.length > 0 && <SafetyAlertBanner alerts={alerts} />}

        {/* Header card — navy accent bar on left */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-5">
          <div className="flex gap-0">
            {/* Left navy accent */}
            <div className="w-1.5 shrink-0 bg-[#0F172A] rounded-l-2xl" />
            <div className="flex-1 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                  <FormIcon form={primaryForm} size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black text-slate-900 leading-tight">{group.brand_name}</h2>
                  <p className="text-sm text-slate-400 italic mt-0.5">{group.generic_name}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {group.therapeutic_group && (
                      <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                        {group.therapeutic_group}
                      </span>
                    )}
                    {group.atc_code && (
                      <span className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
                        ATC&nbsp;{group.atc_code}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
                      {n} présentation{n !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Presentations table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm">Présentations disponibles</h3>
            <span className="text-xs text-slate-400">{rows.length} ligne{rows.length !== 1 ? 's' : ''}</span>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={<Package size={36} />}
              title="Aucune présentation"
              subtitle="Données de marché non disponibles."
            />
          ) : (
            <>
              {/* Column headers — desktop */}
              <div className="hidden md:grid md:grid-cols-[2fr_1fr_2fr_1.2fr_1.8fr] gap-3 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Forme galénique</span>
                <span>Dosage</span>
                <span>Conditionnement</span>
                <span className="text-right">PPV (MAD)</span>
                <span className="text-right">Statut</span>
              </div>

              <div className="divide-y divide-slate-50">
                {rows.map((row, i) => (
                  <div
                    key={`${row.variantId}-${i}`}
                    className="px-6 py-4 flex flex-col gap-2 md:grid md:grid-cols-[2fr_1fr_2fr_1.2fr_1.8fr] md:gap-3 md:items-center hover:bg-slate-50/70 transition-colors"
                  >
                    {/* Forme */}
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400 shrink-0">
                        <FormIcon form={row.form} size={14} />
                      </span>
                      <span className="text-sm font-medium text-slate-700">{row.form}</span>
                    </div>

                    {/* Dosage */}
                    <span className="text-sm text-slate-500">
                      {row.strength ?? <span className="text-slate-300">—</span>}
                    </span>

                    {/* Conditionnement */}
                    <div>
                      <span className="text-sm text-slate-600">
                        {row.packaging ?? <span className="text-slate-300">—</span>}
                      </span>
                      {row.laboratory && (
                        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Building2 size={10} />
                          {row.laboratory}
                        </p>
                      )}
                    </div>

                    {/* PPV */}
                    <span className="text-sm font-bold text-slate-800 md:text-right">
                      {row.price != null ? (
                        <>
                          {row.price.toFixed(2)}
                          <span className="text-xs font-normal text-slate-400 ml-0.5">DH</span>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </span>

                    {/* Statut */}
                    <div className="md:flex md:justify-end">
                      <StatusBadge status={row.status} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Clinical info — never omitted, never guessed: shows "non renseigné" for empty fields */}
        <ClinicalSection group={group} />
      </div>
    </>
  );
}

// ─── Safety alert banner ───────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<SafetyAlert['severity'], { wrap: string; icon: React.ReactNode; label: string }> = {
  CRITIQUE: {
    wrap: 'bg-red-50 border-red-400 text-red-800',
    icon: <ShieldAlert size={18} className="text-red-600 shrink-0" />,
    label: '⚠️ INTERDIT',
  },
  ATTENTION: {
    wrap: 'bg-amber-50 border-amber-300 text-amber-800',
    icon: <AlertCircle size={18} className="text-amber-600 shrink-0" />,
    label: 'Précaution',
  },
  INFO: {
    wrap: 'bg-slate-50 border-slate-200 text-slate-500',
    icon: <Stethoscope size={16} className="text-slate-400 shrink-0" />,
    label: 'Info',
  },
};

const CATEGORY_LABEL: Record<SafetyAlert['category'], string> = {
  grossesse: 'Grossesse',
  allaitement: 'Allaitement',
  enfant: 'Pédiatrie',
  renal: 'Fonction rénale',
  hepatique: 'Fonction hépatique',
  cardiaque: 'Cardiaque',
  diabete: 'Diabète',
};

function SafetyAlertBanner({ alerts }: { alerts: SafetyAlert[] }) {
  const critical = alerts.filter(a => a.severity === 'CRITIQUE');
  const caution = alerts.filter(a => a.severity === 'ATTENTION');
  const info = alerts.filter(a => a.severity === 'INFO');
  const ordered = [...critical, ...caution, ...info];

  return (
    <div className="mb-5 space-y-2">
      {ordered.map((a, i) => {
        const s = SEVERITY_STYLE[a.severity];
        return (
          <div key={i} className={`flex items-start gap-3 rounded-2xl border-2 p-4 ${s.wrap}`}>
            {s.icon}
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide">
                {s.label} · {CATEGORY_LABEL[a.category]}
                {a.divergent && <span className="ml-1.5 font-semibold normal-case">(données divergentes selon la présentation)</span>}
              </p>
              <p className="text-sm mt-0.5 leading-snug">{a.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Clinical info section ─────────────────────────────────────────────────────

function NonRenseigne() {
  return <span className="text-slate-300 italic text-sm">Non renseigné</span>;
}

function ClinicalSection({ group }: { group: DrugGroup }) {
  const divergentFields = new Set(group.divergences.map(d => d.field));

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mt-5 divide-y divide-slate-100">

      {group.mechanism && !divergentFields.has('mechanism') && (
        <Section title="Mécanisme d'action" icon={<FlaskConical size={13} />}>
          <p className="text-sm text-slate-600 leading-relaxed">{group.mechanism}</p>
        </Section>
      )}

      <Section title="Indications" icon={<CheckCircle2 size={13} />}>
        {divergentFields.has('indications') ? <DivergenceNote group={group} field="indications" /> : (
          group.indications && group.indications.length > 0 ? (
            <ul className="space-y-1.5">
              {group.indications.map((ind, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="text-blue-400 mt-0.5 shrink-0">•</span><span>{ind}</span>
                </li>
              ))}
            </ul>
          ) : <NonRenseigne />
        )}
      </Section>

      <Section title="Contre-indications" icon={<ShieldAlert size={13} />} accent="text-rose-500">
        {divergentFields.has('contraindications') ? <DivergenceNote group={group} field="contraindications" /> : (
          group.contraindications && group.contraindications.length > 0 ? (
            <ul className="space-y-1.5">
              {group.contraindications.map((ci, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-rose-700">
                  <span className="shrink-0 mt-0.5">⚠</span><span>{ci}</span>
                </li>
              ))}
            </ul>
          ) : <NonRenseigne />
        )}
      </Section>

      <Section title="Grossesse & Allaitement" icon={<Baby size={13} />} accent="text-pink-500">
        {divergentFields.has('pregnancy') ? <DivergenceNote group={group} field="pregnancy" /> : (
          group.pregnancy ? (
            <div className="space-y-1">
              {group.pregnancy.category && <p className="text-xs font-bold text-slate-700">Catégorie : {group.pregnancy.category}</p>}
              {group.pregnancy.warning && <p className="text-sm text-slate-600">{group.pregnancy.warning}</p>}
              {group.pregnancy.breastfeeding && <p className="text-sm text-slate-500 italic">{group.pregnancy.breastfeeding}</p>}
              {!group.pregnancy.category && !group.pregnancy.warning && !group.pregnancy.breastfeeding && <NonRenseigne />}
            </div>
          ) : <NonRenseigne />
        )}
      </Section>

      <Section title="Pédiatrie" icon={<Baby size={13} />} accent="text-rose-400">
        {divergentFields.has('children') ? <DivergenceNote group={group} field="children" /> : (
          group.children ? (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700">
                {group.children.allowed === false ? 'Contre-indiqué chez l\'enfant' : group.children.allowed === true ? 'Autorisé chez l\'enfant' : null}
                {group.children.min_age != null && ` · Âge minimum : ${group.children.min_age} ans`}
              </p>
              {group.children.warning && <p className="text-sm text-slate-600">{group.children.warning}</p>}
              {group.children.dose_rule && <p className="text-[11px] text-slate-400 italic">{group.children.dose_rule}</p>}
            </div>
          ) : <NonRenseigne />
        )}
      </Section>

      <Section title="Ajustement rénal" icon={<Droplets size={13} />} accent="text-amber-500">
        {divergentFields.has('renal_adjustment') ? <DivergenceNote group={group} field="renal_adjustment" /> : (
          group.renal_adjustment ? (
            <p className="text-sm text-slate-600">
              {group.renal_adjustment.required ? 'Ajustement requis. ' : ''}{group.renal_adjustment.rule || (!group.renal_adjustment.required ? 'Aucun ajustement particulier signalé.' : '')}
            </p>
          ) : <NonRenseigne />
        )}
      </Section>

      <Section title="Interactions" icon={<Activity size={13} />} accent="text-orange-500">
        {divergentFields.has('interactions') ? <DivergenceNote group={group} field="interactions" /> : (
          group.interactions && group.interactions.length > 0 ? (
            <ul className="space-y-1.5">
              {group.interactions.map((it, i) => (
                <li key={i} className="text-sm text-slate-600">
                  {typeof it === 'string' ? it : `${it.drug} — ${it.effect} (${it.severity})`}
                </li>
              ))}
            </ul>
          ) : <NonRenseigne />
        )}
      </Section>

      <Section title="Effets indésirables" icon={<AlertCircle size={13} />} accent="text-slate-400">
        {divergentFields.has('adverse_effects') ? <DivergenceNote group={group} field="adverse_effects" /> : (
          group.adverse_effects && group.adverse_effects.length > 0 ? (
            <p className="text-sm text-slate-600">{group.adverse_effects.join(', ')}</p>
          ) : <NonRenseigne />
        )}
      </Section>

      {group.smart_flags && group.smart_flags.length > 0 && !divergentFields.has('smart_flags') && (
        <Section title="Alertes système" icon={<HeartPulse size={13} />} accent="text-purple-500">
          <div className="flex flex-wrap gap-1.5">
            {group.smart_flags.map((f, i) => (
              <span key={i} className="text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full">{f}</span>
            ))}
          </div>
        </Section>
      )}
      {divergentFields.has('smart_flags') && (
        <Section title="Alertes système" icon={<HeartPulse size={13} />} accent="text-purple-500">
          <DivergenceNote group={group} field="smart_flags" />
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent?: string; children: React.ReactNode }) {
  return (
    <div className="p-6">
      <p className={`text-[10px] font-black uppercase tracking-widest mb-2.5 flex items-center gap-1.5 ${accent ?? 'text-slate-400'}`}>
        {icon} {title}
      </p>
      {children}
    </div>
  );
}

/** Renders every distinct value found for a clinical field that differs between presentations — never picks one. */
function DivergenceNote({ group, field }: { group: DrugGroup; field: string }) {
  const div = group.divergences.find(d => d.field === field);
  if (!div) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
        <AlertCircle size={12} /> Cette information diffère selon la présentation — à vérifier
      </p>
      {div.values.map((v, i) => {
        const variantLabels = v.variantIds
          .map(id => group.variants.find(variant => variant.id === id))
          .filter(Boolean)
          .map(variant => [variant!.strength, variant!.form].filter(Boolean).join(' '))
          .join(', ');
        return (
          <div key={i} className="bg-amber-50/60 border border-amber-100 rounded-lg p-3">
            <p className="text-[11px] font-semibold text-amber-700 mb-1">{variantLabels || 'Présentation(s) concernée(s)'}</p>
            <p className="text-sm text-slate-700">{formatDivergentValue(v.value)}</p>
          </div>
        );
      })}
    </div>
  );
}

function formatDivergentValue(value: unknown): string {
  if (value == null) return 'Non renseigné';
  if (Array.isArray(value)) return value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' · ');
  if (typeof value === 'object') return Object.entries(value as object).filter(([, v]) => v != null).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return String(value);
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 select-none">
      <div className="text-slate-200 mb-4">{icon}</div>
      <p className="text-sm font-semibold text-slate-400">{title}</p>
      <p className="text-xs text-slate-300 mt-1 text-center max-w-xs">{subtitle}</p>
    </div>
  );
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function usePharmaDir() {
  const [groups, setGroups] = useState<DrugGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAllDrugs()
      .then(g => { if (!cancelled) { setGroups(g); setLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          setError('Impossible de charger le répertoire pharmaceutique.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { groups, loading, error };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PharmaDirectory() {
  const { groups, loading, error } = usePharmaDir();

  // Search state
  const [query, setQuery] = useState('');           // live input
  const [submittedQuery, setSubmittedQuery] = useState('');         // confirmed search
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Navigation state
  const [selected, setSelected] = useState<DrugGroup | null>(null);

  // Browse-by-category state (level 1 = ATC group, level 2 = therapeutic_group sub-class)
  const [mode, setMode] = useState<'search' | 'browse'>('search');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubClass, setActiveSubClass] = useState<string | null>(null);
  const [classQuery, setClassQuery] = useState('');

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Autocomplete suggestions
  const suggestions = useMemo(
    () => getAutocompleteSuggestions(groups, query),
    [groups, query],
  );
  const flatSuggestions = useMemo(
    () => [...suggestions.brands, ...suggestions.generics],
    [suggestions],
  );

  // Results for the grid — falls back to typo-tolerant matching when a
  // plain substring search finds nothing (e.g. a name transcribed from a
  // handwritten prescription).
  const { results, isFuzzy } = useMemo(
    () => searchWithFuzzyFallback(groups, submittedQuery),
    [groups, submittedQuery],
  );

  // ── Browse-by-category data ─────────────────────────────────────────────

  const categoryMap = useMemo(() => {
    const map: Record<string, DrugGroup[]> = {};
    for (const cat of CATEGORIES) map[cat.key] = [];
    for (const g of groups) map[classify(g.atc_code)].push(g);
    return map;
  }, [groups]);

  const activeCategoryMeds = useMemo(
    () => (activeCategory ? categoryMap[activeCategory] ?? [] : []),
    [activeCategory, categoryMap],
  );

  const subClassBuckets = useMemo((): SubClassBucket<DrugGroup>[] => {
    if (!activeCategory || activeCategoryMeds.length < SUBCLASS_MIN_COUNT) return [];
    const buckets = groupBySubClass<DrugGroup>(activeCategoryMeds);
    return buckets.length > 1 ? buckets : [];
  }, [activeCategory, activeCategoryMeds]);

  const activeBucket = useMemo(
    () => subClassBuckets.find(b => b.key === activeSubClass) ?? null,
    [subClassBuckets, activeSubClass],
  );

  const activeCat = CATEGORIES.find(c => c.key === activeCategory);
  const showingSubClassGrid = mode === 'browse' && !!activeCategory && subClassBuckets.length > 0 && !activeSubClass;
  const showingCategoryMedList = mode === 'browse' && !!activeCategory && !showingSubClassGrid;

  const browseMeds = useMemo(() => {
    if (!activeCategory) return [];
    const q = classQuery.trim().toLowerCase();
    const list = subClassBuckets.length > 0
      ? (activeSubClass ? activeBucket?.items ?? [] : [])
      : activeCategoryMeds;
    if (!q) return list;
    return list.filter(g =>
      g.brand_name?.toLowerCase().includes(q) ||
      g.generic_name?.toLowerCase().includes(q)
    );
  }, [activeCategory, activeCategoryMeds, subClassBuckets, activeSubClass, activeBucket, classQuery]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleModeChange = useCallback((next: 'search' | 'browse') => {
    setMode(next);
    setSelected(null);
    setActiveCategory(null);
    setActiveSubClass(null);
    setClassQuery('');
  }, []);

  const handleCategoryClick = useCallback((key: string) => {
    setActiveCategory(key);
    setActiveSubClass(null);
    setClassQuery('');
  }, []);

  const handleSubClassClick = useCallback((key: string) => {
    setActiveSubClass(key);
    setClassQuery('');
  }, []);

  const handleBrowseBack = useCallback(() => {
    if (activeSubClass) {
      setActiveSubClass(null);
    } else {
      setActiveCategory(null);
    }
    setClassQuery('');
  }, [activeSubClass]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    setHighlightedIndex(-1);
    setDropdownOpen(v.trim().length > 0);
  }, []);

  const submitSearch = useCallback(() => {
    if (!query.trim()) return;
    setSubmittedQuery(query.trim());
    setDropdownOpen(false);
    setHighlightedIndex(-1);
    setSelected(null);
  }, [query]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => Math.min(i + 1, flatSuggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => (i <= 0 ? -1 : i - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && flatSuggestions[highlightedIndex]) {
          setSelected(flatSuggestions[highlightedIndex]);
          setDropdownOpen(false);
        } else {
          submitSearch();
        }
        break;
      case 'Escape':
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [highlightedIndex, flatSuggestions, submitSearch]);

  const handleSelect = useCallback((g: DrugGroup) => {
    setSelected(g);
    setDropdownOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBack = useCallback(() => {
    setSelected(null);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setSubmittedQuery('');
    setDropdownOpen(false);
    setHighlightedIndex(-1);
    setSelected(null);
    inputRef.current?.focus();
  }, []);

  const hasResults = submittedQuery.trim().length > 0;
  const showDropdown = dropdownOpen && query.trim().length > 0 && !selected;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Page header ── */}
        {!selected && (
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-10 h-10 rounded-2xl bg-[#0F172A] flex items-center justify-center text-white shadow-md shrink-0">
                <Pill size={18} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 leading-none">
                  Annuaire Pharmaceutique
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {loading
                    ? 'Chargement…'
                    : `${groups.length.toLocaleString()} médicaments · Maroc`}
                </p>
              </div>
            </div>
            <ActiveProfilePicker />
          </div>
        )}

        {/* ── Mode toggle: Recherche / Parcourir par catégorie ── */}
        {!selected && (
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => handleModeChange('search')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'search' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <Search size={14} /> Recherche
            </button>
            <button
              onClick={() => handleModeChange('browse')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${mode === 'browse' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <LayoutGrid size={14} /> Parcourir par catégorie
            </button>
          </div>
        )}
        {selected && (
          <div className="flex justify-end mb-4">
            <ActiveProfilePicker />
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2.5 text-red-600 bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
            <AlertCircle size={18} className="shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* ── Detail view ── */}
        {selected ? (
          <DrugDetail group={selected} onBack={handleBack} />
        ) : mode === 'browse' ? (
          <>
            {/* ── Loading ── */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            )}

            {/* ── Category grid — 14 official ATC groups, "Non classé" only if non-empty ── */}
            {!loading && !activeCategory && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CATEGORIES.map(cat => {
                  const count = categoryMap[cat.key]?.length ?? 0;
                  if (count === 0 && cat.key === NON_CLASSE_KEY) return null;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => handleCategoryClick(cat.key)}
                      className={`group text-left rounded-2xl border-2 ${cat.ui.accent} ${cat.ui.color} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-2.5`}
                    >
                      <span className={`${cat.ui.textColor} opacity-80 group-hover:opacity-100 transition-opacity`}>
                        {cat.ui.icon}
                      </span>
                      <div>
                        <p className={`font-semibold text-sm leading-tight ${cat.ui.textColor}`}>{cat.label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{count.toLocaleString()} médicament{count !== 1 ? 's' : ''}</p>
                      </div>
                      <ChevronRight size={14} className={`${cat.ui.textColor} opacity-40 group-hover:opacity-80 self-end transition-opacity`} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Category / sub-class breadcrumb + search ── */}
            {activeCategory && (
              <>
                <button
                  onClick={handleBrowseBack}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-4 transition-colors group"
                >
                  <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                  {activeSubClass ? activeCat?.label : 'Toutes les catégories'}
                </button>
                <h2 className="text-xl font-black text-slate-900 mb-4">
                  {activeSubClass ? activeBucket?.label : activeCat?.label}
                </h2>

                {showingCategoryMedList && (
                  <div className="relative mb-5">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={classQuery}
                      onChange={e => setClassQuery(e.target.value)}
                      placeholder={`Rechercher dans ${activeSubClass ? activeBucket?.label : activeCat?.label}…`}
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition"
                    />
                    {classQuery && (
                      <button
                        onClick={() => setClassQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}

                {/* ── Sub-class grid — level 2, dynamic groups from therapeutic_group text ── */}
                {showingSubClassGrid && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {subClassBuckets.map(bucket => (
                      <button
                        key={bucket.key}
                        onClick={() => handleSubClassClick(bucket.key)}
                        className={`group text-left rounded-2xl border-2 ${activeCat?.ui.accent ?? 'border-slate-200 bg-slate-100'} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-2.5`}
                      >
                        <div>
                          <p className={`font-semibold text-sm leading-tight ${activeCat?.ui.textColor ?? 'text-slate-700'}`}>{bucket.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{bucket.items.length.toLocaleString()} médicament{bucket.items.length !== 1 ? 's' : ''}</p>
                        </div>
                        <ChevronRight size={14} className={`${activeCat?.ui.textColor ?? 'text-slate-700'} opacity-40 group-hover:opacity-80 self-end transition-opacity`} />
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Category / sub-class medication list — same DrugGroupCard, same onClick → DrugDetail ── */}
                {showingCategoryMedList && (
                  <>
                    <p className="text-xs text-slate-500 mb-3">
                      {browseMeds.length.toLocaleString()} médicament{browseMeds.length !== 1 ? 's' : ''}
                    </p>
                    {browseMeds.length === 0 ? (
                      <EmptyState
                        icon={<Search size={40} />}
                        title="Aucun médicament trouvé"
                        subtitle="Essayez un autre terme."
                      />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {browseMeds.map(g => (
                          <DrugGroupCard
                            key={g.key}
                            group={g}
                            query={classQuery}
                            onClick={() => handleSelect(g)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* ── Hero search bar ── */}
            <div ref={searchRef} className="relative mb-8">
              <div className="relative">
                <Search
                  size={20}
                  className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => query.trim() && setDropdownOpen(true)}
                  placeholder="Rechercher un médicament ou principe actif…"
                  className="w-full h-14 pl-14 pr-14 text-base rounded-xl border border-slate-200 bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 placeholder-slate-400 text-slate-800"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    onClick={handleClear}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                    aria-label="Effacer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Autocomplete dropdown */}
              {showDropdown && (
                <AutocompleteDropdown
                  query={query}
                  brands={suggestions.brands}
                  generics={suggestions.generics}
                  highlightedIndex={highlightedIndex}
                  onSelect={handleSelect}
                  onSubmit={submitSearch}
                />
              )}
            </div>

            {/* ── Loading ── */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            )}

            {/* ── Idle (no search submitted) ── */}
            {!loading && !hasResults && (
              <EmptyState
                icon={<Search size={44} />}
                title="Recherchez un médicament"
                subtitle="Entrez un nom commercial ou un principe actif pour commencer."
              />
            )}

            {/* ── Results ── */}
            {!loading && hasResults && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-slate-700">
                    {results.length === 0
                      ? 'Aucun résultat'
                      : (
                        <>
                          <span className="font-black text-blue-600">{results.length}</span>
                          {' '}résultat{results.length !== 1 ? 's' : ''}{' '}
                          {isFuzzy ? 'proches de' : 'pour'}{' '}
                          <span className="font-semibold">«&nbsp;{submittedQuery}&nbsp;»</span>
                          {results.length === 200 && (
                            <span className="text-slate-400 font-normal"> · limité à 200</span>
                          )}
                        </>
                      )}
                  </p>
                  {results.length > 0 && (
                    <button
                      onClick={handleClear}
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                    >
                      <X size={12} /> Effacer
                    </button>
                  )}
                </div>

                {isFuzzy && results.length > 0 && (
                  <div className="mb-4 flex items-center gap-2.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <AlertCircle size={14} className="shrink-0" />
                    Aucune correspondance exacte — voici les noms les plus proches (vouliez-vous dire l'un de ceux-ci ?).
                  </div>
                )}

                {results.length === 0 ? (
                  <EmptyState
                    icon={<Search size={40} />}
                    title="Aucun médicament trouvé"
                    subtitle="Vérifiez l'orthographe ou essayez un autre terme."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {results.map(g => (
                      <DrugGroupCard
                        key={g.key}
                        group={g}
                        query={submittedQuery}
                        onClick={() => handleSelect(g)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}
