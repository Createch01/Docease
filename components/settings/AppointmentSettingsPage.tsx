/**
 * Paramètres › Rendez-vous — horaires, mode et capacité, types de consultation,
 * fermetures. Les quatre onglets éditent le même brouillon (sharedDraft) et
 * partagent un seul bouton Enregistrer.
 */
import React, { useMemo, useState } from 'react';
import { CalendarOff, CalendarClock, Clock, Gauge, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { AppointmentSettings, AppointmentTypeDef, ClosurePeriod, DaySchedule, TimeRange } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import { defaultAppointmentSettings } from '../../services/appointmentDefaults';
import { parseDate, toDateStr, toMinutes } from '../../services/appointmentService';
import { normalizeRoute } from './settingsRoutes';
import { SettingsPageFrame, SettingsCard, Field, Toggle, Segmented, input40, inputStyle } from './SettingsUI';
import { useUnsavedChanges } from './unsavedChanges';
import { SettingsPageProps } from './ProfileSettings';
import MessagesSettings, { validateMessages } from './MessagesSettings';

const DAYS: { index: number; label: string }[] = [
  { index: 1, label: 'Lundi' }, { index: 2, label: 'Mardi' }, { index: 3, label: 'Mercredi' },
  { index: 4, label: 'Jeudi' }, { index: 5, label: 'Vendredi' }, { index: 6, label: 'Samedi' }, { index: 0, label: 'Dimanche' },
];

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Retourne le premier problème de saisie, ou null. */
const validate = (s: AppointmentSettings): string | null => {
  for (const d of DAYS) {
    const day = s.weekly[d.index];
    if (day.closed) continue;
    if (!day.morning && !day.afternoon) return `${d.label} : ajoutez une plage horaire ou marquez le jour fermé.`;
    for (const r of [day.morning, day.afternoon]) {
      if (r && toMinutes(r.start) >= toMinutes(r.end)) return `${d.label} : l'heure de fin doit suivre l'heure de début.`;
    }
    if (day.morning && day.afternoon && toMinutes(day.morning.end) > toMinutes(day.afternoon.start)) {
      return `${d.label} : l'après-midi doit commencer après la fin du matin.`;
    }
  }
  if (!(s.maxPerDay >= 1)) return 'La capacité par jour doit être au moins 1.';
  if (s.reservedPerDay < 0 || s.reservedPerDay >= s.maxPerDay) return 'Les places réservées doivent être inférieures à la capacité par jour.';
  if (s.types.length === 0) return 'Ajoutez au moins un type de consultation.';
  if (s.types.some(t => !t.name.trim() || !(t.duration >= 5))) return 'Chaque type doit avoir un nom et une durée d\'au moins 5 minutes.';
  if (s.closures.some(c => !c.from || (c.to && c.to < c.from))) return 'Une fermeture a une plage de dates invalide.';
  const msg = validateMessages(s.messages);
  if (msg) return msg;
  return null;
};

const timeInput = 'h-9 w-[104px] px-2 rounded-md border text-[14px] outline-none bg-white';
const numberInput = `${input40} !w-24`;

const RangeEditor: React.FC<{
  label: string; value: TimeRange | null; fallback: TimeRange; onChange: (v: TimeRange | null) => void; disabled?: boolean;
}> = ({ label, value, fallback, onChange, disabled }) => (
  <div className="flex items-center gap-3" style={{ opacity: disabled ? 0.4 : 1 }}>
    <Toggle label={label} checked={!!value} onChange={on => onChange(on ? fallback : null)} />
    <span className="text-[13px] w-[72px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
    {value ? (
      <div className="flex items-center gap-2">
        <input type="time" aria-label={`${label} : début`} className={timeInput} style={inputStyle} value={value.start}
               disabled={disabled} onChange={e => onChange({ ...value, start: e.target.value })} />
        <span style={{ color: 'var(--color-text-subtle)' }}>à</span>
        <input type="time" aria-label={`${label} : fin`} className={timeInput} style={inputStyle} value={value.end}
               disabled={disabled} onChange={e => onChange({ ...value, end: e.target.value })} />
      </div>
    ) : (
      <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>Pas de consultation</span>
    )}
  </div>
);

// Fêtes à date fixe seulement : les fêtes religieuses varient chaque année et sont à saisir à la main.
const FIXED_HOLIDAYS: { md: string; label: string }[] = [
  { md: '01-01', label: 'Nouvel an' }, { md: '01-11', label: 'Manifeste de l\'indépendance' },
  { md: '05-01', label: 'Fête du travail' }, { md: '07-30', label: 'Fête du Trône' },
  { md: '08-14', label: 'Oued Eddahab' }, { md: '08-20', label: 'Révolution du Roi et du Peuple' },
  { md: '08-21', label: 'Fête de la jeunesse' }, { md: '11-06', label: 'Marche verte' },
  { md: '11-18', label: 'Fête de l\'indépendance' },
];

const AppointmentSettingsPage: React.FC<SettingsPageProps> = ({ route, onNavigate }) => {
  const tab = normalizeRoute(route).tab;
  const [saved, setSaved] = useState<AppointmentSettings>(() => dataService.getAppointmentSettings());
  const [draft, setDraft] = useState<AppointmentSettings>(saved);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  useUnsavedChanges('agenda', dirty);

  const patch = (p: Partial<AppointmentSettings>) => setDraft(d => ({ ...d, ...p }));
  const setDay = (index: number, p: Partial<DaySchedule>) =>
    setDraft(d => ({ ...d, weekly: d.weekly.map((w, i) => i === index ? { ...w, ...p } : w) }));

  const handleSave = async () => {
    const problem = validate(draft);
    if (problem) { toastService.error(problem); return; }
    await dataService.saveAppointmentSettings(draft);
    setSaved(draft);
    toastService.success('Modifications enregistrées');
  };

  const [closureForm, setClosureForm] = useState({ from: '', to: '', label: '' });
  const addClosure = () => {
    if (!closureForm.from) { toastService.info('Indiquez au moins la date de début.'); return; }
    if (closureForm.to && closureForm.to < closureForm.from) { toastService.info('La date de fin précède la date de début.'); return; }
    const c: ClosurePeriod = { id: newId(), from: closureForm.from, to: closureForm.to || closureForm.from, label: closureForm.label.trim() };
    patch({ closures: [...draft.closures, c] });
    setClosureForm({ from: '', to: '', label: '' });
  };
  const addHolidays = () => {
    const year = new Date().getFullYear();
    const existing = new Set(draft.closures.map(c => c.from + c.to));
    const added: ClosurePeriod[] = [];
    [year, year + 1].forEach(y => FIXED_HOLIDAYS.forEach(h => {
      const d = `${y}-${h.md}`;
      if (d >= toDateStr(new Date()) && !existing.has(d + d)) added.push({ id: newId(), from: d, to: d, label: h.label });
    }));
    patch({ closures: [...draft.closures, ...added] });
    toastService.info(added.length ? `${added.length} jours fériés ajoutés (à enregistrer).` : 'Les jours fériés fixes sont déjà dans la liste.');
  };
  const fmt = (s: string) => parseDate(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const setType = (id: string, p: Partial<AppointmentTypeDef>) =>
    patch({ types: draft.types.map(t => t.id === id ? { ...t, ...p } : t) });

  const numberOrNull = (v: string) => v === '' ? null : Math.max(1, Number(v));
  const normalCap = Math.max(0, draft.maxPerDay - draft.reservedPerDay);
  const sortedClosures = [...draft.closures].sort((a, b) => a.from.localeCompare(b.from));
  const overrides = Object.entries(draft.dayOverrides).sort(([a], [b]) => a.localeCompare(b));
  const weekdayOpen = draft.weekly.filter(d => !d.closed).length;

  return (
    <SettingsPageFrame route={route} onNavigate={onNavigate} dirty={dirty} onSave={handleSave}>
      {tab === 'horaires' && (
        <div className="max-w-3xl">
          <SettingsCard
            title="Horaires de consultation" icon={<Clock size={16} />}
            description={`Une plage le matin et une l'après-midi, par jour. ${weekdayOpen} jour${weekdayOpen > 1 ? 's' : ''} ouvert${weekdayOpen > 1 ? 's' : ''} : l'agenda n'affiche que ces jours. Distincts du texte « Horaires » de la fiche Cabinet.`}
          >
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {DAYS.map(({ index, label }) => {
                const day = draft.weekly[index];
                return (
                  <div key={index} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="flex items-center gap-3 w-40">
                      <Toggle label={`${label} ouvert`} checked={!day.closed} onChange={open => setDay(index, {
                        closed: !open,
                        ...(open && !day.morning && !day.afternoon ? { morning: { start: '09:00', end: '13:00' } } : {}),
                      })} />
                      <span className="text-[14px] font-medium" style={{ color: day.closed ? 'var(--color-text-faint)' : 'var(--color-text)' }}>{label}</span>
                    </div>
                    {day.closed ? (
                      <span className="text-[12px]" style={{ color: 'var(--color-text-faint)' }}>Fermé</span>
                    ) : (
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <RangeEditor label="Matin" value={day.morning} fallback={{ start: '09:00', end: '13:00' }} onChange={v => setDay(index, { morning: v })} />
                        <RangeEditor label="Après-midi" value={day.afternoon} fallback={{ start: '15:00', end: '19:00' }} onChange={v => setDay(index, { afternoon: v })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}
                      onClick={() => setDraft(d => {
                        const mon = d.weekly[1];
                        return { ...d, weekly: d.weekly.map((w, i) => i >= 2 && i <= 5 ? { ...mon } : w) };
                      })}>
                Copier le lundi sur mardi–vendredi
              </button>
              <button type="button" className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--color-text-subtle)' }}
                      onClick={() => patch({ weekly: defaultAppointmentSettings().weekly })}>
                Rétablir les horaires par défaut
              </button>
            </div>
          </SettingsCard>
        </div>
      )}

      {tab === 'capacite' && (
        <div className="space-y-5 max-w-3xl">
          <SettingsCard title="Mode de fonctionnement" icon={<CalendarClock size={16} />}
                        description="Change la façon de donner rendez-vous : les rendez-vous déjà pris ne sont pas modifiés.">
            <div className="max-w-md">
              <Segmented<'time' | 'order'> value={draft.mode} onChange={mode => patch({ mode })}
                options={[{ id: 'time', label: 'Par heure' }, { id: 'order', label: 'Par ordre d\'arrivée' }]} />
            </div>
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {draft.mode === 'time'
                ? 'Le patient reçoit un créneau horaire ; la durée du type de consultation est prise en compte.'
                : 'Le patient reçoit un numéro d\'ordre pour la journée, sans heure précise.'}
            </p>
            {draft.mode === 'time' && (
              <div className="max-w-[220px]">
                <Field label="Pas de la grille">
                  <select className={input40} style={inputStyle} value={draft.slotStep} onChange={e => patch({ slotStep: Number(e.target.value) })}>
                    {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n} minutes</option>)}
                  </select>
                </Field>
              </div>
            )}
          </SettingsCard>

          <SettingsCard title="Capacité" icon={<Gauge size={16} />} description="Nombre maximum de patients, par défaut pour tous les jours.">
            <div className="flex flex-wrap gap-6">
              <Field label="Patients par jour">
                <input type="number" min={1} className={numberInput} style={inputStyle} value={draft.maxPerDay}
                       onChange={e => patch({ maxPerDay: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Places réservées">
                <input type="number" min={0} className={numberInput} style={inputStyle} value={draft.reservedPerDay}
                       onChange={e => patch({ reservedPerDay: Math.max(0, Number(e.target.value) || 0) })} />
              </Field>
              <Field label="Max. matin (option)">
                <input type="number" min={1} placeholder="Illimité" className={numberInput} style={inputStyle}
                       value={draft.maxPerHalfDay.morning ?? ''} onChange={e => patch({ maxPerHalfDay: { ...draft.maxPerHalfDay, morning: numberOrNull(e.target.value) } })} />
              </Field>
              <Field label="Max. après-midi (option)">
                <input type="number" min={1} placeholder="Illimité" className={numberInput} style={inputStyle}
                       value={draft.maxPerHalfDay.afternoon ?? ''} onChange={e => patch({ maxPerHalfDay: { ...draft.maxPerHalfDay, afternoon: numberOrNull(e.target.value) } })} />
              </Field>
            </div>
            <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
              {normalCap} place{normalCap > 1 ? 's' : ''} proposée{normalCap > 1 ? 's' : ''} à la prise de rendez-vous, plus {draft.reservedPerDay} réservée{draft.reservedPerDay > 1 ? 's' : ''} aux urgences et patients sans rendez-vous (utilisables par « Forcer »).
            </p>
            {overrides.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>Capacités modifiées pour certains jours</p>
                {overrides.map(([date, o]) => (
                  <div key={date} className="flex items-center gap-3 text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    <span className="w-44">{fmt(date)}</span><span>{o.maxPerDay} patients</span>
                    <button type="button" aria-label={`Retirer la capacité du ${fmt(date)}`} className="ml-auto p-1 rounded hover:bg-white"
                            style={{ color: 'var(--color-text-faint)' }}
                            onClick={() => { const { [date]: _r, ...rest } = draft.dayOverrides; patch({ dayOverrides: rest }); }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SettingsCard>
        </div>
      )}

      {tab === 'types' && (
        <div className="max-w-3xl">
          <SettingsCard title="Types de consultation" icon={<Stethoscope size={16} />}
                        description="Le type choisi fixe la durée du rendez-vous et sa couleur dans l'agenda."
                        actions={<button type="button" onClick={() => patch({ types: [...draft.types, { id: newId(), name: '', duration: 20, color: '#F6AD55' }] })}
                                         className="h-8 px-3 rounded-md text-[12px] font-medium flex items-center gap-1.5 border bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                          <Plus size={14} /> Ajouter
                        </button>}>
            <div className="space-y-2">
              {draft.types.map(t => (
                <div key={t.id} className="flex items-center gap-3">
                  <input type="color" aria-label={`Couleur de ${t.name || 'ce type'}`} value={t.color} onChange={e => setType(t.id, { color: e.target.value })}
                         className="w-10 h-10 p-1 rounded-md border bg-white cursor-pointer" style={{ borderColor: 'var(--color-border)' }} />
                  <input type="text" aria-label="Nom du type" placeholder="Nom" className={`${input40} flex-1`} style={inputStyle}
                         value={t.name} onChange={e => setType(t.id, { name: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <input type="number" min={5} step={5} aria-label="Durée en minutes" className={numberInput} style={inputStyle}
                           value={t.duration} onChange={e => setType(t.id, { duration: Math.max(0, Number(e.target.value) || 0) })} />
                    <span className="text-[13px]" style={{ color: 'var(--color-text-subtle)' }}>min</span>
                  </div>
                  <button type="button" aria-label={`Supprimer ${t.name || 'ce type'}`} disabled={draft.types.length <= 1}
                          onClick={() => patch({ types: draft.types.filter(x => x.id !== t.id) })}
                          className="p-2 rounded-md hover:bg-white disabled:opacity-30" style={{ color: 'var(--color-danger)' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
              Supprimer un type ne modifie pas les rendez-vous déjà pris : ils gardent leur libellé et leur durée.
            </p>
          </SettingsCard>
        </div>
      )}

      {tab === 'fermetures' && (
        <div className="max-w-3xl">
          <SettingsCard title="Congés et jours fériés" icon={<CalendarOff size={16} />}
                        description="Aucun rendez-vous ne peut être pris ces jours-là (sauf avec « Forcer » pour une urgence)."
                        actions={<button type="button" onClick={addHolidays} className="h-8 px-3 rounded-md text-[12px] font-medium border bg-white"
                                         style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                          Ajouter les jours fériés fixes
                        </button>}>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Du"><input type="date" className={`${input40} !w-40`} style={inputStyle} value={closureForm.from} onChange={e => setClosureForm(f => ({ ...f, from: e.target.value }))} /></Field>
              <Field label="Au (optionnel)"><input type="date" className={`${input40} !w-40`} style={inputStyle} min={closureForm.from} value={closureForm.to} onChange={e => setClosureForm(f => ({ ...f, to: e.target.value }))} /></Field>
              <div className="flex-1 min-w-[160px]">
                <Field label="Motif (optionnel)"><input type="text" className={input40} style={inputStyle} placeholder="Congés d'été" value={closureForm.label}
                                                          onChange={e => setClosureForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addClosure()} /></Field>
              </div>
              <button type="button" onClick={addClosure} className="h-10 px-4 rounded-md text-[13px] font-medium text-white flex items-center gap-1.5" style={{ background: 'var(--color-primary)' }}>
                <Plus size={15} /> Ajouter
              </button>
            </div>
            {sortedClosures.length === 0 ? (
              <p className="text-[13px] pt-2" style={{ color: 'var(--color-text-subtle)' }}>Aucune fermeture.</p>
            ) : (
              <ul className="divide-y pt-1" style={{ borderColor: 'var(--color-border)' }}>
                {sortedClosures.map(c => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5 text-[13px]" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>{c.from === c.to ? fmt(c.from) : `${fmt(c.from)} → ${fmt(c.to)}`}</span>
                    {c.label && <span style={{ color: 'var(--color-text-muted)' }}>{c.label}</span>}
                    <button type="button" aria-label="Supprimer cette fermeture" className="ml-auto p-1.5 rounded hover:bg-white" style={{ color: 'var(--color-danger)' }}
                            onClick={() => patch({ closures: draft.closures.filter(x => x.id !== c.id) })}>
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SettingsCard>
        </div>
      )}
      {tab === 'messages' && <MessagesSettings draft={draft} patch={patch} />}
    </SettingsPageFrame>
  );
};

export default AppointmentSettingsPage;
