import React, { useMemo, useState } from 'react';
import {
  Plus, Trash2, AlertTriangle, Info, Save, X, Check, ShieldAlert,
} from 'lucide-react';
import type { Medicament } from '../../services/drugCatalogService';
import { loadLetter, invalidateLetter } from '../../services/drugCatalogService';
import { resetDrugGroupsCache } from '../../services/pharmaDirService';
import {
  saveMedicament, findBrandCollisions, checkCompositionConsistency,
  type OverrideRecord,
} from '../../services/medicamentAdminService';
import {
  validateMedicament, type MedicamentDraft, type ValidationError,
} from '../../services/medicamentValidation';
import { classifyByAtc, THERAPEUTIC_CATEGORIES } from '../../services/therapeuticClassification';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'med';
}

function letterOf(brandName: string): string {
  const first = brandName.trim()[0]?.toUpperCase();
  return first && /[A-Z]/.test(first) ? first : 'A';
}

function linesToArray(text: string): string[] {
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

function arrayToLines(arr?: string[]): string {
  return (arr ?? []).join('\n');
}

function emptyDraft(): MedicamentDraft {
  return {
    id: '', brand_name: '', generic_name: '', composition: [],
    strength: null, form: '', route: '',
    atc_code: '', therapeutic_group: '', drug_class: '', nature_produit: 'Médicament',
    mechanism: '', half_life: '',
    indications: [], contraindications: [], interactions: [], adverse_effects: [],
    pregnancy: {}, children: {}, renal_adjustment: {},
    dosage: {}, smart_flags: [], market_data: [],
    noKnownContraindications: false, noAtcJustified: false,
  };
}

// ─── UI atoms ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 mb-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function Field({
  label, error, full = false, children,
}: { label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle size={11} />{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition';
const textareaCls = `${inputCls} min-h-[80px]`;

// ─── Component ────────────────────────────────────────────────────────────────

interface MedicamentEditorProps {
  initialRecord?: Medicament;
  onSaved: (record: OverrideRecord, letter: string) => void;
  onCancel: () => void;
}

type PendingDuplicateChoice = { collisions: Medicament[] } | null;

export default function MedicamentEditor({ initialRecord, onSaved, onCancel }: MedicamentEditorProps) {
  const isEdit = !!initialRecord;
  const [draft, setDraft] = useState<MedicamentDraft>(() =>
    initialRecord
      ? {
          ...initialRecord,
          noKnownContraindications: (initialRecord.contraindications?.length ?? 0) === 0
            ? !!(initialRecord as any).noKnownContraindications : false,
          noAtcJustified: !initialRecord.atc_code && !!initialRecord.nature_produit && initialRecord.nature_produit !== 'Médicament',
        }
      : emptyDraft()
  );
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [atcSuggestion, setAtcSuggestion] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicateChoice>(null);
  const [saving, setSaving] = useState(false);
  const [consistencyAck, setConsistencyAck] = useState(false);

  const errorFor = (field: string) => errors.find(e => e.field === field)?.message;

  const compositionConsistent = useMemo(
    () => checkCompositionConsistency(draft.composition ?? [], draft.generic_name ?? ''),
    [draft.composition, draft.generic_name]
  );

  function update<K extends keyof MedicamentDraft>(key: K, value: MedicamentDraft[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function updateNested<T extends object>(key: keyof MedicamentDraft, patch: Partial<T>) {
    setDraft(d => ({ ...d, [key]: { ...((d[key] as any) ?? {}), ...patch } }));
  }

  // ── Composition rows ──
  function setCompositionRow(i: number, value: string) {
    const next = [...(draft.composition ?? [])];
    next[i] = value;
    update('composition', next);
  }
  function addCompositionRow() {
    update('composition', [...(draft.composition ?? []), '']);
  }
  function removeCompositionRow(i: number) {
    update('composition', (draft.composition ?? []).filter((_, idx) => idx !== i));
  }

  // ── Interactions rows ──
  type Interaction = { drug: string; severity: string; effect: string };
  const interactions = (draft.interactions ?? []) as Interaction[];
  function setInteraction(i: number, patch: Partial<Interaction>) {
    const next = [...interactions];
    next[i] = { ...next[i], ...patch };
    update('interactions', next as any);
  }
  function addInteraction() {
    update('interactions', [...interactions, { drug: '', severity: 'modérée', effect: '' }] as any);
  }
  function removeInteraction(i: number) {
    update('interactions', interactions.filter((_, idx) => idx !== i) as any);
  }

  // ── Market data (presentations) rows ──
  type MarketRow = { packaging?: string | null; price_ppv_dhs?: number | null; price_ph_dhs?: number | null; laboratory?: string | null; status?: string };
  const marketRows = (draft.market_data ?? []) as MarketRow[];
  function setMarketRow(i: number, patch: Partial<MarketRow>) {
    const next = [...marketRows];
    next[i] = { ...next[i], ...patch };
    update('market_data', next as any);
  }
  function addMarketRow() {
    update('market_data', [...marketRows, { packaging: '', price_ppv_dhs: null, price_ph_dhs: null, laboratory: '', status: 'Commercialisé' }] as any);
  }
  function removeMarketRow(i: number) {
    update('market_data', marketRows.filter((_, idx) => idx !== i) as any);
  }

  // ── ATC suggestion ──
  function handleAtcChange(value: string) {
    update('atc_code', value);
    const key = classifyByAtc(value);
    const label = key ? THERAPEUTIC_CATEGORIES.find(c => c.key === key)?.label ?? null : null;
    setAtcSuggestion(label);
  }
  function applyAtcSuggestion() {
    if (atcSuggestion) update('therapeutic_group', atcSuggestion);
  }

  // ── Save flow ──
  async function performSave(finalDraft: MedicamentDraft, letter: string, baseRecord: Medicament | undefined) {
    setSaving(true);
    try {
      const { noKnownContraindications, noAtcJustified, ...record } = finalDraft;
      const saved = await saveMedicament(record as Medicament, letter, baseRecord);
      invalidateLetter(letter);
      resetDrugGroupsCache();
      onSaved(saved, letter);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const validationErrors = validateMedicament(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    if (!compositionConsistent && !consistencyAck) {
      return; // block until the user explicitly acknowledges the warning
    }

    const letter = letterOf(draft.brand_name);
    const letterRecords = await loadLetter(letter);
    const collisions = findBrandCollisions(draft.brand_name, isEdit ? initialRecord!.id : undefined, letterRecords);

    if (collisions.length > 0) {
      // Handing off to the modal below — resolveDuplicate() performs the save itself once the user picks merge/distinct.
      setPendingDuplicate({ collisions });
      return;
    }

    let finalDraft = draft;
    const baseRecord: Medicament | undefined = isEdit ? initialRecord : undefined;

    if (!finalDraft.id) {
      finalDraft = { ...finalDraft, id: `${slugify(finalDraft.brand_name)}_${slugify(finalDraft.generic_name || '')}` };
    }

    await performSave(finalDraft, letter, baseRecord);
  }

  function resolveDuplicate(choice: 'merge' | 'distinct') {
    if (!pendingDuplicate) return;
    const match = pendingDuplicate.collisions[0];
    const letter = letterOf(draft.brand_name);

    if (choice === 'merge') {
      const mergedMarketData = [...(match.market_data ?? []), ...(draft.market_data ?? [])];
      const finalDraft: MedicamentDraft = { ...draft, id: match.id, market_data: mergedMarketData };
      setPendingDuplicate(null);
      setDraft(finalDraft);
      performSave(finalDraft, letter, match);
    } else {
      const finalDraft: MedicamentDraft = {
        ...draft,
        id: draft.id || `${slugify(draft.brand_name)}_${slugify(draft.generic_name || '')}_${Date.now().toString(36)}`,
      };
      setPendingDuplicate(null);
      setDraft(finalDraft);
      performSave(finalDraft, letter, isEdit ? initialRecord : undefined);
    }
  }

  // ── Render ──

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          {isEdit ? `Modifier — ${initialRecord?.brand_name}` : 'Ajouter un médicament'}
        </h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition">
          <X size={20} />
        </button>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium mb-1 flex items-center gap-1"><AlertTriangle size={14} /> Impossible d'enregistrer :</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map(e => <li key={e.field}>{e.message}</li>)}
          </ul>
        </div>
      )}

      {/* Identité */}
      <Section title="Identité">
        <Field label="Nom commercial *" error={errorFor('brand_name')}>
          <input className={inputCls} value={draft.brand_name} onChange={e => update('brand_name', e.target.value)} />
        </Field>
        <Field label="Nom générique (DCI)">
          <input className={inputCls} value={draft.generic_name ?? ''} onChange={e => update('generic_name', e.target.value)} />
        </Field>
        <Field label="Composition (principes actifs) *" full error={errorFor('composition')}>
          <div className="space-y-2">
            {(draft.composition ?? []).map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputCls} value={c ?? ''} placeholder="Ex: Amoxicilline"
                  onChange={e => setCompositionRow(i, e.target.value)} />
                <button onClick={() => removeCompositionRow(i)} className="text-slate-400 hover:text-red-500 transition px-2">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button onClick={addCompositionRow} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              <Plus size={14} /> Ajouter un principe actif
            </button>
            {!compositionConsistent && (draft.composition?.length ?? 0) > 0 && draft.generic_name && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <div>
                  <p>Aucun principe actif de la composition ne correspond au nom générique saisi. Vérifiez qu'il n'y a pas d'erreur de saisie (type d'erreur déjà rencontré : mauvais principe actif attribué à une marque).</p>
                  <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                    <input type="checkbox" checked={consistencyAck} onChange={e => setConsistencyAck(e.target.checked)} />
                    Je confirme, cette divergence est correcte.
                  </label>
                </div>
              </div>
            )}
          </div>
        </Field>
        <Field label="Laboratoire">
          <input className={inputCls} value={(draft.market_data?.[0]?.laboratory as string) ?? ''}
            onChange={e => setMarketRow(0, { laboratory: e.target.value })} />
        </Field>
      </Section>

      {/* Classification */}
      <Section title="Classification">
        <Field label="Code ATC" error={errorFor('atc_code')}>
          <input className={inputCls} value={draft.atc_code ?? ''} placeholder="Ex: J01CA04"
            onChange={e => handleAtcChange(e.target.value)} />
          {atcSuggestion && atcSuggestion !== draft.therapeutic_group && (
            <button onClick={applyAtcSuggestion} className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1">
              <Check size={12} /> Suggestion : classer dans « {atcSuggestion} »
            </button>
          )}
        </Field>
        <Field label="Nature du produit">
          <select className={inputCls} value={draft.nature_produit ?? 'Médicament'}
            onChange={e => update('nature_produit', e.target.value)}>
            <option value="Médicament">Médicament</option>
            <option value="Complément alimentaire">Complément alimentaire</option>
            <option value="Dispositif médical">Dispositif médical</option>
            <option value="Non classé">Non classé</option>
          </select>
          {!draft.atc_code?.trim() && draft.nature_produit !== 'Médicament' && (
            <label className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={!!draft.noAtcJustified} onChange={e => update('noAtcJustified', e.target.checked)} />
              Confirmer : ce produit n'a pas de code ATC (pas une AMM médicamenteuse classique).
            </label>
          )}
        </Field>
        <Field label="Groupe thérapeutique" full>
          <input className={inputCls} value={draft.therapeutic_group ?? ''} onChange={e => update('therapeutic_group', e.target.value)} />
        </Field>
        <Field label="Classe médicamenteuse" full>
          <input className={inputCls} value={draft.drug_class ?? ''} onChange={e => update('drug_class', e.target.value)} />
        </Field>
      </Section>

      {/* Pharmacologie */}
      <Section title="Pharmacologie">
        <Field label="Mécanisme d'action" full>
          <textarea className={textareaCls} value={draft.mechanism ?? ''} onChange={e => update('mechanism', e.target.value)} />
        </Field>
        <Field label="Demi-vie">
          <input className={inputCls} value={draft.half_life ?? ''} onChange={e => update('half_life', e.target.value)} />
        </Field>
      </Section>

      {/* Sécurité clinique */}
      <Section title="Sécurité clinique">
        <Field label="Indications" full>
          <textarea className={textareaCls} value={arrayToLines(draft.indications)} placeholder="Une indication par ligne"
            onChange={e => update('indications', linesToArray(e.target.value))} />
        </Field>
        <Field label="Contre-indications *" full error={errorFor('contraindications')}>
          <textarea className={textareaCls} value={arrayToLines(draft.contraindications)} placeholder="Une contre-indication par ligne"
            onChange={e => update('contraindications', linesToArray(e.target.value))}
            disabled={draft.noKnownContraindications} />
          <label className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={!!draft.noKnownContraindications}
              onChange={e => update('noKnownContraindications', e.target.checked)} />
            Aucune contre-indication connue (confirmation explicite)
          </label>
        </Field>

        <Field label="Interactions médicamenteuses" full>
          <div className="space-y-2">
            {interactions.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
                <input className={inputCls} placeholder="Médicament" value={it.drug} onChange={e => setInteraction(i, { drug: e.target.value })} />
                <select className={inputCls} value={it.severity} onChange={e => setInteraction(i, { severity: e.target.value })}>
                  <option value="mineure">Mineure</option>
                  <option value="modérée">Modérée</option>
                  <option value="majeure">Majeure</option>
                </select>
                <input className={inputCls} placeholder="Effet" value={it.effect} onChange={e => setInteraction(i, { effect: e.target.value })} />
                <button onClick={() => removeInteraction(i)} className="text-slate-400 hover:text-red-500 transition px-2"><Trash2 size={16} /></button>
              </div>
            ))}
            <button onClick={addInteraction} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              <Plus size={14} /> Ajouter une interaction
            </button>
          </div>
        </Field>

        <Field label="Grossesse *" full error={errorFor('pregnancy')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className={inputCls} placeholder="Catégorie (ex: C)" value={draft.pregnancy?.category ?? ''}
              onChange={e => updateNested('pregnancy', { category: e.target.value })} />
            <input className={inputCls} placeholder="Avertissement" value={draft.pregnancy?.warning ?? ''}
              onChange={e => updateNested('pregnancy', { warning: e.target.value })} />
            <input className={inputCls} placeholder="Allaitement" value={draft.pregnancy?.breastfeeding ?? ''}
              onChange={e => updateNested('pregnancy', { breastfeeding: e.target.value })} />
          </div>
          {!draft.pregnancy?.category && !draft.pregnancy?.warning && !draft.pregnancy?.breastfeeding && (
            <button className="text-xs text-blue-600 hover:text-blue-800 mt-1"
              onClick={() => updateNested('pregnancy', { warning: 'Non documenté' })}>
              Marquer comme « non documenté »
            </button>
          )}
        </Field>

        <Field label="Enfants *" full error={errorFor('children')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select className={inputCls}
              value={draft.children?.allowed === undefined ? '' : String(draft.children.allowed)}
              onChange={e => updateNested('children', { allowed: e.target.value === '' ? undefined : e.target.value === 'true' })}>
              <option value="">Non renseigné</option>
              <option value="true">Autorisé</option>
              <option value="false">Contre-indiqué</option>
            </select>
            <input className={inputCls} type="number" placeholder="Âge min (années)" value={draft.children?.min_age ?? ''}
              onChange={e => updateNested('children', { min_age: e.target.value ? Number(e.target.value) : undefined })} />
            <input className={inputCls} placeholder="Règle de dose" value={draft.children?.dose_rule ?? ''}
              onChange={e => updateNested('children', { dose_rule: e.target.value })} />
          </div>
          <input className={`${inputCls} mt-2`} placeholder="Avertissement" value={draft.children?.warning ?? ''}
            onChange={e => updateNested('children', { warning: e.target.value })} />
          {draft.children?.allowed === undefined && !draft.children?.warning && !draft.children?.dose_rule && (
            <button className="text-xs text-blue-600 hover:text-blue-800 mt-1"
              onClick={() => updateNested('children', { warning: 'Non documenté' })}>
              Marquer comme « non documenté »
            </button>
          )}
        </Field>

        <Field label="Adaptation rénale" full>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={!!draft.renal_adjustment?.required}
                onChange={e => updateNested('renal_adjustment', { required: e.target.checked })} />
              Adaptation requise
            </label>
            <input className={inputCls} placeholder="Règle" value={draft.renal_adjustment?.rule ?? ''}
              onChange={e => updateNested('renal_adjustment', { rule: e.target.value })} />
          </div>
        </Field>

        <Field label="Effets indésirables" full>
          <textarea className={textareaCls} value={arrayToLines(draft.adverse_effects)} placeholder="Un effet par ligne"
            onChange={e => update('adverse_effects', linesToArray(e.target.value))} />
        </Field>
      </Section>

      {/* Présentation */}
      <Section title="Présentation">
        <Field label="Forme">
          <input className={inputCls} value={draft.form ?? ''} onChange={e => update('form', e.target.value)} />
        </Field>
        <Field label="Voie d'administration">
          <input className={inputCls} value={draft.route ?? ''} onChange={e => update('route', e.target.value)} />
        </Field>
        <Field label="Dosage adulte">
          <input className={inputCls} value={draft.dosage?.adult ?? ''} onChange={e => updateNested('dosage', { adult: e.target.value })} />
        </Field>
        <Field label="Dosage enfant">
          <input className={inputCls} value={draft.dosage?.children ?? ''} onChange={e => updateNested('dosage', { children: e.target.value })} />
        </Field>
        <Field label="Conditionnement / prix" full>
          <div className="space-y-2">
            {marketRows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px_100px_1fr_auto] gap-2">
                <input className={inputCls} placeholder="Conditionnement" value={row.packaging ?? ''}
                  onChange={e => setMarketRow(i, { packaging: e.target.value })} />
                <input className={inputCls} type="number" placeholder="PPV (DHS)" value={row.price_ppv_dhs ?? ''}
                  onChange={e => setMarketRow(i, { price_ppv_dhs: e.target.value ? Number(e.target.value) : null })} />
                <input className={inputCls} type="number" placeholder="PH (DHS)" value={row.price_ph_dhs ?? ''}
                  onChange={e => setMarketRow(i, { price_ph_dhs: e.target.value ? Number(e.target.value) : null })} />
                <input className={inputCls} placeholder="Laboratoire" value={row.laboratory ?? ''}
                  onChange={e => setMarketRow(i, { laboratory: e.target.value })} />
                <button onClick={() => removeMarketRow(i)} className="text-slate-400 hover:text-red-500 transition px-2"><Trash2 size={16} /></button>
              </div>
            ))}
            <button onClick={addMarketRow} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
              <Plus size={14} /> Ajouter un conditionnement
            </button>
          </div>
        </Field>
      </Section>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition">
          Annuler
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition flex items-center gap-1.5">
          <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Duplicate collision modal */}
      {pendingDuplicate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
              <Info size={16} className="text-amber-500" /> Nom déjà utilisé
            </h3>
            <p className="text-sm text-slate-600 mb-3">
              « {draft.brand_name} » existe déjà dans ce fichier lettre :
            </p>
            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
              {pendingDuplicate.collisions.map(c => (
                <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs">
                  <p className="font-medium text-slate-800">{c.brand_name}</p>
                  <p className="text-slate-500">{c.generic_name} — {(c.composition ?? []).join(', ') || 'composition non renseignée'}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mb-3">S'agit-il de la même molécule (nouvelle présentation) ou d'un médicament réellement différent partageant ce nom commercial ?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => resolveDuplicate('merge')}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                Même médicament — regrouper
              </button>
              <button onClick={() => resolveDuplicate('distinct')}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 transition">
                Médicament différent — créer distinct
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
