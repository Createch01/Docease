import React, { useState, useMemo } from 'react';
import { Save, Edit2, X, Syringe, Users, Scissors, Baby, Cigarette, Wine, Activity, Briefcase, Droplet } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { vaccinationService } from '../../services/vaccinationService';
// @ts-ignore
import { toastService } from '../../services/toastService';
import { Patient } from '../../types';

interface AntecedentsSectionProps {
  patient: Patient;
  refreshTrigger: number;
  onNavigate: (tab: any) => void;
}

type FormState = Pick<Patient,
  'bloodType' | 'familyHistory' | 'surgicalHistory' |
  'pregnanciesCount' | 'deliveriesCount' | 'miscarriagesCount' |
  'smokingStatus' | 'smokingDetail' | 'alcoholUse' | 'physicalActivity' | 'profession'
>;

const toFormState = (p: Patient): FormState => ({
  bloodType: p.bloodType || '',
  familyHistory: p.familyHistory || '',
  surgicalHistory: p.surgicalHistory || '',
  pregnanciesCount: p.pregnanciesCount,
  deliveriesCount: p.deliveriesCount,
  miscarriagesCount: p.miscarriagesCount,
  smokingStatus: p.smokingStatus,
  smokingDetail: p.smokingDetail || '',
  alcoholUse: p.alcoholUse,
  physicalActivity: p.physicalActivity || '',
  profession: p.profession || '',
});

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</label>
    {children}
  </div>
);

const inputClass = "w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-800 outline-none focus:border-emerald-400 transition-all";

