
import React, { useState, useMemo } from 'react';
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

type TimeRange = 'Jour' | 'Semaine' | 'Mois' | 'Année';

interface DataPoint {
  key: string;
  label: string;
  count: number;
  revenue: number;
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

const isInPeriod = (dateStr: string, start: Date, end: Date) => {
  const d = new Date(dateStr);
  return d >= start && d <= end;
};

const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('Jour');
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'patients'>('overview');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [expenseError, setExpenseError] = useState('');

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
    date: new Date().toISOString().split('T')[0],
    receiptDataUrl: undefined,
    noReceiptConfirmed: false
  });

  // Helper pour générer des dates passées
  const getPastDate = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  // Helper pour formater les labels du graphique
  const formatLabel = (dateStr: string, range: TimeRange) => {
    const d = new Date(dateStr);
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
      const d = new Date(dateStr);
      const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
      const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${weekNum}`;
    }
    return dateStr;
  };

  // Moteur d'agrégation pour le graphique d'évolution (recettes facturées vs dépenses)
  const stats = useMemo(() => {
    const dataMap: Record<string, DataPoint> = {};
    const now = new Date();

    if (timeRange === 'Jour') {
      for (let i = 13; i >= 0; i--) {
        const d = getPastDate(i);
        dataMap[d] = { key: d, label: formatLabel(d, 'Jour'), count: 0, revenue: 0, expense: 0 };
      }
    } else if (timeRange === 'Mois') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().substring(0, 7);
        dataMap[key] = { key, label: formatLabel(d.toISOString(), 'Mois'), count: 0, revenue: 0, expense: 0 };
      }
    }

    honoraryNotes.forEach(n => {
      const key = keyForDate(n.date, timeRange);
      if (!dataMap[key]) {
        if (timeRange === 'Jour' || timeRange === 'Mois') return;
        dataMap[key] = { key, label: formatLabel(n.date, timeRange), count: 0, revenue: 0, expense: 0 };
      }
      dataMap[key].count += 1;
      dataMap[key].revenue += n.totalAmount;
    });

    expenses.forEach(e => {
      const key = keyForDate(e.date, timeRange);
      if (!dataMap[key]) {
        if (timeRange === 'Jour' || timeRange === 'Mois') return;
        dataMap[key] = { key, label: formatLabel(e.date, timeRange), count: 0, revenue: 0, expense: 0 };
      }
      dataMap[key].expense += e.amount;
    });

    return Object.values(dataMap).sort((a, b) => a.key.localeCompare(b.key));
  }, [honoraryNotes, expenses, timeRange]);

  const maxVal = Math.max(...stats.map(s => Math.max(s.revenue, s.expense)), 1);

  // --- Période courante sélectionnée (jour/semaine/mois/année en cours) ---
  const { start: periodStart, end: periodEnd } = useMemo(() => getPeriodBounds(timeRange, new Date()), [timeRange]);
  const periodLabel = getPeriodLabel(timeRange, periodStart, periodEnd);

  const periodInvoices = useMemo(
    () => honoraryNotes.filter(n => isInPeriod(n.date, periodStart, periodEnd)),
    [honoraryNotes, periodStart, periodEnd]
  );
  const periodExpenses = useMemo(
    () => expenses.filter(e => isInPeriod(e.date, periodStart, periodEnd)),
    [expenses, periodStart, periodEnd]
  );

  const recettesFacturees = periodInvoices.reduce((sum, n) => sum + n.totalAmount, 0);
  // PARTIAL-aware: a partially-paid note counts its amountPaid as collected and the
  // remainder as outstanding, instead of being silently excluded like a plain UNPAID.
  const recettesEncaissees = periodInvoices.reduce((sum, n) => {
    if (n.status === 'PAID') return sum + n.totalAmount;
    if (n.status === 'PARTIAL') return sum + (n.amountPaid || 0);
    return sum;
  }, 0);
  const recettesEnAttente = recettesFacturees - recettesEncaissees;
  const totalExpensesPeriod = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = recettesFacturees - totalExpensesPeriod;
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
  const tauxRecouvrement = recettesFacturees > 0 ? (recettesEncaissees / recettesFacturees) * 100 : 0;

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
      date: new Date().toISOString().split('T')[0],
      receiptDataUrl: undefined,
      noReceiptConfirmed: false
    });
    setShowExpenseForm(false);
    toastService.success('Dépense enregistrée.');
  };

  const kpis = [
    {
      label: 'Recettes (CA)',
      value: formatMoney(recettesFacturees, currency),
      sub: `${formatMoney(recettesEncaissees, currency)} encaissé · ${formatMoney(recettesEnAttente, currency)} en attente`,
      icon: CreditCard,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50'
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
      label: 'Bénéfice Net',
      value: formatMoney(netProfit, currency),
      sub: netProfit >= 0 ? 'Solde excédentaire' : 'Solde déficitaire',
      icon: Wallet,
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
    rows.push(`${csvEscape('Total encaissé')};${recettesEncaissees.toFixed(2)}`);
    rows.push(`${csvEscape('En attente de paiement')};${recettesEnAttente.toFixed(2)}`);
    rows.push('');
    rows.push('Dépenses par catégorie;Montant');
    expensesByCategory.forEach(([cat, amount]) => {
      rows.push(`${csvEscape(cat)};${amount.toFixed(2)}`);
    });
    rows.push(`${csvEscape('Total dépenses')};${totalExpensesPeriod.toFixed(2)}`);
    rows.push('');
    rows.push(`${csvEscape('Résultat net')};${netProfit.toFixed(2)}`);

    const csvContent = '﻿' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Recap_Fiscal_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toastService.success('Export CSV généré.');
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('fiscal-report-export');
    if (!element) return;

    const opt = {
      margin: 10,
      filename: `Recap_Fiscal_${timeRange}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: 'avoid-all' }
    };

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
          <h2 className="text-4xl font-black text-gray-900 tracking-tight">Comptabilité & Finances</h2>
          <p className="text-gray-500 font-medium">Gestion professionnelle des recettes et dépenses du cabinet.</p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200 shadow-inner">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'overview' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Aperçu
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'expenses' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Dépenses
          </button>
          <button
            onClick={() => setActiveTab('patients')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'patients' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}
          >
            Patients
          </button>
        </div>

        <div className="flex p-1.5 bg-gray-100 rounded-[1.5rem] border border-gray-200 shadow-inner">
          {(['Jour', 'Semaine', 'Mois', 'Année'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${timeRange === range
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
            className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-gray-700 font-black rounded-2xl hover:border-emerald-300 hover:text-emerald-600 transition-all active:scale-95 text-[10px] uppercase tracking-widest shadow-sm"
          >
            <TableIcon size={16} />
            Excel/CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-5 py-3 bg-gray-900 text-white font-black rounded-2xl hover:bg-gray-800 transition-all active:scale-95 text-[10px] uppercase tracking-widest shadow-sm"
          >
            <FileText size={16} />
            PDF
          </button>
        </div>
      </div>

      <p className="text-xs font-black text-gray-400 uppercase tracking-widest -mt-4">
        Période sélectionnée : <span className="text-emerald-600">{periodLabel}</span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 group hover:border-emerald-200 transition-all duration-500 hover:shadow-2xl hover:shadow-emerald-900/5">
            <div className={`w-14 h-14 rounded-2xl ${kpi.bg} ${kpi.color} flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
              <kpi.icon size={28} />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">{kpi.label}</p>
            <p className="text-3xl font-black text-gray-900 tracking-tight mb-1">{kpi.value}</p>
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
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Évolution Recettes / Dépenses</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Variation temporelle basée sur les factures et dépenses réelles</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Recettes</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Dépenses</span>
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
                  <p className="font-black uppercase tracking-widest text-sm">Données insuffisantes</p>
                </div>
              ) : (
                stats.map((data, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-6 group relative">
                    <div className="w-full relative flex items-end justify-center gap-1">
                      <div className="absolute -top-16 bg-gray-900 text-white p-3 rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none shadow-2xl z-20 scale-90 group-hover:scale-100 whitespace-nowrap">
                        <p className="text-[10px] font-black uppercase text-emerald-400 mb-1">{data.label}</p>
                        <p className="text-sm font-black">{formatMoney(data.revenue, currency)} recettes</p>
                        <p className="text-[10px] font-bold text-gray-400">{formatMoney(data.expense, currency)} dépenses</p>
                      </div>

                      <div
                        className="w-full max-w-[22px] rounded-xl transition-all duration-700 ease-out bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-xl shadow-emerald-900/5"
                        style={{ height: `${(data.revenue / maxVal) * 320 + 4}px` }}
                      ></div>
                      <div
                        className="w-full max-w-[22px] rounded-xl transition-all duration-700 ease-out bg-gradient-to-t from-red-500 to-red-300 shadow-xl shadow-red-900/5"
                        style={{ height: `${(data.expense / maxVal) * 320 + 4}px` }}
                      ></div>
                    </div>
                    <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-tighter group-hover:text-emerald-600 transition-colors">
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
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
                  <Calendar size={22} className="text-emerald-600" />
                  Récapitulatif de Période
                </h3>
                <TrendingUp size={20} className="text-gray-200" />
              </div>

              <div className="space-y-4">
                {stats.length === 0 ? (
                  <div className="p-10 text-center text-gray-300">
                    <p className="font-bold uppercase tracking-widest text-sm">Aucune donnée</p>
                  </div>
                ) : stats.slice().reverse().slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-6 bg-gray-50 rounded-3xl group hover:bg-emerald-50 transition-all duration-300 border border-transparent hover:border-emerald-100">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm font-black text-sm">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-black text-gray-900 uppercase tracking-tight text-sm">{s.label}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{s.count} factures émises</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="font-black text-lg text-emerald-700">{formatMoney(s.revenue, currency)}</p>
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">CA Facturé</p>
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
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
                  <Receipt size={22} className="text-emerald-600" />
                  Dépenses par Catégorie
                </h3>
                <Activity size={20} className="text-gray-200" />
              </div>

              {expensesByCategory.length === 0 ? (
                <div className="p-10 text-center text-gray-300">
                  <Receipt size={48} className="mx-auto mb-4 opacity-10" />
                  <p className="font-bold uppercase tracking-widest text-sm">Aucune dépense sur la période</p>
                </div>
              ) : (
                <div className="space-y-12 py-4">
                  {expensesByCategory.map(([cat, amount], i) => {
                    const percentage = totalExpensesPeriod > 0 ? Math.round((amount / totalExpensesPeriod) * 100) : 0;
                    return (
                      <div key={i} className="space-y-4 group">
                        <div className="flex justify-between items-end">
                          <p className="font-black text-gray-700 uppercase tracking-tighter text-sm">{cat}</p>
                          <div className="text-right">
                            <span className="text-sm font-black text-gray-900">{formatMoney(amount, currency)}</span>
                            <span className="text-[10px] text-gray-400 font-bold ml-2 uppercase tracking-widest">({percentage}%)</span>
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

      {activeTab === 'expenses' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-red-600 text-white rounded-3xl shadow-lg shadow-red-200">
                  <Receipt size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Journal des Dépenses</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Enregistrez chaque frais professionnel avec justificatif pour calculer votre bénéfice réel.</p>
                </div>
              </div>
              <button
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className="flex items-center gap-2 px-6 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all active:scale-95 text-xs uppercase tracking-widest shadow-lg shadow-emerald-100"
              >
                <Plus size={18} />
                Nouvelle Dépense
              </button>
            </div>

            {showExpenseForm && (
              <div className="mb-12 p-8 bg-gray-50 rounded-3xl border border-gray-100 space-y-6 animate-in zoom-in-95 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Libellé / Description</label>
                    <input
                      type="text"
                      value={newExpense.label}
                      onChange={(e) => setNewExpense({ ...newExpense, label: e.target.value })}
                      placeholder="Ex: Loyer, Electricité, Fournitures..."
                      className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Montant ({currency})</label>
                    <input
                      type="number"
                      value={newExpense.amount || ''}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                      className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:border-emerald-500 outline-none font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Date</label>
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
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Catégorie</label>
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
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Précision (obligatoire)</label>
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
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Justificatif (photo/scan)</label>
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
                    <label htmlFor="no-receipt" className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <ImageOff size={16} />
                      Sans justificatif
                    </label>
                  </div>
                </div>

                {expenseError && (
                  <p className="text-xs font-black text-red-600 uppercase tracking-widest">{expenseError}</p>
                )}

                <button
                  onClick={handleAddExpense}
                  className="w-full h-[60px] bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all text-xs uppercase tracking-widest"
                >
                  Confirmer
                </button>
              </div>
            )}

            <div className="overflow-hidden border border-gray-50 rounded-3xl">
              <table className="w-full text-left">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Catégorie</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Justificatif</th>
                    <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Montant</th>
                    <th className="px-8 py-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-8 py-12 text-center text-gray-300">
                        <Receipt size={48} className="mx-auto mb-4 opacity-10" />
                        <p className="font-bold uppercase tracking-widest text-sm">Aucune dépense enregistrée</p>
                      </td>
                    </tr>
                  ) : (
                    expenses.slice().reverse().map((exp) => (
                      <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-8 py-6 font-bold text-gray-500 text-sm italic">{exp.date}</td>
                        <td className="px-8 py-6 font-black text-gray-900 uppercase tracking-tight">{exp.label}</td>
                        <td className="px-8 py-6 text-xs font-bold text-gray-500">{exp.category === 'Autre' ? (exp.categoryDetail || 'Autre') : exp.category}</td>
                        <td className="px-8 py-6 text-center">
                          {exp.receiptDataUrl ? (
                            <a href={exp.receiptDataUrl} target="_blank" rel="noreferrer" className="text-emerald-600 text-[10px] font-black uppercase tracking-widest hover:underline">Voir</a>
                          ) : exp.noReceiptConfirmed ? (
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sans justificatif</span>
                          ) : (
                            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Manquant</span>
                          )}
                        </td>
                        <td className="px-8 py-6 font-black text-red-600 text-right">-{formatMoney(exp.amount, currency)}</td>
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
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Patients vus</p>
              <p className="text-3xl font-black text-gray-900 tracking-tight">{patientIdsInPeriod.length}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6">
                <UserPlus size={28} />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Nouveaux patients</p>
              <p className="text-3xl font-black text-gray-900 tracking-tight">{newPatientsCount}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-6">
                <Repeat size={28} />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Patients récurrents</p>
              <p className="text-3xl font-black text-gray-900 tracking-tight">{recurringPatientsCount}</p>
            </div>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6">
                <ArrowUpRight size={28} />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Panier moyen</p>
              <p className="text-3xl font-black text-gray-900 tracking-tight">{formatMoney(panierMoyen, currency)}</p>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight flex items-center gap-3">
                <Percent size={22} className="text-emerald-600" />
                Taux de Recouvrement
              </h3>
            </div>
            {recettesFacturees === 0 ? (
              <p className="text-center text-gray-300 font-bold uppercase tracking-widest text-sm py-10">Aucune facture sur la période</p>
            ) : (
              <>
                <div className="w-full h-8 bg-gray-50 rounded-full overflow-hidden border border-gray-100 shadow-inner p-1 mb-4">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-in-out"
                    style={{ width: `${Math.min(100, Math.round(tauxRecouvrement))}%` }}
                  ></div>
                </div>
                <p className="text-sm font-bold text-gray-500">
                  <span className="text-2xl font-black text-emerald-600">{Math.round(tauxRecouvrement)}%</span> du montant facturé a été effectivement encaissé ({formatMoney(recettesEncaissees, currency)} sur {formatMoney(recettesFacturees, currency)}).
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modèle caché pour l'export PDF fiscal */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div id="fiscal-report-export" style={{ width: '190mm', padding: '10mm', fontFamily: 'sans-serif', color: '#111' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '4px' }}>Récapitulatif Fiscal — {periodLabel}</h1>
          <p style={{ fontSize: '10px', color: '#666', marginBottom: '20px' }}>Cabinet : {doctor.nameFr} — Généré le {new Date().toLocaleString('fr-FR')}</p>

          <h2 style={{ fontSize: '14px', fontWeight: 900, marginTop: '16px', marginBottom: '8px' }}>Recettes</h2>
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '4px 0' }}>Total facturé</td><td style={{ textAlign: 'right' }}>{formatMoney(recettesFacturees, currency)}</td></tr>
              <tr><td style={{ padding: '4px 0' }}>Total encaissé</td><td style={{ textAlign: 'right' }}>{formatMoney(recettesEncaissees, currency)}</td></tr>
              <tr><td style={{ padding: '4px 0' }}>En attente de paiement</td><td style={{ textAlign: 'right' }}>{formatMoney(recettesEnAttente, currency)}</td></tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: '14px', fontWeight: 900, marginTop: '20px', marginBottom: '8px' }}>Dépenses par catégorie</h2>
          <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
            <tbody>
              {expensesByCategory.length === 0 ? (
                <tr><td style={{ padding: '4px 0' }}>Aucune dépense sur la période</td></tr>
              ) : expensesByCategory.map(([cat, amount]) => (
                <tr key={cat}><td style={{ padding: '4px 0' }}>{cat}</td><td style={{ textAlign: 'right' }}>{formatMoney(amount, currency)}</td></tr>
              ))}
              <tr style={{ fontWeight: 900, borderTop: '1px solid #ccc' }}>
                <td style={{ padding: '6px 0' }}>Total dépenses</td><td style={{ textAlign: 'right' }}>{formatMoney(totalExpensesPeriod, currency)}</td>
              </tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: '16px', fontWeight: 900, marginTop: '24px' }}>
            Résultat net : {formatMoney(netProfit, currency)}
          </h2>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
