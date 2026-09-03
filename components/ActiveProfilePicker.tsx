import React, { useState, useRef, useEffect } from 'react';
import { UserCog, X, ChevronDown } from 'lucide-react';
import { useActiveProfile } from './ui/ActiveProfileContext';
import { isProfileActive } from '../services/activeProfileService';

const TOGGLES: Array<{ key: 'isChild' | 'isPregnant' | 'isBreastfeeding' | 'isRenalImpaired' | 'isHepaticImpaired' | 'isCardiac' | 'isDiabetic'; label: string }> = [
    { key: 'isChild', label: 'Enfant' },
    { key: 'isPregnant', label: 'Femme enceinte' },
    { key: 'isBreastfeeding', label: 'Allaitement' },
    { key: 'isRenalImpaired', label: 'Insuffisance rénale' },
    { key: 'isHepaticImpaired', label: 'Insuffisance hépatique' },
    { key: 'isCardiac', label: 'Cardiaque' },
    { key: 'isDiabetic', label: 'Diabétique' },
];

export default function ActiveProfilePicker() {
    const { profile, setProfile, resetProfile } = useActiveProfile();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const active = isProfileActive(profile);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${active
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
            >
                <UserCog size={14} />
                {active ? 'Profil patient actif' : 'Profil patient'}
                <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Profil patient actif</p>
                        {active && (
                            <button
                                onClick={() => { resetProfile(); }}
                                className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-rose-500"
                            >
                                <X size={11} /> Réinitialiser
                            </button>
                        )}
                    </div>

                    <div className="space-y-2">
                        {TOGGLES.map(t => (
                            <label key={t.key} className="flex items-center justify-between gap-2 cursor-pointer">
                                <span className="text-sm text-slate-700">{t.label}</span>
                                <input
                                    type="checkbox"
                                    checked={profile[t.key]}
                                    onChange={e => setProfile({ ...profile, [t.key]: e.target.checked })}
                                    className="w-4 h-4 accent-rose-500"
                                />
                            </label>
                        ))}

                        {profile.isChild && (
                            <div className="pl-2 pt-1">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Âge de l'enfant (années)</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={17}
                                    value={profile.childAgeYears ?? ''}
                                    onChange={e => setProfile({ ...profile, childAgeYears: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-rose-300"
                                    placeholder="Ex: 4"
                                />
                            </div>
                        )}

                        {profile.isPregnant && (
                            <div className="pl-2 pt-1">
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Semaines de grossesse (SA)</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={45}
                                    value={profile.pregnancyWeeks ?? ''}
                                    onChange={e => setProfile({ ...profile, pregnancyWeeks: e.target.value === '' ? undefined : Number(e.target.value) })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-rose-300"
                                    placeholder="Ex: 32"
                                />
                            </div>
                        )}
                    </div>

                    <p className="text-[10px] text-slate-400 mt-3 leading-snug">
                        Ce profil croise automatiquement chaque médicament consulté avec ses contre-indications, en ne se basant que sur les données de la fiche.
                    </p>
                </div>
            )}
        </div>
    );
}
