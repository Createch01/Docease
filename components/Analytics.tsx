
import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  TrendingUp,
  Users,
  UserPlus,
  Repeat,
  Percent,
  CreditCard,
  ArrowUpRight,
  Calendar,
  Activity,
  Heart,
  ArrowRight,
  Plus,
  Trash2,
  Wallet,
  Receipt,
  Upload,
  ImageOff,
  Download,
  FileText,
  Table as TableIcon
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Patient } from '../types';
// @ts-ignore
import { toastService } from '../services/toastService';
import { canOutput } from '../services/cabinetSetup';
import { localDateStr, todayLocal } from '../utils/localDate';
import { Granularity, Summary, accountingService, toDh } from '../services/accountingService';
import JournalTab from './accounting/JournalTab';
import ExpensesTab from './accounting/ExpensesTab';
import PeriodsPanel from './accounting/PeriodsPanel';

type TimeRange = 'Jour' | 'Semaine' | 'Mois' | 'Année';

interface DataPoint {
  key: string;
  label: string;
  count: number;
  revenue: number; // facturé
  collected: number; // encaissé
  expense: number;
}

const formatMoney = (amount: number, currency: string) => {
  const safeCurrency = currency || 'DH';
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `${safeAmount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${safeCurrency}`;
};

// Bornes de la période courante sélectionnée (jour/semaine/mois/année en cours)
const getPeriodBounds = (range: TimeRange, now: Date): { start: Date; end: Date } => {
  const start = new Date(now);
  const end = new Date(now);

  if (range === 'Jour') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'Semaine') {
    const dayOffset = (start.getDay() + 6) % 7; // Lundi = début de semaine
    start.setDate(start.getDate() - dayOffset);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (range === 'Mois') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
};

const getPeriodLabel = (range: TimeRange, start: Date, end: Date) => {
  if (range === 'Jour') return start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  if (range === 'Semaine') return `${start.toLocaleDateString('fr-FR')} — ${end.toLocaleDateString('fr-FR')}`;
  if (range === 'Mois') return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return start.getFullYear().toString();
};

// Comparaison de jours locaux (AAAA-MM-JJ) : jamais d'instant UTC (voir utils/localDate).
const isInPeriod = (dateStr: string, start: Date, end: Date) => {
  const d = (dateStr || '').slice(0, 10);
  return d >= localDateStr(start) && d <= localDateStr(end);
};

