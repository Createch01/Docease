import React, { useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, Edit2, X, Phone, Users, Check } from 'lucide-react';
import { dataService } from '../services/dataService';
import { toastService } from '../services/toastService';
import { Patient, PatientType } from '../types';
import WhatsAppConsentField, { WhatsAppConsent } from './WhatsAppConsentField';
import { calculateAgeYears, getAgeCategory, formatDate } from '../utils/formatters';

interface Form {
  lastName: string;
  firstName: string;
  phone: string;
  dateOfBirth: string;
  sex: 'M' | 'F' | '';
  whatsappConsent: WhatsAppConsent;
  whatsappConsentAt?: string;
}

const BLANK: Form = { lastName: '', firstName: '', phone: '', dateOfBirth: '', sex: '', whatsappConsent: undefined };
const MAX_SHOWN = 100;

// Page « Patients » de l'assistante : liste, recherche (nom, prénom, téléphone), création
// et modification de l'IDENTITÉ uniquement (nom, prénom, téléphone, date de naissance,
// sexe). Elle passe par les commandes typées de Rust (patients_*_identity) : les dossiers
// médicaux n'arrivent jamais ici et ne sont jamais écrasés.
const PatientDirectory: React.FC = () => {
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = () => setTick(t => t + 1);
    window.addEventListener('meddoc_data_update', h);
    return () => window.removeEventListener('meddoc_data_update', h);
  }, []);

  const patients = useMemo(() => dataService.getAllPatients(), [tick]);
  const queueIds = useMemo(() => new Set(dataService.getTodayQueue().map(p => p.id)), [tick]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = !q ? patients : patients.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      (digits.length >= 2 && (p.phone || '').replace(/\D/g, '').includes(digits)));
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
  }, [patients, search]);

  const startEdit = (p: Patient) => {
    // Anciennes fiches sans nom/prénom séparés : « NOM Prénom » → découpage.
    const [lastGuess = '', ...rest] = (p.name || '').split(/\s+/);
    setForm({
      lastName: p.lastName ?? lastGuess,
      firstName: p.firstName ?? rest.join(' '),
      phone: p.phone || '',
      dateOfBirth: p.dateOfBirth || '',
      sex: p.sex || '',
      whatsappConsent: p.whatsappConsent,
      whatsappConsentAt: p.whatsappConsentAt,
    });
    setEditingId(p.id);
  };

  const close = () => { setForm(null); setEditingId(null); };

  const save = async (): Promise<Patient | null> => {
    if (!form) return null;
    if (!form.lastName.trim()) { toastService.error('Le nom est requis.'); return null; }
    if (form.sex !== 'M' && form.sex !== 'F') { toastService.error('Le sexe est requis.'); return null; }
    setBusy(true);
    try {
      const category = getAgeCategory(form.dateOfBirth || undefined);
      const type: PatientType = category?.isPediatric ? 'Child' : form.sex === 'F' ? 'Woman' : 'Adult';
      const lastName = form.lastName.trim().toUpperCase();
      const firstName = form.firstName.trim();
      const existing = editingId ? patients.find(p => p.id === editingId) : undefined;
      const saved = await dataService.savePatientProfile({
        ...(existing || {}),
        id: editingId || Date.now().toString(),
        name: `${lastName} ${firstName}`.trim(),
        lastName, firstName,
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        age: calculateAgeYears(form.dateOfBirth || undefined) ?? existing?.age ?? 0,
        sex: form.sex,
        type,
        // Le consentement n'est (re)datÃ© que s'il change ; Rust pose la date et l'auteur Ã  l'enregistrement.
        whatsappConsent: form.whatsappConsent,
        whatsappConsentAt: form.whatsappConsent === existing?.whatsappConsent ? existing?.whatsappConsentAt : form.whatsappConsent ? new Date().toISOString() : undefined,
      } as Patient);
      toastService.success(editingId ? 'Identité mise à jour' : 'Patient créé');
      close();
      return saved;
    } catch {
      toastService.error("Enregistrement impossible.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const addToQueue = async (p: Patient) => {
    await dataService.saveToQueue(p);
    toastService.success(`${p.name} ajouté(e) à la salle d'attente`);
  };

  const input = 'w-full h-11 px-3 rounded-lg border text-[14px] outline-none bg-white';
  const inputStyle = { borderColor: 'var(--color-border)' } as React.CSSProperties;
  const set = (patch: Partial<Form>) => setForm(f => (f ? { ...f, ...patch } : f));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <Users size={22} /> Patients
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-subtle)' }}>
            Identité et contact : nom, prénom, téléphone, date de naissance, sexe.
          </p>
        </div>
        <button type="button" onClick={() => { setForm(BLANK); setEditingId(null); }}
          className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2"
          style={{ background: 'var(--color-primary)' }}>
          <UserPlus size={15} /> Nouveau patient
        </button>
      </div>

      {form && (
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>{editingId ? "Modifier l'identité" : 'Nouveau patient'}</h2>
            <button type="button" onClick={close} aria-label="Fermer" style={{ color: 'var(--color-text-faint)' }}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={input} style={inputStyle} placeholder="Nom" aria-label="Nom" autoFocus value={form.lastName} onChange={e => set({ lastName: e.target.value })} />
            <input className={input} style={inputStyle} placeholder="Prénom" aria-label="Prénom" value={form.firstName} onChange={e => set({ firstName: e.target.value })} />
            <input className={input} style={inputStyle} placeholder="Téléphone" aria-label="Téléphone" type="tel" value={form.phone} onChange={e => set({ phone: e.target.value })} />
            <input className={input} style={inputStyle} aria-label="Date de naissance" type="date" max={new Date().toISOString().split('T')[0]} value={form.dateOfBirth} onChange={e => set({ dateOfBirth: e.target.value })} />
            <div className="flex gap-2 sm:col-span-2" role="radiogroup" aria-label="Sexe">
              {([['M', 'Homme'], ['F', 'Femme']] as const).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={form.sex === v} onClick={() => set({ sex: v })}
                  className="h-11 px-5 rounded-lg border text-[14px] font-medium"
                  style={{ borderColor: form.sex === v ? 'var(--color-primary)' : 'var(--color-border)', background: form.sex === v ? 'var(--color-primary-50)' : 'white', color: form.sex === v ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <WhatsAppConsentField value={form.whatsappConsent} at={form.whatsappConsentAt} onChange={v => set({ whatsappConsent: v })} />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()}
              className="h-10 px-4 rounded-lg text-white text-[13px] font-medium flex items-center gap-2 disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
              <Check size={15} /> Enregistrer
            </button>
            {!editingId && (
              <button type="button" disabled={busy} onClick={async () => { const p = await save(); if (p) await addToQueue(p); }}
                className="h-10 px-4 rounded-lg border text-[13px] font-medium disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                Enregistrer et mettre en salle d'attente
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-faint)' }} />
        <input className={`${input} pl-9`} style={inputStyle} placeholder="Rechercher par nom ou téléphone…" aria-label="Rechercher un patient"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        {results.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] italic" style={{ color: 'var(--color-text-faint)' }}>
            {search ? 'Aucun patient trouvé.' : 'Aucun patient enregistré.'}
          </div>
        ) : (
          <ul>
            {results.slice(0, MAX_SHOWN).map(p => (
              <li key={p.id} className="px-5 py-3 flex flex-wrap items-center gap-3 text-[13px] border-t first:border-t-0" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-[180px] flex-1">
                  <div className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{p.name}</div>
                  <div className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
                    {p.sex === 'F' ? 'Femme' : 'Homme'}{p.dateOfBirth ? ` · né(e) le ${formatDate(p.dateOfBirth)}` : ''}
                  </div>
                </div>
                {p.phone && <span className="flex items-center gap-1.5 tabular-nums" style={{ color: 'var(--color-text-muted)' }}><Phone size={13} />{p.phone}</span>}
                <button type="button" onClick={() => startEdit(p)} aria-label={`Modifier ${p.name}`} className="p-2 rounded-lg" style={{ color: 'var(--color-text-subtle)' }}><Edit2 size={15} /></button>
                <button type="button" disabled={queueIds.has(p.id)} onClick={() => void addToQueue(p)}
                  className="h-9 px-3 rounded-lg border text-[12px] font-medium disabled:opacity-50" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                  {queueIds.has(p.id) ? "En salle d'attente" : "Mettre en salle d'attente"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {results.length > MAX_SHOWN && (
          <div className="px-5 py-3 text-[12px] border-t" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }}>
            {MAX_SHOWN} premiers résultats sur {results.length} : précisez la recherche.
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientDirectory;
