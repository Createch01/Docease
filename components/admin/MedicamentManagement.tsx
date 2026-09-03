import React, { useEffect, useState } from 'react';
import { Search, Plus, Pencil, History, X, AlertCircle, ShieldCheck } from 'lucide-react';
import { searchDrugsGlobal, type Medicament } from '../../services/drugCatalogService';
import {
  getAuditTrail, markReviewed, type AuditEntry, type OverrideRecord,
} from '../../services/medicamentAdminService';
import { invalidateLetter } from '../../services/drugCatalogService';
import { resetDrugGroupsCache } from '../../services/pharmaDirService';
import MedicamentEditor from './MedicamentEditor';

function letterOf(brandName: string): string {
  const first = brandName.trim()[0]?.toUpperCase();
  return first && /[A-Z]/.test(first) ? first : 'A';
}

function AuditPanel({ record, onClose }: { record: Medicament; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAuditTrail(record.id).then(e => { if (!cancelled) setEntries(e); });
    return () => { cancelled = true; };
  }, [record.id]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900">Historique — {record.brand_name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto space-y-2">
          {entries === null && <p className="text-sm text-slate-400">Chargement…</p>}
          {entries?.length === 0 && <p className="text-sm text-slate-400">Aucune modification enregistrée.</p>}
          {entries?.map((e, i) => (
            <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-800">{e.field}</span>
                <span className="text-slate-400">{new Date(e.changed_at).toLocaleString('fr-FR')}</span>
              </div>
              <p className="text-slate-500">
                <span className="line-through">{JSON.stringify(e.old_value) ?? '—'}</span>
                {' → '}
                <span className="text-slate-800">{JSON.stringify(e.new_value)}</span>
              </p>
              <p className="text-slate-400 mt-0.5">{e.action === 'create' ? 'Création' : 'Modification'} par {e.changed_by}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MedicamentManagement() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Medicament[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Medicament | 'new' | null>(null);
  const [historyFor, setHistoryFor] = useState<Medicament | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    searchDrugsGlobal(query, 60).then(r => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [query, refreshTick]);

  function handleSaved(_record: OverrideRecord, _letter: string) {
    setEditing(null);
    setRefreshTick(t => t + 1);
  }

  async function handleMarkReviewed(record: Medicament) {
    const letter = letterOf(record.brand_name);
    await markReviewed(record as OverrideRecord, letter);
    invalidateLetter(letter);
    resetDrugGroupsCache();
    setRefreshTick(t => t + 1);
  }

  if (editing) {
    return (
      <MedicamentEditor
        initialRecord={editing === 'new' ? undefined : editing}
        onSaved={handleSaved}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gestion des médicaments</h1>
            <p className="text-sm text-slate-500 mt-1">Ajout, modification et traçabilité du répertoire pharmaceutique</p>
          </div>
          <button onClick={() => setEditing('new')}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition flex items-center gap-1.5 shrink-0">
            <Plus size={16} /> Ajouter un médicament
          </button>
        </div>

        <div className="relative mb-5">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un médicament à modifier…"
            className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
              <X size={16} />
            </button>
          )}
        </div>

        {loading && <p className="text-sm text-slate-400">Recherche…</p>}
        {!loading && query.trim() && results.length === 0 && (
          <p className="text-sm text-slate-400">Aucun résultat pour « {query} ».</p>
        )}

        <div className="space-y-2">
          {results.map(r => (
            <div key={r.id} className="rounded-2xl border border-slate-100 bg-white p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 text-sm">{r.brand_name}</span>
                  {r.atc_code && <span className="text-xs font-mono bg-slate-100 text-slate-500 rounded px-1.5 py-0.5">{r.atc_code}</span>}
                  {r.needs_manual_review && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 font-medium">
                      <AlertCircle size={11} /> À vérifier
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">{r.generic_name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {r.needs_manual_review && (
                  <button onClick={() => handleMarkReviewed(r)} title="Marquer comme vérifié"
                    className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition">
                    <ShieldCheck size={16} />
                  </button>
                )}
                <button onClick={() => setHistoryFor(r)} title="Historique"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition">
                  <History size={16} />
                </button>
                <button onClick={() => setEditing(r)} title="Modifier"
                  className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition">
                  <Pencil size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {historyFor && <AuditPanel record={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