/** AAAA-MM-JJ -> minuit LOCAL (new Date('AAAA-MM-JJ') serait minuit UTC). */
const parseLocalDay = (dateStr: string): Date => {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Plage et granularité du graphique selon la période choisie (les tranches viennent de Rust). */
const chartRange = (range: TimeRange): { from: string; to: string; gran: Granularity } => {
  const now = new Date();
  const d = new Date(now);
  if (range === 'Jour') { d.setDate(d.getDate() - 13); return { from: localDateStr(d), to: localDateStr(now), gran: 'day' }; }
  if (range === 'Semaine') { d.setDate(d.getDate() - 49); return { from: localDateStr(d), to: localDateStr(now), gran: 'week' }; }
  if (range === 'Mois') { d.setMonth(d.getMonth() - 11, 1); return { from: localDateStr(d), to: localDateStr(now), gran: 'month' }; }
  d.setFullYear(d.getFullYear() - 4, 0, 1);
  return { from: localDateStr(d), to: localDateStr(now), gran: 'year' };
};

const bucketLabel = (key: string, gran: Granularity): string => {
  if (gran === 'year') return key;
  if (gran === 'month') return parseLocalDay(`${key}-01`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  const d = parseLocalDay(key).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return gran === 'week' ? `Sem. ${d}` : d;
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('Jour');
  const [activeTab, setActiveTab] = useState<'overview' | 'journal' | 'expenses' | 'patients'>('overview');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showInvoiced, setShowInvoiced] = useState(false);

  const honoraryNotes = useMemo(() => dataService.getHonoraryNotes(), [refreshTrigger]);
  const allPatients = useMemo(() => dataService.getAllPatients(), [refreshTrigger]);
  const doctor = dataService.getDoctorInfo();
  const currency = doctor.currency || 'DH';

  React.useEffect(() => {
    const handleUpdate = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('meddoc_data_update', handleUpdate);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate);
  }, []);

  // --- Période courante sélectionnée (jour/semaine/mois/année en cours) ---
  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodBounds(timeRange, new Date()), [timeRange]);
  const periodLabel = getPeriodLabel(timeRange, periodStart, periodEnd);

  // --- Chiffres de la période : calculés par Rust (registre des encaissements, centimes entiers) ---
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chart, setChart] = useState<Summary | null>(null);
  const [accountingError, setAccountingError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const range = chartRange(timeRange);
    setAccountingError(null);
    Promise.all([
      accountingService.summary(localDateStr(periodStart), localDateStr(periodEnd), 'day'),
      accountingService.summary(range.from, range.to, range.gran),
    ]).then(([a, b]) => { if (alive) { setSummary(a); setChart(b); } })
      .catch(e => { if (alive) { setSummary(null); setChart(null); setAccountingError(e instanceof Error ? e.message : 'Calcul impossible.'); } });
    return () => { alive = false; };
  }, [timeRange, periodStart, periodEnd, refreshTrigger]);

  // Série du graphique : une barre par tranche renvoyée par Rust (encaissé net ; facturé en option).
  const stats: DataPoint[] = useMemo(() => (chart?.buckets ?? []).map(b => ({
    key: b.key,
    label: bucketLabel(b.key, chart!.granularity),
    count: b.invoicedCount,
    revenue: toDh(b.invoicedCents),
    collected: toDh(b.netCents),
    expense: toDh(b.expensesCents),
  })), [chart]);
  const maxVal = Math.max(...stats.map(s => Math.max(s.collected, s.expense, showInvoiced ? s.revenue : 0)), 1);

  const periodInvoices = useMemo(
    () => honoraryNotes.filter(n => isInPeriod(n.date, periodStart, periodEnd)),
    [honoraryNotes, periodStart, periodEnd]
  );
  const recettesFacturees = toDh(summary?.invoicedCents ?? 0);
  // Encaissé = net du registre des encaissements à la date du PAIEMENT (paiements − remboursements).
  const recettesEncaissees = toDh(summary?.netCents ?? 0);
  // Reste à encaisser : notes non annulées, toutes dates.
  const recettesEnAttente = toDh(summary?.outstandingCents ?? 0);
  // Dépenses actives hors « à amortir » (date de la dépense), et résultat : calculés par Rust.
  const totalExpensesPeriod = toDh(summary?.expensesCents ?? 0);
  const expensesCount = summary?.expensesCount ?? 0;
  // Résultat de trésorerie : encaissé − dépenses payées. Le facturé n'y entre jamais.
  const netProfit = toDh(summary?.resultCents ?? 0);
  const cancelledInPeriod = useMemo(
    () => dataService.getAllHonoraryNotes().filter(n => n.cancelledAt && isInPeriod(n.date, periodStart, periodEnd)),
    [honoraryNotes, periodStart, periodEnd]
  );
  const receiptsCount = expensesCount - (summary?.expensesWithoutReceipt ?? 0);

  // --- Statistiques patients de la période ---
  const firstInvoiceDateByPatient = useMemo(() => {
    const map: Record<string, string> = {};
    honoraryNotes.forEach(n => {
      if (!map[n.patientId] || n.date < map[n.patientId]) map[n.patientId] = n.date;
    });
    return map;
  }, [honoraryNotes]);

  const patientIdsInPeriod = useMemo(
    () => Array.from(new Set(periodInvoices.map(n => n.patientId))),
    [periodInvoices]
  );

  const isNewPatientInPeriod = (patientId: string, patient?: Patient) => {
    if (patient?.registeredDate) {
      const regDate = new Date(patient.registeredDate);
      return regDate >= periodStart && regDate <= periodEnd;
    }
    const firstInvoiceDate = firstInvoiceDateByPatient[patientId];
    return !!firstInvoiceDate && isInPeriod(firstInvoiceDate, periodStart, periodEnd);
  };

  const newPatientsCount = patientIdsInPeriod.filter(pid =>
    isNewPatientInPeriod(pid, allPatients.find(p => p.id === pid))
  ).length;
  const recurringPatientsCount = patientIdsInPeriod.length - newPatientsCount;
  const panierMoyen = patientIdsInPeriod.length > 0 ? recettesFacturees / patientIdsInPeriod.length : 0;
  const tauxRecouvrement = summary && summary.invoicedCents > 0 ? (summary.netCents / summary.invoicedCents) * 100 : 0;

  // --- Dépenses par catégorie (période) pour l'export fiscal ---
  const expensesByCategory: [string, number][] = (summary?.expensesByCategory ?? []).filter(c => !c.amortizable).map(c => [c.category, toDh(c.cents)]);

  const kpis = [
    {
      label: 'Facturé',
      value: formatMoney(recettesFacturees, currency),
      sub: `${summary?.invoicedCount ?? 0} note${(summary?.invoicedCount ?? 0) > 1 ? 's' : ''} émise${(summary?.invoicedCount ?? 0) > 1 ? 's' : ''} (hors annulées)`,
      icon: CreditCard,
      color: 'text-slate-600',
      bg: 'bg-slate-100'
    },
    {
      label: 'Encaissé',
      value: formatMoney(recettesEncaissees, currency),
      sub: summary
        ? `${formatMoney(toDh(summary.grossCents), currency)} reçus − ${formatMoney(toDh(summary.refundsCents), currency)} remboursés${summary.migratedCount > 0 ? ` · dont ${formatMoney(toDh(summary.migratedCents), currency)} repris (migré)` : ''}`
        : (accountingError ?? 'Calcul en cours…'),
      icon: Wallet,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
    },
    {
      label: 'Reste à encaisser',
      value: formatMoney(recettesEnAttente, currency),
      sub: `${summary?.outstandingNotes ?? 0} note${(summary?.outstandingNotes ?? 0) > 1 ? 's' : ''} non soldée${(summary?.outstandingNotes ?? 0) > 1 ? 's' : ''} (toutes dates)`,
      icon: Percent,
      color: 'text-amber-600',
      bg: 'bg-amber-50'
    },
    {
      label: 'Dépenses',
      value: formatMoney(totalExpensesPeriod, currency),
      sub: `${receiptsCount}/${expensesCount} justificatifs joints`,
      icon: Receipt,
      color: 'text-red-600',
      bg: 'bg-red-50'
    },
    {
      label: 'Résultat (encaissé − dépenses)',
      value: formatMoney(netProfit, currency),
      sub: netProfit >= 0 ? 'Solde excédentaire' : 'Solde déficitaire',
      icon: TrendingUp,
      color: netProfit >= 0 ? 'text-emerald-600' : 'text-red-600',
      bg: netProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'
    },
  ];

  const handleExportCSV = () => {
    const rows: string[] = [];
    rows.push(`Récapitulatif fiscal — ${periodLabel}`);
    rows.push(`Généré le ${new Date().toLocaleString('fr-FR')}`);
    rows.push('');
    rows.push('Recettes;Montant');
    rows.push(`${csvEscape('Total facturé')};${recettesFacturees.toFixed(2)}`);
    rows.push(`${csvEscape('Total encaissé (à la date du paiement)')};${recettesEncaissees.toFixed(2)}`);
    rows.push(`${csvEscape('Reste à encaisser (toutes dates)')};${recettesEnAttente.toFixed(2)}`);
    rows.push('');
    rows.push('Dépenses par catégorie;Montant');
    expensesByCategory.forEach(([cat, amount]) => {
      rows.push(`${csvEscape(cat)};${amount.toFixed(2)}`);
    });
    rows.push(`${csvEscape('Total dépenses')};${totalExpensesPeriod.toFixed(2)}`);
    rows.push('');
    rows.push(`${csvEscape('Résultat (encaissé − dépenses)')};${netProfit.toFixed(2)}`);
    // Notes annulées : hors totaux, mais leur numéro reste visible dans l'export.
    if (cancelledInPeriod.length > 0) {
      rows.push('');
      rows.push(`${csvEscape('Notes annulées (hors totaux)')};${csvEscape(cancelledInPeriod.map(n => n.invoiceNumber).join(' '))}`);
    }

    const csvContent = '﻿' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Recap_Fiscal_${timeRange}_${todayLocal()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toastService.success('Export CSV généré.');
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('fiscal-report-export');
    if (!element) return;

    const opt = {
      margin: 10,
      filename: `Recap_Fiscal_${timeRange}_${todayLocal()}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: 'avoid-all' }
    };

    if (!canOutput()) return;
    toastService.info('Génération du récapitulatif PDF...');
    const html2pdf = (await import('html2pdf.js')).default;
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => toastService.success('Export PDF généré.'))
      .catch((err: any) => {
        console.error('PDF Export Error:', err);
        toastService.error("Erreur lors de l'export PDF.");
      });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900 ">Comptabilité</h2>
          <p className="text-gray-500 font-medium">Recettes, dépenses et résultat de trésorerie du cabinet.</p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 shadow-inner">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === 'overview' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Aperçu
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`px-6 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === 'journal' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Journal des recettes
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-6 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === 'expenses' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Dépenses
          </button>
          <button
            onClick={() => setActiveTab('patients')}
            className={`px-6 py-2 rounded-xl text-xs font-semibold transition-all ${activeTab === 'patients' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Patients
          </button>
        </div>

        <div className="flex p-1.5 bg-gray-100 rounded-[1.5rem] border border-gray-200 shadow-inner">
          {(['Jour', 'Semaine', 'Mois', 'Année'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-6 py-2.5 rounded-2xl text-[10px] font-semibold transition-all duration-300 ${timeRange === range
                ? 'bg-white text-emerald-600 shadow-md ring-1 ring-gray-200'
                : 'text-gray-400 hover:text-gray-600'
                }`}
            >
              {range}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 font-semibold rounded-2xl hover:border-emerald-300 hover:text-emerald-600 transition-all active:scale-95 text-[10px] shadow-sm"
          >
            <TableIcon size={16} />
            Excel/CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-5 py-3 bg-gray-900 text-white font-semibold rounded-2xl hover:bg-gray-800 transition-all active:scale-95 text-[10px] shadow-sm"
          >
            <FileText size={16} />
            PDF
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold text-gray-400 -mt-4">
        Période sélectionnée : <span className="text-emerald-600">{periodLabel}</span>
      </p>

      <PeriodsPanel from={localDateStr(periodStart)} to={localDateStr(periodEnd)} refresh={refreshTrigger} onChanged={() => setRefreshTrigger(v => v + 1)} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 group hover:border-emerald-200 transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-900/5">
            <div className={`w-14 h-14 rounded-2xl ${kpi.bg} ${kpi.color} flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
              <kpi.icon size={28} />
            </div>
            <p className="text-[10px] font-semibold text-gray-400 mb-1">{kpi.label}</p>
            <p className="text-3xl font-semibold text-gray-900 mb-1">{kpi.value}</p>
            <p className="text-xs text-gray-400 font-bold">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Graphique d'évolution Recettes / Dépenses */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden relative">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-4">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-emerald-600 text-white rounded-3xl shadow-lg shadow-emerald-200">
                  <Activity size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900 ">Évolution encaissé / dépenses</h3>
                  <p className="text-xs text-gray-400 font-bold ">Argent encaissé et dépenses par période</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={showInvoiced} onChange={(e) => setShowInvoiced(e.target.checked)} className="accent-slate-500" />
                  Afficher le facturé
                </label>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-semibold text-gray-400 ">Encaissé</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <span className="text-[10px] font-semibold text-gray-400 ">Dépenses</span>
                </div>
              </div>
            </div>

            <div className="h-[400px] w-full flex items-end gap-2 md:gap-4 px-2 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.03] px-2 mb-10">
                {[...Array(5)].map((_, i) => <div key={i} className="w-full border-t-2 border-black"></div>)}
              </div>

              {stats.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-4">
                  <BarChart size={64} className="opacity-10" />
                  <p className="font-semibold text-sm">Données insuffisantes</p>
                </div>
              ) : (
                stats.map((data, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-6 group relative">
                    <div className="w-full relative flex items-end justify-center gap-1">
                      <div className="absolute -top-16 bg-gray-900 text-white p-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-20 scale-90 group-hover:scale-100 whitespace-nowrap">
                        <p className="text-[10px] font-semibold text-emerald-400 mb-1">{data.label}</p>
                        <p className="text-sm font-semibold">{formatMoney(data.collected, currency)} encaissé</p>
                        {showInvoiced && <p className="text-[10px] font-bold text-gray-300">{formatMoney(data.revenue, currency)} facturé</p>}
                        <p className="text-[10px] font-bold text-gray-400">{formatMoney(data.expense, currency)} dépenses</p>
                      </div>

                      {showInvoiced && (
                        <div
                          className="w-full max-w-[22px] rounded-xl bg-slate-300"
                          style={{ height: `${(data.revenue / maxVal) * 320 + 4}px` }}
                        ></div>
                      )}
                      <div
                        className="w-full max-w-[22px] rounded-xl transition-all duration-700 ease-out bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-xl shadow-emerald-900/5"
                        style={{ height: `${(data.collected / maxVal) * 320 + 4}px` }}
                      ></div>
                      <div
                        className="w-full max-w-[22px] rounded-xl transition-all duration-700 ease-out bg-gradient-to-t from-red-500 to-red-300 shadow-xl shadow-red-900/5"
                        style={{ height: `${(data.expense / maxVal) * 320 + 4}px` }}
                      ></div>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-semibold text-gray-400 group-hover:text-emerald-600 transition-colors">
                      {data.label}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Historique de Performance */}
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
                  <Calendar size={22} className="text-emerald-600" />
                  Récapitulatif de Période
                </h3>
                <TrendingUp size={20} className="text-gray-200" />
              </div>

              <div className="space-y-4">
                {stats.length === 0 ? (
                  <div className="p-10 text-center text-gray-300">
                    <p className="font-bold text-sm">Aucune donnée</p>
                  </div>
                ) : stats.slice().reverse().slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl group hover:bg-emerald-50 transition-all duration-300 border border-transparent hover:border-emerald-100">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm font-semibold text-sm">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{s.label}</p>
                        <p className="text-[10px] text-gray-400 font-bold ">{s.count} notes émises</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="font-semibold text-lg text-emerald-700">{formatMoney(s.collected, currency)}</p>
                        <p className="text-[9px] font-semibold text-emerald-500 ">Encaissé · {formatMoney(s.revenue, currency)} facturé</p>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl shadow-sm text-emerald-500 group-hover:translate-x-1 transition-transform">
                        <ArrowRight size={18} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dépenses par catégorie */}
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
                  <Receipt size={22} className="text-emerald-600" />
                  Dépenses par Catégorie
                </h3>
                <Activity size={20} className="text-gray-200" />
              </div>

              {expensesByCategory.length === 0 ? (
                <div className="p-10 text-center text-gray-300">
                  <Receipt size={48} className="mx-auto mb-4 opacity-10" />
                  <p className="font-bold text-sm">Aucune dépense sur la période</p>
                </div>
              ) : (
                <div className="space-y-12 py-4">
                  {expensesByCategory.map(([cat, amount], i) => {
                    const percentage = totalExpensesPeriod > 0 ? Math.round((amount / totalExpensesPeriod) * 100) : 0;
                    return (
                      <div key={i} className="space-y-4 group">
                        <div className="flex justify-between items-end">
                          <p className="font-semibold text-gray-700 text-sm">{cat}</p>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-gray-900">{formatMoney(amount, currency)}</span>
                            <span className="text-[10px] text-gray-400 font-bold ml-2 ">({percentage}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-5 bg-gray-50 rounded-full overflow-hidden border border-gray-100 shadow-inner p-1">
                          <div
                            className="h-full bg-red-400 rounded-full transition-all duration-1000 ease-in-out relative"
                            style={{ width: `${percentage}%` }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent"></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'journal' && (
        <JournalTab from={localDateStr(periodStart)} to={localDateStr(periodEnd)} refresh={refreshTrigger} />
      )}

      {activeTab === 'expenses' && (
        <ExpensesTab from={localDateStr(periodStart)} to={localDateStr(periodEnd)} currency={currency} refresh={refreshTrigger} onChanged={() => setRefreshTrigger(v => v + 1)} />
      )}

      {activeTab === 'patients' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                <Users size={28} />
              </div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">Patients vus</p>
              <p className="text-3xl font-semibold text-gray-900 ">{patientIdsInPeriod.length}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                <UserPlus size={28} />
              </div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">Nouveaux patients</p>
              <p className="text-3xl font-semibold text-gray-900 ">{newPatientsCount}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-6">
                <Repeat size={28} />
              </div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">Patients récurrents</p>
              <p className="text-3xl font-semibold text-gray-900 ">{recurringPatientsCount}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6">
                <ArrowUpRight size={28} />
              </div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1">Panier moyen</p>
              <p className="text-3xl font-semibold text-gray-900 ">{formatMoney(panierMoyen, currency)}</p>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
                <Percent size={22} className="text-emerald-600" />
                Taux de Recouvrement
              </h3>
            </div>
            {recettesFacturees === 0 ? (
              <p className="text-center text-gray-300 font-bold text-sm py-10">Aucune facture sur la période</p>
            ) : (
              <>
                <div className="w-full h-8 bg-gray-50 rounded-full overflow-hidden border border-gray-100 shadow-inner p-1 mb-4">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-in-out"
                    style={{ width: `${Math.min(100, Math.round(tauxRecouvrement))}%` }}
                  ></div>
                </div>
                <p className="text-sm font-bold text-gray-500">
                  <span className="text-2xl font-semibold text-emerald-600">{Math.round(tauxRecouvrement)}%</span> du facturé de la période correspond à l'encaissé de la période ({formatMoney(recettesEncaissees, currency)} sur {formatMoney(recettesFacturees, currency)}).
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modèle caché pour l'export PDF fiscal */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div id="fiscal-report-export" style={{ width: '190mm', padding: '10mm', fontFamily: 'sans-serif', color: '#111' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>Récapitulatif Fiscal — {periodLabel}</h1>
          <p style={{ fontSize: '10px', color: '#666', marginBottom: '20px' }}>Cabinet : {doctor.nameFr} — Généré le {new Date().toLocaleString('fr-FR')}</p>

          <h2 style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '8px' }}>Recettes</h2>
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '4px 0' }}>Total facturé (à part)</td><td style={{ textAlign: 'right' }}>{formatMoney(recettesFacturees, currency)}</td></tr>
              <tr><td style={{ padding: '4px 0' }}>Total encaissé</td><td style={{ textAlign: 'right' }}>{formatMoney(recettesEncaissees, currency)}</td></tr>
              <tr><td style={{ padding: '4px 0' }}>Reste à encaisser (toutes dates)</td><td style={{ textAlign: 'right' }}>{formatMoney(recettesEnAttente, currency)}</td></tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: '14px', fontWeight: 600, marginTop: '20px', marginBottom: '8px' }}>Dépenses par catégorie</h2>
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <tbody>
              {expensesByCategory.length === 0 ? (
                <tr><td style={{ padding: '4px 0' }}>Aucune dépense sur la période</td></tr>
              ) : expensesByCategory.map(([cat, amount]) => (
                <tr key={cat}><td style={{ padding: '4px 0' }}>{cat}</td><td style={{ textAlign: 'right' }}>{formatMoney(amount, currency)}</td></tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '1px solid #ccc' }}>
                <td style={{ padding: '6px 0' }}>Total dépenses</td><td style={{ textAlign: 'right' }}>{formatMoney(totalExpensesPeriod, currency)}</td>
              </tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '24px' }}>
            Résultat (encaissé − dépenses) : {formatMoney(netProfit, currency)}
          </h2>
          {cancelledInPeriod.length > 0 && (
            <p style={{ fontSize: '10px', color: '#444', marginTop: '16px' }}>
              Notes annulées (hors totaux) : {cancelledInPeriod.map(n => n.invoiceNumber).join(' ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