const AntecedentsSection: React.FC<AntecedentsSectionProps> = ({ patient, refreshTrigger, onNavigate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(patient));
  const [saving, setSaving] = useState(false);

  const vaccineStatus = useMemo(() => vaccinationService.getVaccinationStatus(patient), [patient, refreshTrigger]);
  const overdueCount = vaccineStatus.filter(s => s.status === 'OVERDUE').length;
  const dueCount = vaccineStatus.filter(s => s.status === 'DUE').length;
  const doneCount = vaccineStatus.filter(s => s.status === 'DONE').length;

  const startEdit = () => {
    setForm(toFormState(patient));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setForm(toFormState(patient));
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await dataService.savePatientProfile({ ...patient, ...form });
      toastService.success('Antécédents enregistrés.');
      setIsEditing(false);
    } catch (e) {
      toastService.error("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const hasPersonalHistory = (patient.pathologyTags?.length || 0) > 0 || (patient.pathologiesOtherTags?.length || 0) > 0 || !!patient.pathologies;

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">

      {/* Antécédents personnels (lecture seule ici — saisis en consultation) */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 mb-4">
          <Activity size={14} /> Antécédents personnels médicaux
        </h4>
        {hasPersonalHistory ? (
          <div className="flex flex-wrap gap-2">
            {(patient.pathologyTags || []).map((tag, i) => (
              <span key={`t-${i}`} className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[11px] font-bold border border-amber-100">{tag}</span>
            ))}
            {(patient.pathologiesOtherTags || []).map((tag, i) => (
              <span key={`o-${i}`} className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[11px] font-bold border border-amber-100">{tag}</span>
            ))}
            {!patient.pathologyTags?.length && !patient.pathologiesOtherTags?.length && patient.pathologies && (
              <p className="text-sm text-gray-700 italic">{patient.pathologies}</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] font-semibold text-gray-400">Aucune pathologie déclarée.</p>
        )}
        <p className="text-[10px] text-gray-300 font-medium mt-3">Modifiable depuis une consultation ou une ordonnance.</p>
      </div>

      {/* Champs éditables : groupe sanguin, familiaux, chirurgicaux, gynéco, habitudes de vie */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Users size={14} /> Antécédents familiaux, chirurgicaux & habitudes de vie
          </h4>
          {!isEditing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-300 rounded-lg text-[11px] font-bold transition-all"
            >
              <Edit2 size={12} /> Modifier
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={cancelEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-400 hover:text-red-500 rounded-lg text-[11px] font-bold transition-all"
              >
                <X size={12} /> Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 rounded-lg text-[11px] font-bold transition-all"
              >
                <Save size={12} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Groupe sanguin">
            {isEditing ? (
              <select
                value={form.bloodType || ''}
                onChange={e => setForm({ ...form, bloodType: e.target.value || undefined })}
                className={inputClass}
              >
                <option value="">Non renseigné</option>
                {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(bt => <option key={bt} value={bt}>{bt}</option>)}
              </select>
            ) : (
              <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Droplet size={13} className="text-gray-300" />{patient.bloodType || <span className="text-gray-300 font-medium">Non renseigné</span>}
              </p>
            )}
          </Field>

          <Field label="Profession">
            {isEditing ? (
              <input type="text" value={form.profession || ''} onChange={e => setForm({ ...form, profession: e.target.value })} className={inputClass} placeholder="Ex : Enseignant" />
            ) : (
              <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Briefcase size={13} className="text-gray-300" />{patient.profession || <span className="text-gray-300 font-medium">Non renseignée</span>}
              </p>
            )}
          </Field>

          <Field label="Activité physique">
            {isEditing ? (
              <input type="text" value={form.physicalActivity || ''} onChange={e => setForm({ ...form, physicalActivity: e.target.value })} className={inputClass} placeholder="Ex : 2x/semaine" />
            ) : (
              <p className="text-sm font-bold text-gray-800">{patient.physicalActivity || <span className="text-gray-300 font-medium">Non renseignée</span>}</p>
            )}
          </Field>

          <Field label="Tabac">
            {isEditing ? (
              <div className="flex gap-2">
                <select value={form.smokingStatus || ''} onChange={e => setForm({ ...form, smokingStatus: (e.target.value || undefined) as FormState['smokingStatus'] })} className={inputClass}>
                  <option value="">Non renseigné</option>
                  <option value="Non">Non</option>
                  <option value="Oui">Oui</option>
                  <option value="Ancien">Ancien fumeur</option>
                </select>
              </div>
            ) : (
              <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Cigarette size={13} className="text-gray-300" />{patient.smokingStatus || <span className="text-gray-300 font-medium">Non renseigné</span>}
              </p>
            )}
          </Field>

          {isEditing && (form.smokingStatus === 'Oui' || form.smokingStatus === 'Ancien') && (
            <Field label="Quantité / détail tabac">
              <input type="text" value={form.smokingDetail || ''} onChange={e => setForm({ ...form, smokingDetail: e.target.value })} className={inputClass} placeholder="Ex : 10 cig/jour depuis 5 ans" />
            </Field>
          )}
          {!isEditing && patient.smokingDetail && (
            <Field label="Détail tabac">
              <p className="text-sm font-semibold text-gray-600">{patient.smokingDetail}</p>
            </Field>
          )}

          <Field label="Alcool">
            {isEditing ? (
              <select value={form.alcoholUse || ''} onChange={e => setForm({ ...form, alcoholUse: (e.target.value || undefined) as FormState['alcoholUse'] })} className={inputClass}>
                <option value="">Non renseigné</option>
                <option value="Non">Non</option>
                <option value="Oui">Oui</option>
                <option value="Occasionnel">Occasionnel</option>
              </select>
            ) : (
              <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                <Wine size={13} className="text-gray-300" />{patient.alcoholUse || <span className="text-gray-300 font-medium">Non renseigné</span>}
              </p>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Field label="Antécédents familiaux (maladies héréditaires)">
            {isEditing ? (
              <textarea value={form.familyHistory || ''} onChange={e => setForm({ ...form, familyHistory: e.target.value })} className={`${inputClass} h-20 resize-none`} placeholder="Ex : Diabète (père), HTA (mère)..." />
            ) : (
              <p className="text-sm text-gray-700">{patient.familyHistory || <span className="text-gray-300 font-medium">Aucun antécédent familial déclaré</span>}</p>
            )}
          </Field>
          <Field label="Antécédents chirurgicaux / hospitalisations">
            {isEditing ? (
              <textarea value={form.surgicalHistory || ''} onChange={e => setForm({ ...form, surgicalHistory: e.target.value })} className={`${inputClass} h-20 resize-none`} placeholder="Ex : Appendicectomie 2015..." />
            ) : (
              <p className="text-sm text-gray-700 flex items-start gap-1.5">
                <Scissors size={13} className="text-gray-300 mt-0.5 shrink-0" />
                {patient.surgicalHistory || <span className="text-gray-300 font-medium">Aucun antécédent chirurgical déclaré</span>}
              </p>
            )}
          </Field>
        </div>

        {patient.sex === 'F' && (
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Baby size={12} /> Antécédents gynéco-obstétricaux</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Grossesses">
                {isEditing ? (
                  <input type="number" min={0} value={form.pregnanciesCount ?? ''} onChange={e => setForm({ ...form, pregnanciesCount: e.target.value ? parseInt(e.target.value, 10) : undefined })} className={inputClass} />
                ) : (
                  <p className="text-sm font-bold text-gray-800">{patient.pregnanciesCount ?? <span className="text-gray-300 font-medium">—</span>}</p>
                )}
              </Field>
              <Field label="Accouchements">
                {isEditing ? (
                  <input type="number" min={0} value={form.deliveriesCount ?? ''} onChange={e => setForm({ ...form, deliveriesCount: e.target.value ? parseInt(e.target.value, 10) : undefined })} className={inputClass} />
                ) : (
                  <p className="text-sm font-bold text-gray-800">{patient.deliveriesCount ?? <span className="text-gray-300 font-medium">—</span>}</p>
                )}
              </Field>
              <Field label="Fausses couches">
                {isEditing ? (
                  <input type="number" min={0} value={form.miscarriagesCount ?? ''} onChange={e => setForm({ ...form, miscarriagesCount: e.target.value ? parseInt(e.target.value, 10) : undefined })} className={inputClass} />
                ) : (
                  <p className="text-sm font-bold text-gray-800">{patient.miscarriagesCount ?? <span className="text-gray-300 font-medium">—</span>}</p>
                )}
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* Vaccinations — résumé, réutilise vaccinationService (pas de logique dupliquée) */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <Syringe size={14} /> Vaccinations
          </h4>
          <button onClick={() => onNavigate('vaccination')} className="text-[10px] font-black text-emerald-600 uppercase hover:underline">
            Voir le calendrier complet
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className={`p-4 rounded-xl border text-center ${overdueCount > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-2xl font-black ${overdueCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{overdueCount}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-1">En retard</p>
          </div>
          <div className={`p-4 rounded-xl border text-center ${dueCount > 0 ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-2xl font-black ${dueCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{dueCount}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-1">À faire</p>
          </div>
          <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-100 text-center">
            <p className="text-2xl font-black text-emerald-600">{doneCount}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-1">Faites</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AntecedentsSection;
