
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
import { Expense, ExpenseCategory, EXPENSE_CATEGORIES, Patient } from '../types';
// @ts-ignore
import { toastService } from '../services/toastService';
import { canOutput } from '../services/cabinetSetup';
import { localDateStr, todayLocal } from '../utils/localDate';
import { Granularity, Summary, accountingService, toDh } from '../services/accountingService';
import JournalTab from './accounting/JournalTab';

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

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

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
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [expenseError, setExpenseError] = useState('');
  const [showInvoiced, setShowInvoiced] = useState(false);

  const honoraryNotes = useMemo(() => dataService.getHonoraryNotes(), [refreshTrigger]);
  const expenses = useMemo(() => dataService.getExpenses(), [refreshTrigger]);
  const allPatients = useMemo(() => dataService.getAllPatients(), [refreshTrigger]);
  const doctor = dataService.getDoctorInfo();
  const currency = doctor.currency || 'DH';

  React.useEffect(() => {
    const handleUpdate = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('meddoc_data_update', handleUpdate);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate);
  }, []);

  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    label: '',
    amount: 0,
    category: EXPENSE_CATEGORIES[0],
    categoryDetail: '',
    date: todayLocal(),
    receiptDataUrl: undefined,
    noReceiptConfirmed: false
  });

  // Helper pour générer des dates passées
  const getPastDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return localDateStr(d);
  };

  // Helper pour formater les labels du graphique
  const formatLabel = (dateStr: string, range: TimeRange) => {
    const d = parseLocalDay(dateStr);
    try {
      if (range === 'Jour') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      if (range === 'Mois') return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      if (range === 'Année') return d.getFullYear().toString();
      if (range === 'Semaine') {
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((d.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const weekNum = Math.ceil((d.getDay() + 1 + numberOfDays) / 7);
        return `Sem. ${weekNum}`;
      }
    } catch (e) {
      return dateStr;
    }
    return dateStr;
  };

  const keyForDate = (dateStr: string, range: TimeRange) => {
    if (range === 'Mois') return dateStr.substring(0, 7);
    if (range === 'Année') return dateStr.substring(0, 4);
    if (range === 'Semaine') {
      const d = parseLocalDay(dateStr);
      const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
      const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${weekNum}`;
    }
    return dateStr;
  };

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
    expense: 0,
  })), [chart]);
  const maxVal = Math.max(...stats.map(s => Math.max(s.collected, s.expense, showInvoiced ? s.revenue : 0)), 1);

  const periodInvoices = useMemo(
    () => honoraryNotes.filter(n => isInPeriod(n.date, periodStart, periodEnd)),
    [honoraryNotes, periodStart, periodEnd]
  );
  const periodExpenses = useMemo(
    () => expenses.filter(e => isInPeriod(e.date, periodStart, periodEnd)),
    [expenses, periodStart, periodEnd]
  );

  const recettesFacturees = toDh(summary?.invoicedCents ?? 0);
  // Encaissé = net du registre des encaissements à la date du PAIEMENT (paiements − remboursements).
  const recettesEncaissees = toDh(summary?.netCents ?? 0);
  // Reste à encaisser : notes non annulées, toutes dates.
  const recettesEnAttente = toDh(summary?.outstandingCents ?? 0);
  const totalExpensesPeriod = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  // Résultat de trésorerie : encaissé − dépenses payées. Le facturé n'y entre jamais.
  const netProfit = recettesEncaissees - totalExpensesPeriod;
  const cancelledInPeriod = useMemo(
    () => dataService.getAllHonoraryNotes().filter(n => n.cancelledAt && isInPeriod(n.date, periodStart, periodEnd)),
    [honoraryNotes, periodStart, periodEnd]
  );
  const receiptsCount = periodExpenses.filter(e => !!e.receiptDataUrl).length;

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
  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    periodExpenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setNewExpense(prev => ({ ...prev, receiptDataUrl: dataUrl, noReceiptConfirmed: false }));
      setExpenseError('');
    } catch {
      toastService.error("Impossible de lire le fichier du justificatif.");
    }
  };

  const handleAddExpense = () => {
    if (!newExpense.label || !newExpense.amount) {
      setExpenseError('Le libellé et le montant sont obligatoires.');
      return;
    }
    if (newExpense.category === 'Autre' && !newExpense.categoryDetail) {
      setExpenseError('Merci de préciser la nature de la dépense pour la catégorie "Autre".');
      return;
    }
    if (!newExpense.receiptDataUrl && !newExpense.noReceiptConfirmed) {
      setExpenseError('Joignez un justificatif ou cochez explicitement "Sans justificatif".');
      return;
    }
    setExpenseError('');
    dataService.saveExpense({
      ...newExpense as Expense,
      id: Date.now().toString()
    });
    setNewExpense({
      label: '',
      amount: 0,
      category: EXPENSE_CATEGORIES[0],
      categoryDetail: '',
      date: todayLocal(),
      receiptDataUrl: undefined,
      noReceiptConfirmed: false
    });
    setShowExpenseForm(false);
    toastService.success('Dépense enregistrée.');
  };

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
      sub: `${receiptsCount}/${periodExpenses.length} justificatifs joints`,
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
        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-red-600 text-white rounded-3xl shadow-lg shadow-red-200">
                  <Receipt size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900 ">Journal des Dépenses</h3>
                  <p className="text-xs text-gray-400 font-bold ">Enregistrez chaque frais professionnel avec justificatif pour calculer votre bénéfice réel.</p>
                </div>
              </div>
              <button
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="flex items-center gap-2 px-6 py-4 bg-emerald-600 text-white font-semibold rounded-2xl hover:bg-emerald-700 transition-all active:scale-95 text-xs shadow-lg shadow-emerald-100"
              >
                <Plus size={18} />
                Nouvelle Dépense
              </button>
            </div>

            {showExpenseForm && (
              <div className="mb-12 p-8 bg-gray-50 rounded-3xl border border-gray-100 space-y-6 animate-in zoom-in-95 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-semibold text-gray-400 mb-2 block">Libellé / Description</label>
                    <input
                      type="text"
                      value={newExpense.label}
                      onChange={(e) => setNewExpense({ ...newExpense, label: e.target.value })}
                      placeholder="Ex: Loyer, Electricité, Fournitures..."
                      className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 mb-2 block">Montant ({currency})</label>
                    <input
                      type="number"
                      value={newExpense.amount || ''}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                      className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 mb-2 block">Date</label>
                    <input
                      type="date"
                      value={newExpense.date}
                      onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                      className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 mb-2 block">Catégorie</label>
                    <select
                      value={newExpense.category}
                      onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value as ExpenseCategory })}
                      className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    >
                      {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  {newExpense.category === 'Autre' && (
                    <div>
                      <label className="text-[10px] font-semibold text-gray-400 mb-2 block">Précision (obligatoire)</label>
                      <input
                        type="text"
                        value={newExpense.categoryDetail || ''}
                        onChange={(e) => setNewExpense({ ...newExpense, categoryDetail: e.target.value })}
                        placeholder="Précisez la nature de la dépense"
                        className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-400 mb-2 block">Justificatif (photo/scan)</label>
                    <label className="flex items-center gap-3 w-full px-5 py-4 bg-white border border-dashed border-gray-300 rounded-2xl font-bold text-gray-500 cursor-pointer hover:border-emerald-400 transition-colors">
                      <Upload size={18} />
                      {newExpense.receiptDataUrl ? 'Justificatif joint ✓' : 'Choisir un fichier...'}
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleReceiptUpload} />
                    </label>
                  </div>
                  <div className="flex items-center gap-3 pt-8">
                    <input
                      type="checkbox"
                      id="no-receipt"
                      checked={!!newExpense.noReceiptConfirmed}
                      onChange={(e) => setNewExpense({ ...newExpense, noReceiptConfirmed: e.target.checked, receiptDataUrl: e.target.checked ? undefined : newExpense.receiptDataUrl })}
                      className="w-5 h-5 accent-emerald-600"
                    />
                    <label htmlFor="no-receipt" className="text-xs font-semibold text-gray-500 flex items-center gap-2">
                      <ImageOff size={16} />
                      Sans justificatif
                    </label>
                  </div>
                </div>

                {expenseError && (
                  <p className="text-xs font-semibold text-red-600 ">{expenseError}</p>
                )}

                <button
                  onClick={handleAddExpense}
                  className="w-full h-[60px] bg-emerald-600 text-white font-semibold rounded-2xl hover:bg-emerald-700 transition-all text-xs "
                >
                  Confirmer
                </button>
              </div>
            )}

            <div className="overflow-hidden border border-gray-50 rounded-3xl">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-semibold text-gray-400 ">Date</th>
                    <th className="px-8 py-5 text-[10px] font-semibold text-gray-400 ">Description</th>
                    <th className="px-8 py-5 text-[10px] font-semibold text-gray-400 ">Catégorie</th>
                    <th className="px-8 py-5 text-[10px] font-semibold text-gray-400 text-center">Justificatif</th>
                    <th className="px-8 py-5 text-[10px] font-semibold text-gray-400 text-right">Montant</th>
                    <th className="px-8 py-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-gray-300">
                        <Receipt size={48} className="mx-auto mb-4 opacity-10" />
                        <p className="font-bold text-sm">Aucune dépense enregistrée</p>
                      </td>
                    </tr>
                  ) : (
                    expenses.slice().reverse().map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-8 py-6 font-bold text-gray-500 text-sm italic">{exp.date}</td>
                        <td className="px-8 py-6 font-semibold text-gray-900 ">{exp.label}</td>
                        <td className="px-8 py-6 text-xs font-bold text-gray-500">{exp.category === 'Autre' ? (exp.categoryDetail || 'Autre') : exp.category}</td>
                        <td className="px-8 py-6 text-center">
                          {exp.receiptDataUrl ? (
                            <a href={exp.receiptDataUrl} target="_blank" rel="noreferrer" className="text-emerald-600 text-[10px] font-semibold hover:underline">Voir</a>
                          ) : exp.noReceiptConfirmed ? (
                            <span className="text-[10px] font-semibold text-gray-400 ">Sans justificatif</span>
                          ) : (
                            <span className="text-[10px] font-semibold text-red-400 ">Manquant</span>
                          )}
                        </td>
                        <td className="px-8 py-6 font-semibold text-red-600 text-right">-{formatMoney(exp.amount, currency)}</td>
                        <td className="px-8 py-6 text-right">
                          <button
                            onClick={() => dataService.deleteExpense(exp.id)}
                            className="p-2.5 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
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
