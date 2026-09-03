import React, { useMemo, useState } from 'react';
import { Save, Scale, Ruler, HeartPulse, Thermometer, Wind, TrendingUp, TrendingDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, Legend
} from 'recharts';
import { dataService } from '../../services/dataService';
// @ts-ignore
import { toastService } from '../../services/toastService';
import { Patient, VitalSign } from '../../types';
import { calculateIMC } from '../../utils/formatters';

interface VitalsSectionProps {
  patient: Patient;
  refreshTrigger: number;
}

type DraftState = {
  weight: string;
  height: string;
  systolic: string;
  diastolic: string;
  heartRate: string;
  spO2: string;
  temperature: string;
};

const EMPTY_DRAFT: DraftState = { weight: '', height: '', systolic: '', diastolic: '', heartRate: '', spO2: '', temperature: '' };

const Field: React.FC<{ label: string; unit: string; icon: React.ReactNode; value: string; onChange: (v: string) => void; abnormal?: boolean }> = ({ label, unit, icon, value, onChange, abnormal }) => (
  <div className="space-y-1.5">
    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">{icon}{label}</label>
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full px-3 py-2 pr-10 bg-white border rounded-lg text-sm font-semibold outline-none transition-all ${
          abnormal ? 'border-red-300 text-red-700 bg-red-50 focus:border-red-400' : 'border-gray-200 text-gray-800 focus:border-emerald-400'
        }`}
        placeholder="—"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-300">{unit}</span>
    </div>
  </div>
);

function isAbnormal(field: keyof DraftState, value: number): boolean {
  switch (field) {
    case 'systolic': return value > 140;
    case 'diastolic': return value > 90;
    case 'spO2': return value < 95;
    case 'temperature': return value > 38.5 || value < 36;
    case 'heartRate': return value < 50 || value > 100;
    default: return false;
  }
}

const IMC_LABEL_COLOR: Record<string, string> = {
  'Maigreur': 'text-amber-600 bg-amber-50 border-amber-100',
  'Normal': 'text-emerald-600 bg-emerald-50 border-emerald-100',
  'Surpoids': 'text-amber-600 bg-amber-50 border-amber-100',
  'Obésité': 'text-red-600 bg-red-50 border-red-100',
};

function trendArrow(current?: number, previous?: number) {
  if (current === undefined || previous === undefined) return null;
  if (current === previous) return null;
  return current > previous
    ? <TrendingUp size={12} className="text-red-500" />
    : <TrendingDown size={12} className="text-emerald-500" />;
}

const VitalChart: React.FC<{ title: string; data: { date: string; label: string }[] & any[]; lines: { key: string; color: string; name: string }[]; normalRange?: [number, number]; abnormalCheck: (d: any) => boolean }> = ({ title, data, lines, normalRange, abnormalCheck }) => {
  if (data.length < 2) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h5 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-3">{title}</h5>
        <p className="text-[11px] font-semibold text-gray-400 text-center py-8">Première mesure enregistrée, le graphique apparaîtra après la deuxième mesure.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h5 className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-3">{title}</h5>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
          <Tooltip wrapperStyle={{ fontSize: 11 }} />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
          {normalRange && (
            <ReferenceArea {...{ y1: normalRange[0], y2: normalRange[1], fill: '#10b981', fillOpacity: 0.08, strokeOpacity: 0 } as any} />
          )}
          {lines.map(line => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              dot={(props: any) => {
                const isAbnormalPoint = abnormalCheck(props.payload);
                return (
                  <circle
                    key={props.key}
                    cx={props.cx}
                    cy={props.cy}
                    r={isAbnormalPoint ? 5 : 3}
                    fill={isAbnormalPoint ? '#ef4444' : line.color}
                    stroke={isAbnormalPoint ? '#ef4444' : line.color}
                  />
                );
              }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const VitalsSection: React.FC<VitalsSectionProps> = ({ patient, refreshTrigger }) => {
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const history = useMemo(() => {
    return [...(patient.vitalSigns || [])].sort((a, b) => a.date.localeCompare(b.date));
  }, [patient.vitalSigns, refreshTrigger]);

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  const draftAbnormal = useMemo(() => {
    const flags: Partial<Record<keyof DraftState, boolean>> = {};
    (['systolic', 'diastolic', 'spO2', 'temperature', 'heartRate'] as (keyof DraftState)[]).forEach(f => {
      const v = draft[f];
      if (v !== '') flags[f] = isAbnormal(f, parseFloat(v));
    });
    return flags;
  }, [draft]);

  const draftIMC = useMemo(() => {
    const w = parseFloat(draft.weight);
    const h = parseFloat(draft.height);
    if (!w || !h) return undefined;
    return calculateIMC(w, h);
  }, [draft.weight, draft.height]);

  const hasAnyValue = Object.values(draft).some(v => v !== '');

  const handleSave = async () => {
    const entry: VitalSign = { date: new Date().toISOString() };
    if (draft.weight !== '') entry.weight = parseFloat(draft.weight);
    if (draft.height !== '') entry.height = parseFloat(draft.height);
    if (draft.systolic !== '') entry.systolic = parseFloat(draft.systolic);
    if (draft.diastolic !== '') entry.diastolic = parseFloat(draft.diastolic);
    if (draft.heartRate !== '') entry.heartRate = parseFloat(draft.heartRate);
    if (draft.spO2 !== '') entry.spO2 = parseFloat(draft.spO2);
    if (draft.temperature !== '') entry.temperature = parseFloat(draft.temperature);

    setSaving(true);
    try {
      const updatedVitalSigns = [...(patient.vitalSigns || []), entry];
      await dataService.savePatientProfile({ ...patient, vitalSigns: updatedVitalSigns });
      toastService.success('Constantes enregistrées.');
      setDraft(EMPTY_DRAFT);
      window.dispatchEvent(new Event('meddoc_data_update'));
    } catch (e) {
      toastService.error("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const chartData = history.map(v => ({
    date: v.date,
    label: new Date(v.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    systolic: v.systolic,
    diastolic: v.diastolic,
    weight: v.weight,
    spO2: v.spO2,
    heartRate: v.heartRate,
    temperature: v.temperature,
  }));

  const tensionData = chartData.filter(d => d.systolic !== undefined || d.diastolic !== undefined);
  const weightData = chartData.filter(d => d.weight !== undefined);
  const spO2Data = chartData.filter(d => d.spO2 !== undefined);
  const heartRateData = chartData.filter(d => d.heartRate !== undefined);

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      {/* Saisie */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
            <HeartPulse size={14} /> Nouvelle mesure
          </h4>
          {draftIMC && (
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold border ${IMC_LABEL_COLOR[draftIMC.interpretation]}`}>
              IMC {draftIMC.value} · {draftIMC.interpretation}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Poids" unit="kg" icon={<Scale size={11} className="text-gray-300" />} value={draft.weight} onChange={v => setDraft({ ...draft, weight: v })} />
          <Field label="Taille" unit="cm" icon={<Ruler size={11} className="text-gray-300" />} value={draft.height} onChange={v => setDraft({ ...draft, height: v })} />
          <Field label="Tension systolique" unit="mmHg" icon={<HeartPulse size={11} className="text-gray-300" />} value={draft.systolic} onChange={v => setDraft({ ...draft, systolic: v })} abnormal={draftAbnormal.systolic} />
          <Field label="Tension diastolique" unit="mmHg" icon={<HeartPulse size={11} className="text-gray-300" />} value={draft.diastolic} onChange={v => setDraft({ ...draft, diastolic: v })} abnormal={draftAbnormal.diastolic} />
          <Field label="Fréquence cardiaque" unit="bpm" icon={<HeartPulse size={11} className="text-gray-300" />} value={draft.heartRate} onChange={v => setDraft({ ...draft, heartRate: v })} abnormal={draftAbnormal.heartRate} />
          <Field label="SpO2" unit="%" icon={<Wind size={11} className="text-gray-300" />} value={draft.spO2} onChange={v => setDraft({ ...draft, spO2: v })} abnormal={draftAbnormal.spO2} />
          <Field label="Température" unit="°C" icon={<Thermometer size={11} className="text-gray-300" />} value={draft.temperature} onChange={v => setDraft({ ...draft, temperature: v })} abnormal={draftAbnormal.temperature} />
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={handleSave}
            disabled={saving || !hasAnyValue}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-all"
          >
            <Save size={14} /> {saving ? 'Enregistrement...' : 'Enregistrer les constantes'}
          </button>
        </div>
      </div>

      {/* Dernières valeurs */}
      {latest && (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6">
          <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Dernière mesure — {new Date(latest.date).toLocaleString('fr-FR')}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {latest.weight !== undefined && (
              <div className="p-4 rounded-xl border bg-gray-50 border-gray-100">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Poids</p>
                <p className="text-lg font-black text-gray-800 flex items-center gap-1">{latest.weight} kg {trendArrow(latest.weight, previous?.weight)}</p>
              </div>
            )}
            {latest.height !== undefined && (
              <div className="p-4 rounded-xl border bg-gray-50 border-gray-100">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Taille</p>
                <p className="text-lg font-black text-gray-800">{latest.height} cm</p>
              </div>
            )}
            {(latest.systolic !== undefined || latest.diastolic !== undefined) && (
              <div className={`p-4 rounded-xl border ${(latest.systolic && latest.systolic > 140) || (latest.diastolic && latest.diastolic > 90) ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Tension</p>
                <p className="text-lg font-black text-gray-800">{latest.systolic ?? '—'}/{latest.diastolic ?? '—'} mmHg</p>
              </div>
            )}
            {latest.heartRate !== undefined && (
              <div className={`p-4 rounded-xl border ${latest.heartRate < 50 || latest.heartRate > 100 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Fréquence cardiaque</p>
                <p className="text-lg font-black text-gray-800">{latest.heartRate} bpm</p>
              </div>
            )}
            {latest.spO2 !== undefined && (
              <div className={`p-4 rounded-xl border ${latest.spO2 < 95 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">SpO2</p>
                <p className="text-lg font-black text-gray-800">{latest.spO2} %</p>
              </div>
            )}
            {latest.temperature !== undefined && (
              <div className={`p-4 rounded-xl border ${latest.temperature > 38.5 || latest.temperature < 36 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Température</p>
                <p className="text-lg font-black text-gray-800">{latest.temperature} °C</p>
              </div>
            )}
            {latest.weight !== undefined && latest.height !== undefined && (() => {
              const imc = calculateIMC(latest.weight, latest.height);
              if (!imc) return null;
              return (
                <div className={`p-4 rounded-xl border ${IMC_LABEL_COLOR[imc.interpretation]}`}>
                  <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-70">IMC</p>
                  <p className="text-lg font-black">{imc.value} · {imc.interpretation}</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Graphiques d'évolution */}
      {history.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <VitalChart
            title="Tension artérielle"
            data={tensionData}
            lines={[
              { key: 'systolic', color: '#ef4444', name: 'Systolique' },
              { key: 'diastolic', color: '#3b82f6', name: 'Diastolique' },
            ]}
            normalRange={[90, 140]}
            abnormalCheck={(d) => (d.systolic && d.systolic > 140) || (d.diastolic && d.diastolic > 90)}
          />
          <VitalChart
            title="Poids"
            data={weightData}
            lines={[{ key: 'weight', color: '#10b981', name: 'Poids (kg)' }]}
            abnormalCheck={() => false}
          />
          <VitalChart
            title="SpO2"
            data={spO2Data}
            lines={[{ key: 'spO2', color: '#8b5cf6', name: 'SpO2 (%)' }]}
            normalRange={[95, 100]}
            abnormalCheck={(d) => d.spO2 !== undefined && d.spO2 < 95}
          />
          <VitalChart
            title="Fréquence cardiaque"
            data={heartRateData}
            lines={[{ key: 'heartRate', color: '#f59e0b', name: 'FC (bpm)' }]}
            normalRange={[50, 100]}
            abnormalCheck={(d) => d.heartRate !== undefined && (d.heartRate < 50 || d.heartRate > 100)}
          />
        </div>
      )}

      {history.length === 0 && (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-10 text-center">
          <HeartPulse size={36} className="mx-auto text-gray-200 mb-3" />
          <p className="text-xs font-semibold text-gray-400">Aucune constante enregistrée pour ce patient.</p>
        </div>
      )}
    </div>
  );
};

export default VitalsSection;
