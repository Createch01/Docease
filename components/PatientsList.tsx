import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Plus, FolderOpen, Activity, MoreVertical, Phone, AlertCircle, Users, UserPlus } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Patient } from '../types';
import { formatAge, formatNom } from '../utils/formatters';

interface PatientsListProps {
  onSelectPatient: (id: string) => void;
  onNewConsultation?: (patient: Patient) => void;
  onAddPatient?: () => void;
}

type FilterKey = 'all' | 'allergies' | 'chronic' | 'new';
type BucketKey = 'today' | 'week' | 'month' | 'older';

const BUCKET_ORDER: BucketKey[] = ['today', 'week', 'month', 'older'];
const BUCKET_LABELS: Record<BucketKey, string> = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois',
  older: 'Plus ancien',
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'allergies', label: 'Avec allergies' },
  { key: 'chronic', label: 'Chroniques' },
  { key: 'new', label: 'Nouveaux' },
];

const AVATAR_PALETTE = [
  'bg-blue-50 text-blue-600 border-blue-100',
  'bg-emerald-50 text-emerald-600 border-emerald-100',
  'bg-amber-50 text-amber-600 border-amber-100',
  'bg-rose-50 text-rose-600 border-rose-100',
  'bg-purple-50 text-purple-600 border-purple-100',
  'bg-cyan-50 text-cyan-600 border-cyan-100',
  'bg-orange-50 text-orange-600 border-orange-100',
  'bg-indigo-50 text-indigo-600 border-indigo-100',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

// Mirrors the merge order drugRules.ts uses for allergies/pathologies: the structured
// tag pickers are canonical, and the legacy free-text field only counts as a fallback
// when both tag arrays are empty (registration's blank `allergies`/`pathologies` string
// is rarely touched once a consultation records real tags).
function mergedTags(tags?: string[], otherTags?: string[], legacyText?: string): string[] {
  if ((tags?.length || 0) > 0 || (otherTags?.length || 0) > 0) {
    return [...(tags || []), ...(otherTags || [])];
  }
  return legacyText ? legacyText.split(',').map(t => t.trim()).filter(Boolean) : [];
}

function formatLastVisit(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diffDays = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(dateStr).setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) { const w = Math.floor(diffDays / 7); return `Il y a ${w} semaine${w > 1 ? 's' : ''}`; }
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Rolling-window buckets (last 7 / last 31 days) rather than calendar week/month —
// simpler to compute and close enough for a "how recently was this patient seen" glance.
function visitBucket(dateStr?: string): BucketKey {
  if (!dateStr) return 'older';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'older';
  const diffDays = Math.floor((new Date().setHours(0, 0, 0, 0) - d.setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays < 7) return 'week';
  if (diffDays < 31) return 'month';
  return 'older';
}

const PatientsList: React.FC<PatientsListProps> = ({ onSelectPatient, onNewConsultation, onAddPatient }) => {
  const [patients, setPatients] = useState<Patient[]>(dataService.getAllPatients());
  const [prescriptions, setPrescriptions] = useState(dataService.getPrescriptions());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reload = () => {
      setPatients(dataService.getAllPatients());
      setPrescriptions(dataService.getPrescriptions());
    };
    window.addEventListener('meddoc_data_update', reload);
    return () => window.removeEventListener('meddoc_data_update', reload);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const lastVisitMap = useMemo(() => {
    const map: Record<string, string> = {};
    prescriptions.forEach((p: any) => {
      if (!map[p.patientId] || p.date > map[p.patientId]) map[p.patientId] = p.date;
    });
    return map;
  }, [prescriptions]);

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = patients.filter(p => {
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.phone && p.phone.includes(term)) ||
        (p.cin && p.cin.toLowerCase().includes(term))
      );
    });

    if (filter === 'allergies') list = list.filter(p => mergedTags(p.allergyTags, p.allergiesOtherTags, p.allergies).length > 0);
    if (filter === 'chronic') list = list.filter(p => mergedTags(p.pathologyTags, p.pathologiesOtherTags, p.pathologies).length > 0);
    if (filter === 'new') list = list.filter(p => !lastVisitMap[p.id]);

    return [...list].sort((a, b) => {
      const da = lastVisitMap[a.id] || a.registeredDate || '';
      const db = lastVisitMap[b.id] || b.registeredDate || '';
      return db.localeCompare(da);
    });
  }, [patients, search, filter, lastVisitMap]);

  const groupedPatients = useMemo(() => {
    const buckets: Record<BucketKey, Patient[]> = { today: [], week: [], month: [], older: [] };
    filteredPatients.forEach(p => {
      const raw = lastVisitMap[p.id] || p.registeredDate;
      buckets[visitBucket(raw)].push(p);
    });
    return buckets;
  }, [filteredPatients, lastVisitMap]);

  return (
    <div className="flex flex-col h-full gap-4 animate-in fade-in duration-300 overflow-hidden text-gray-900 font-sans">
      {/* Header: search + counter + filters + add */}
      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, téléphone ou CIN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#1D9E75] focus:ring-2 focus:ring-[#1D9E75]/10 transition-all placeholder-gray-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <span className="text-xs font-bold text-gray-400 whitespace-nowrap">{filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}</span>
          </div>

          <button
            onClick={() => onAddPatient && onAddPatient()}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#1D9E75] hover:bg-[#178a65] text-white font-semibold text-xs rounded-xl shadow-sm transition-all active:scale-95"
          >
            <UserPlus size={15} /> Nouveau patient
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                filter === f.key
                  ? 'bg-[#1D9E75] border-[#1D9E75] text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-gray-200 shadow-sm">
        {filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Users size={36} className="text-gray-200" />
            </div>
            {patients.length === 0 ? (
              <>
                <p className="text-sm font-semibold text-gray-500">Aucun patient enregistré</p>
                <button
                  onClick={() => onAddPatient && onAddPatient()}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-[#1D9E75] hover:bg-[#178a65] text-white font-semibold text-xs rounded-lg transition-all"
                >
                  <Plus size={14} /> Ajouter le premier patient
                </button>
              </>
            ) : (
              <p className="text-sm font-semibold text-gray-400">Aucun patient ne correspond à cette recherche</p>
            )}
          </div>
        ) : (
          BUCKET_ORDER.map(bucketKey => groupedPatients[bucketKey].length === 0 ? null : (
            <div key={bucketKey}>
              <div className="sticky top-0 bg-gray-50/90 backdrop-blur-sm px-4 py-1.5 border-y border-gray-100 z-10">
                <span className="text-[10px] font-bold text-[#1D9E75] uppercase tracking-widest">{BUCKET_LABELS[bucketKey]}</span>
              </div>
              {groupedPatients[bucketKey].map((p, i) => {
                const hasAllergy = mergedTags(p.allergyTags, p.allergiesOtherTags, p.allergies).length > 0;
                const chronicList = mergedTags(p.pathologyTags, p.pathologiesOtherTags, p.pathologies);
                const lastVisit = formatLastVisit(lastVisitMap[p.id]);
                const dob = p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('fr-FR') : null;

                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectPatient(p.id)}
                    className={`group h-16 px-4 flex items-center gap-4 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors hover:bg-blue-50/60 ${
                      i % 2 === 1 ? 'bg-gray-50/30' : 'bg-white'
                    } ${hasAllergy ? 'border-l-[3px] border-l-red-500' : ''}`}
                  >
                    {/* Avatar + age */}
                    <div className="flex flex-col items-center shrink-0 w-11">
                      <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-black text-xs ${avatarColor(p.name)}`}>
                        {initials(p.name)}
                      </div>
                      <span className="text-[9px] font-bold text-gray-400 mt-0.5 leading-none whitespace-nowrap">{formatAge(p)}</span>
                    </div>

                    {/* Identity */}
                    <div className="min-w-0 w-[220px] shrink-0">
                      <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{formatNom(p.name)}</p>
                      <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">
                        {p.sex === 'F' ? 'Femme' : 'Homme'}{dob ? ` · ${dob}` : ''}
                      </p>
                      {p.phone && (
                        <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5 flex items-center gap-1">
                          <Phone size={10} />{p.phone}
                        </p>
                      )}
                    </div>

                    {/* Clinical alerts */}
                    <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                      {hasAllergy && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 rounded-full text-[10px] font-bold shrink-0">
                          <AlertCircle size={10} /> Allergie
                        </span>
                      )}
                      {chronicList.slice(0, 2).map((d, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[10px] font-bold shrink-0">
                          {d}
                        </span>
                      ))}
                      {chronicList.length > 2 && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[10px] font-bold shrink-0">
                          +{chronicList.length - 2}
                        </span>
                      )}
                      {p.isPregnant && (
                        <span className="px-2 py-0.5 bg-pink-50 text-pink-600 border border-pink-100 rounded-full text-[10px] font-bold shrink-0">
                          Enceinte
                        </span>
                      )}
                    </div>

                    {/* Last visit */}
                    <div className="w-32 shrink-0 text-right">
                      {lastVisit ? (
                        <span className="text-[11px] font-semibold text-gray-500">{lastVisit}</span>
                      ) : (
                        <span className="text-[11px] font-semibold text-gray-300">Nouveau patient</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div
                      className="relative flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onSelectPatient(p.id)}
                        className="p-1.5 text-gray-400 hover:text-[#1D9E75] hover:bg-[#1D9E75]/10 rounded-lg transition-colors"
                        title="Ouvrir le dossier"
                      >
                        <FolderOpen size={16} />
                      </button>
                      <button
                        onClick={() => onNewConsultation && onNewConsultation(p)}
                        className="p-1.5 text-gray-400 hover:text-[#1D9E75] hover:bg-[#1D9E75]/10 rounded-lg transition-colors"
                        title="Nouvelle consultation"
                      >
                        <Activity size={16} />
                      </button>
                      <button
                        onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Plus d'actions"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {openMenuId === p.id && (
                        <div ref={menuRef} className="absolute right-0 top-9 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden py-1">
                          <button
                            onClick={() => { onSelectPatient(p.id); setOpenMenuId(null); }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <FolderOpen size={13} /> Ouvrir le dossier
                          </button>
                          <button
                            onClick={() => { onNewConsultation && onNewConsultation(p); setOpenMenuId(null); }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Activity size={13} /> Nouvelle consultation
                          </button>
                          {p.phone && (
                            <a
                              href={`tel:${p.phone}`}
                              onClick={() => setOpenMenuId(null)}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Phone size={13} /> Appeler {p.phone}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PatientsList;
