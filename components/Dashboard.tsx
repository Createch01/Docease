/**
 * Dashboard.tsx — DocEase V1 — données réelles uniquement
 *
 * Règle absolue : aucune valeur hardcodée, aucun placeholder.
 * Chaque métrique est calculée à partir des données stockées.
 *
 * Cartes V1 (toutes avec source réelle confirmée) :
 *  1. File d'attente du jour        → getTodayQueue()
 *  2. Chiffre d'affaires du jour    → getHonoraryNotes() + billingService.computeStats()
 *  3. Factures à régulariser        → getHonoraryNotes().filter(status !== 'PAID')
 *  4. Analyses en attente           → getLabRequests() filtre REQUESTED|RECEIVED
 *  5. Alertes                       → vaccins en retard + RDV urgents du jour
 *  6. Derniers patients             → getAllPatients() trié par registeredDate DESC
 *  7. Stats mois en cours           → getHonoraryNotes() filtre sur le mois courant
 *  8. Sparkline 7 jours             → getHonoraryNotes() 7 derniers jours (calculé)
 *  9. RDV du jour (conditionnelle)  → getAppointments() date = aujourd'hui, hors PENDING/REJECTED
 *                                      Carte masquée (pas "0 RDV") si aucun RDV planifié.
 *                                      Heure + statut (Planifié/Arrivé/En consultation/Terminé) affichés.
 *
 * Token-aligned : CSS variables depuis variables.css
 *   --color-primary #1A6B8A · --color-secondary #2ECC9A · 8px grid · Inter
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Database, Users, ArrowRight,
  TrendingUp, Wallet, FlaskConical,
  Bell, Syringe, CheckCircle2, ChevronRight,
  Calendar, UserCheck, XCircle,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { billingService } from '../services/billingService';
import { vaccinationService } from '../services/vaccinationService';
import { Patient, HonoraryNote, Appointment } from '../types';
import { formatAge } from '../utils/formatters';

interface DashboardProps {
  onNewPrescription: (patient?: Patient) => void;
  onNavigate: (view: any) => void;
  onViewDossier: (patientId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatMoney = (amount: number, currency: string) => {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'DH'}`;
};

/** Retourne les N derniers jours sous forme YYYY-MM-DD (du plus ancien au plus récent) */
const getLastNDays = (n: number): string[] => {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
};

const today = new Date().toISOString().split('T')[0];
const currentMonth = today.substring(0, 7); // YYYY-MM
const prevMonthDate = new Date();
prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
const prevMonth = prevMonthDate.toISOString().substring(0, 7);

// ─── Composant principal ───────────────────────────────────────────────────────

const Dashboard: React.FC<DashboardProps> = ({ onNewPrescription, onNavigate, onViewDossier }) => {
  const { t, lang, dir } = useI18n();

  // ── Refresh state (réactif aux events dataService) ────────────────────────
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [queue, setQueue] = useState<Patient[]>(dataService.getTodayQueue());

  useEffect(() => {
    const handler = (e: any) => {
      setRefreshTrigger(prev => prev + 1);
      if (e.detail?.key === 'meddoc_today_queue' || e.detail?.key === 'all') {
        setQueue(dataService.getTodayQueue());
      }
    };
    window.addEventListener('meddoc_data_update', handler);
    return () => window.removeEventListener('meddoc_data_update', handler);
  }, []);

  // ── Données de base ────────────────────────────────────────────────────────
  const doctor = useMemo(() => dataService.getDoctorInfo(), [refreshTrigger]);
  const currency = doctor.currency || 'DH';
  const allPatients = useMemo(() => dataService.getAllPatients(), [refreshTrigger]);
  const allNotes = useMemo(() => dataService.getHonoraryNotes(), [refreshTrigger]);
  const allLabRequests = useMemo(() => dataService.getLabRequests(), [refreshTrigger]);
  const allAppointments = useMemo(() => dataService.getAppointments(), [refreshTrigger]);

  // ── Carte 2 : CA du jour ───────────────────────────────────────────────────
  const todayNotes = useMemo(
    () => allNotes.filter(n => n.date === today),
    [allNotes]
  );
  const todayStats = useMemo(
    () => billingService.computeStats(todayNotes),
    [todayNotes]
  );

  // ── Carte 3 : Factures à régulariser ──────────────────────────────────────
  const unpaidNotes = useMemo(
    () => allNotes.filter(n => n.status !== 'PAID'),
    [allNotes]
  );
  const unpaidStats = useMemo(
    () => billingService.computeStats(unpaidNotes),
    [unpaidNotes]
  );

  // ── Carte 4 : Analyses en attente ─────────────────────────────────────────
  const pendingAnalyses = useMemo(
    () => allLabRequests.filter(r => r.status === 'REQUESTED' || r.status === 'RECEIVED'),
    [allLabRequests]
  );

  // ── Carte 5 : Alertes — vaccins en retard ─────────────────────────────────
  const overdueVaccinations = useMemo(() => {
    const alerts: { patientName: string; patientId: string; vaccineName: string }[] = [];
    allPatients.forEach(patient => {
      const status = vaccinationService.getVaccinationStatus(patient);
      status.filter(s => s.status === 'OVERDUE').forEach(item => {
        alerts.push({
          patientId: patient.id,
          patientName: patient.name,
          vaccineName: item.vaccine.name,
        });
      });
    });
    return alerts;
  }, [allPatients, refreshTrigger]);

  // ── Carte 5 : Alertes — RDV urgents du jour ───────────────────────────────
  const urgentAppointmentsToday = useMemo(
    () => allAppointments.filter(a => a.priority === 'URGENT' && a.date === today && a.status !== 'PENDING' && a.status !== 'REJECTED'),
    [allAppointments]
  );

  // ── Carte RDV du jour (conditionnelle) — masquée si aucun RDV planifié ────
  // Inclut tout le cycle de vie du jour (confirmé/arrivé/en consultation/terminé),
  // exclut seulement les RDV en attente de validation et les annulés.
  const todayAppointments = useMemo(
    () => [...allAppointments.filter(a => a.date === today && a.status !== 'PENDING' && a.status !== 'REJECTED')]
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99')),
    [allAppointments]
  );

  const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
    CONFIRMED: 'Planifié', ARRIVED: 'Arrivé', IN_CONSULTATION: 'En consultation', DONE: 'Terminé', PENDING: 'En attente'
  };

  const totalAlerts = overdueVaccinations.length + urgentAppointmentsToday.length;

  // ── Carte 6 : Derniers patients ───────────────────────────────────────────
  const recentPatients = useMemo(() => {
    return [...allPatients]
      .filter(p => !!p.registeredDate)
      .sort((a, b) =>
        new Date(b.registeredDate!).getTime() - new Date(a.registeredDate!).getTime()
      )
      .slice(0, 5);
  }, [allPatients]);

  // ── Carte 7 : Stats mois en cours ─────────────────────────────────────────
  const currentMonthNotes = useMemo(
    () => allNotes.filter(n => n.date.startsWith(currentMonth)),
    [allNotes]
  );
  const prevMonthNotes = useMemo(
    () => allNotes.filter(n => n.date.startsWith(prevMonth)),
    [allNotes]
  );
  const currentMonthStats = useMemo(
    () => billingService.computeStats(currentMonthNotes),
    [currentMonthNotes]
  );
  const prevMonthStats = useMemo(
    () => billingService.computeStats(prevMonthNotes),
    [prevMonthNotes]
  );
  // Patients distincts facturés ce mois-ci — même logique que "patients actifs" dans Analytics.tsx
  const activePatientsThisMonth = useMemo(
    () => new Set(currentMonthNotes.map(n => n.patientId)).size,
    [currentMonthNotes]
  );
  // Variation CA mensuel en % (null si pas de données mois précédent)
  const monthlyGrowth: number | null = useMemo(() => {
    if (prevMonthStats.total === 0) return null;
    return ((currentMonthStats.total - prevMonthStats.total) / prevMonthStats.total) * 100;
  }, [currentMonthStats, prevMonthStats]);

  // ── Carte 8 : Sparkline 7 jours réels ────────────────────────────────────
  // Basé sur le CA facturé (sum des notes) jour par jour sur les 7 derniers jours
  const last7Days = useMemo(() => getLastNDays(7), []);
  const sparkData = useMemo(() => {
    return last7Days.map(day => {
      const dayNotes = allNotes.filter(n => n.date === day);
      return dayNotes.reduce((sum, n) => sum + n.totalAmount, 0);
    });
  }, [allNotes, last7Days]);
  const sparkMax = Math.max(...sparkData, 1);
  const sparkTotal = sparkData.reduce((a, b) => a + b, 0);
  const sparkAvg = sparkTotal / sparkData.length;

  // ── Affichage ──────────────────────────────────────────────────────────────
  const formatDoctorName = lang === 'ar' ? doctor.nameAr : doctor.nameFr;
  const dateLabel = new Date().toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-[var(--max-content-width)] mx-auto pb-10">

      {/* ─── En-tête ─── */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[12px] font-medium mb-1 capitalize" style={{ color: 'var(--color-text-subtle)' }}>
            {dateLabel}
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {t('welcome')}, {formatDoctorName}
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Aperçu de votre journée et de votre activité récente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (window.confirm(
                "Voulez-vous effectuer la sauvegarde et archiver la journée ?\n\nCette action téléchargera une sauvegarde de vos données et videra la salle d'attente."
              )) {
                const passphrase = window.prompt('Mot de passe pour protéger cette sauvegarde :');
                if (!passphrase) return;
                await dataService.exportFullBackup(passphrase);
                dataService.archiveDay();
                setQueue([]);
              }
            }}
            className="h-10 px-4 rounded-lg text-[13px] font-medium flex items-center gap-2 border bg-white transition-all hover:bg-slate-50 active:scale-[0.98]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            <Database size={16} />
            {t('end_of_day')}
          </button>
          <button
            onClick={() => onNewPrescription()}
            className="h-10 px-5 rounded-lg text-[13px] font-medium flex items-center gap-2 text-white shadow-soft transition-all hover:shadow-card active:scale-[0.98]"
            style={{ background: 'var(--color-primary)' }}
          >
            <Plus size={16} strokeWidth={2.5} />
            {t('new_consultation')}
          </button>
        </div>
      </header>

      {/* ─── Ligne KPI (4 cartes) ─── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* KPI 1 — File d'attente */}
        <KpiCard
          label="File d'attente"
          value={queue.length}
          sub={queue.length === 0 ? 'Salle vide' : `${queue.length} patient${queue.length > 1 ? 's' : ''} en attente`}
          icon={Users}
          iconBg="var(--color-warning-50)"
          iconFg="var(--color-warning-hover)"
          badge={queue.length > 0 ? { text: 'En cours', color: 'var(--color-warning-50)', textColor: 'var(--color-warning-800)' } : undefined}
        />

        {/* KPI 2 — CA du jour */}
        <KpiCard
          label="CA du jour"
          value={formatMoney(todayStats.collected, currency)}
          sub={`Facturé : ${formatMoney(todayStats.total, currency)}`}
          icon={Wallet}
          iconBg="var(--color-secondary-50)"
          iconFg="#1F9B73"
          badge={
            todayStats.outstanding > 0
              ? { text: `${formatMoney(todayStats.outstanding, currency)} en attente`, color: 'var(--color-warning-50)', textColor: 'var(--color-warning-800)' }
              : { text: 'Soldé', color: 'var(--color-secondary-50)', textColor: '#1F7B5C' }
          }
        />

        {/* KPI 3 — Factures à régulariser */}
        <KpiCard
          label="À régulariser"
          value={unpaidNotes.length}
          sub={unpaidNotes.length > 0
            ? `Solde dû : ${formatMoney(unpaidStats.outstanding, currency)}`
            : 'Aucune impayée'}
          icon={unpaidNotes.length > 0 ? XCircle : CheckCircle2}
          iconBg={unpaidNotes.length > 0 ? 'var(--color-danger-50)' : 'var(--color-secondary-50)'}
          iconFg={unpaidNotes.length > 0 ? 'var(--color-danger)' : '#1F9B73'}
          badge={
            unpaidNotes.length > 0
              ? { text: `${unpaidNotes.filter(n => n.status === 'PARTIAL').length} partielles`, color: 'var(--color-danger-50)', textColor: 'var(--color-danger-700)' }
              : undefined
          }
          onClick={() => onNavigate('analytics')}
        />

        {/* KPI 4 — Analyses en attente */}
        <KpiCard
          label="Analyses en attente"
          value={pendingAnalyses.length}
          sub={pendingAnalyses.length === 0
            ? 'Aucune en attente de résultat'
            : `${pendingAnalyses.filter(r => r.status === 'RECEIVED').length} résultats reçus à interpréter`}
          icon={FlaskConical}
          iconBg="var(--color-primary-50)"
          iconFg="var(--color-primary)"
          badge={
            pendingAnalyses.length > 0
              ? { text: 'À suivre', color: 'var(--color-primary-50)', textColor: 'var(--color-primary)' }
              : undefined
          }
        />
      </section>

      {/* ─── Section principale : File + Alertes + Sparkline ─── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Salle d'attente (2 cols) */}
        <div
          className="lg:col-span-2 bg-white rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div
            className="px-6 py-4 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}
              >
                <Users size={16} strokeWidth={2.25} />
              </div>
              <div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  {t('waiting_room')}
                </div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
                  File manuelle — ordre d'arrivée
                </div>
              </div>
            </div>
            <span
              className="text-[11px] font-medium px-2 py-1 rounded"
              style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}
            >
              {queue.length} {t('in_waiting')}
            </span>
          </div>

          {queue.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div
                className="w-14 h-14 mx-auto mb-4 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-faint)' }}
              >
                <Users size={24} strokeWidth={1.75} />
              </div>
              <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
                {t('no_patients')}
              </div>
              <p className="text-[12px] max-w-[260px] mx-auto" style={{ color: 'var(--color-text-subtle)' }}>
                {t('no_patients_desc')}
              </p>
            </div>
          ) : (
            <ul>
              {queue.map((p, i) => (
                <li
                  key={p.id}
                  className="px-6 py-3 flex items-center justify-between border-b transition-all cursor-pointer hover:bg-slate-50"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-[13px] font-semibold tabular-nums"
                      style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                        {p.name}
                      </div>
                      <div className="text-[12px] flex items-center gap-2 mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                        <span>{formatAge(p)}</span>
                        {p.weight && (<><span>·</span><span>{p.weight}</span></>)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => onNewPrescription(p)}
                    className="w-9 h-9 rounded-md flex items-center justify-center transition-all hover:opacity-90"
                    style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                    aria-label={t('new_consultation')}
                  >
                    <ArrowRight size={16} className={dir === 'rtl' ? 'rotate-180' : ''} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sparkline CA 7 jours (réel) */}
        <div
          className="bg-white rounded-xl border p-6"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
              CA · 7 derniers jours
            </div>
            <TrendingUp size={16} style={{ color: 'var(--color-text-faint)' }} />
          </div>
          <div className="text-[11px] mb-4" style={{ color: 'var(--color-text-subtle)' }}>
            Recettes facturées (notes d'honoraires)
          </div>

          <div className="flex items-end gap-1.5 h-28 mb-3">
            {sparkData.map((v, idx) => {
              const isToday = idx === sparkData.length - 1;
              const heightPct = (v / sparkMax) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t relative"
                    style={{
                      background: isToday ? 'var(--color-primary)' : 'var(--color-primary-100)',
                      height: `${Math.max(heightPct, 6)}%`,
                    }}
                    title={`${formatMoney(v, currency)}`}
                  >
                    {isToday && v > 0 && (
                      <div
                        className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold px-1 py-0.5 rounded text-white whitespace-nowrap"
                        style={{ background: 'var(--color-primary)' }}
                      >
                        {v > 0 ? `${Math.round(v / 1000 * 10) / 10}k` : '0'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 text-[10px] text-center mb-4" style={{ color: 'var(--color-text-faint)' }}>
            {last7Days.map((d, i) => {
              const isToday = i === last7Days.length - 1;
              const label = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).charAt(0).toUpperCase();
              return (
                <span
                  key={d}
                  className={isToday ? 'font-semibold' : ''}
                  style={isToday ? { color: 'var(--color-primary)' } : {}}
                >
                  {label}
                </span>
              );
            })}
          </div>

          <div
            className="pt-4 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>Moy./jour</div>
              <div className="text-[17px] font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {formatMoney(sparkAvg, currency)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>Total 7j</div>
              <div className="text-[17px] font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {formatMoney(sparkTotal, currency)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── RDV du jour (conditionnel) — carte masquée s'il n'y a aucun RDV ─── */}
      {todayAppointments.length > 0 && (
        <div
          className="bg-white rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div
            className="px-6 py-4 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
              >
                <Calendar size={16} strokeWidth={2.25} />
              </div>
              <div>
                <div className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  RDV planifiés pour aujourd'hui
                </div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
                  Statut mis à jour en temps réel
                </div>
              </div>
            </div>
            <span
              className="text-[11px] font-medium px-2 py-1 rounded"
              style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
            >
              {todayAppointments.length}
            </span>
          </div>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {todayAppointments.map(app => (
              <li key={app.id} className="px-6 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
                    {app.time && <span className="font-mono text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>{app.time}</span>}
                    {app.patientName}
                  </div>
                  <div className="text-[12px] mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-subtle)' }}>
                    {app.note || 'Aucun motif renseigné'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
                    style={{
                      background: app.status === 'ARRIVED' ? 'var(--color-success-50, #ecfdf5)' : app.status === 'IN_CONSULTATION' ? 'var(--color-warning-50, #fffbeb)' : 'var(--color-surface-alt)',
                      color: app.status === 'ARRIVED' ? 'var(--color-success, #059669)' : app.status === 'IN_CONSULTATION' ? 'var(--color-warning, #d97706)' : 'var(--color-text-subtle)'
                    }}
                  >
                    {APPOINTMENT_STATUS_LABEL[app.status] || app.status}
                  </span>
                  {app.priority === 'URGENT' && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded"
                      style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger)' }}
                    >
                      URGENT
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── Section secondaire : Alertes + Derniers patients + Stats mois ─── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Alertes (1 col) */}
        <div
          className="bg-white rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div
            className="px-5 py-4 flex items-center gap-3 border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{
                background: totalAlerts > 0 ? 'var(--color-danger-50)' : 'var(--color-surface-alt)',
                color: totalAlerts > 0 ? 'var(--color-danger)' : 'var(--color-text-faint)',
              }}
            >
              <Bell size={15} strokeWidth={2.25} />
            </div>
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                Alertes
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                {totalAlerts === 0 ? 'Aucune alerte active' : `${totalAlerts} alerte${totalAlerts > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {totalAlerts === 0 && (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: 'var(--color-secondary)' }} />
                <div className="text-[13px]" style={{ color: 'var(--color-text-subtle)' }}>
                  Tout est à jour
                </div>
              </div>
            )}

            {/* RDV urgents du jour */}
            {urgentAppointmentsToday.map(app => (
              <div key={app.id} className="px-5 py-3 flex items-start gap-3">
                <div className="mt-0.5 w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger)' }}>
                  <Calendar size={13} />
                </div>
                <div>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--color-text)' }}>
                    RDV urgent · {app.patientName}
                  </div>
                  <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-subtle)' }}>
                    {app.note || 'Aucun motif renseigné'}
                  </div>
                </div>
              </div>
            ))}

            {/* Vaccins en retard (max 4 affichés) */}
            {overdueVaccinations.slice(0, 4).map((alert, i) => (
              <div
                key={`vac-${i}`}
                className="px-5 py-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-all"
                onClick={() => onViewDossier(alert.patientId)}
              >
                <div className="mt-0.5 w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-hover)' }}>
                  <Syringe size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                    {alert.patientName}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                    {alert.vaccineName} — en retard
                  </div>
                </div>
                <ChevronRight size={14} className="mt-1 flex-shrink-0" style={{ color: 'var(--color-text-faint)' }} />
              </div>
            ))}

            {overdueVaccinations.length > 4 && (
              <div className="px-5 py-2 text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
                + {overdueVaccinations.length - 4} autre{overdueVaccinations.length - 4 > 1 ? 's' : ''} vaccin{overdueVaccinations.length - 4 > 1 ? 's' : ''} en retard
              </div>
            )}
          </div>
        </div>

        {/* Derniers patients (1 col) */}
        <div
          className="bg-white rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div
            className="px-5 py-4 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
              >
                <UserCheck size={15} strokeWidth={2.25} />
              </div>
              <div>
                <div className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  Derniers patients
                </div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                  Par date d'inscription
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigate('dossier')}
              className="text-[11px] font-medium flex items-center gap-1"
              style={{ color: 'var(--color-primary)' }}
            >
              Voir tous <ArrowRight size={11} className={dir === 'rtl' ? 'rotate-180' : ''} />
            </button>
          </div>

          {recentPatients.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-[13px]" style={{ color: 'var(--color-text-subtle)' }}>
                Aucun patient enregistré
              </div>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {recentPatients.map(p => (
                <li
                  key={p.id}
                  className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-all"
                  onClick={() => onViewDossier(p.id)}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {p.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {p.name}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                      {formatAge(p)} · {p.sex === 'M' ? 'Homme' : p.sex === 'F' ? 'Femme' : ''}
                      {p.registeredDate && (
                        <> · Inscrit le {new Date(p.registeredDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--color-text-faint)' }} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stats mois en cours (1 col) */}
        <div
          className="bg-white rounded-xl border p-5"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: 'var(--color-secondary-50)', color: '#1F9B73' }}
            >
              <TrendingUp size={15} strokeWidth={2.25} />
            </div>
            <div>
              <div className="text-[14px] font-semibold" style={{ color: 'var(--color-text)' }}>
                Mois en cours
              </div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <StatRow
              label="CA facturé"
              value={formatMoney(currentMonthStats.total, currency)}
              highlight
            />
            <StatRow
              label="Encaissé"
              value={formatMoney(currentMonthStats.collected, currency)}
            />
            <StatRow
              label="En attente"
              value={formatMoney(currentMonthStats.outstanding, currency)}
              danger={currentMonthStats.outstanding > 0}
            />
            <StatRow
              label="Consultations facturées"
              value={`${currentMonthNotes.length}`}
            />
            <StatRow
              label="Patients actifs"
              value={`${activePatientsThisMonth}`}
            />
          </div>

          {/* Variation vs mois précédent */}
          <div
            className="mt-4 pt-4 border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {monthlyGrowth !== null ? (
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
                  vs mois précédent
                </span>
                <span
                  className="text-[13px] font-semibold tabular-nums"
                  style={{
                    color: monthlyGrowth >= 0 ? '#1F9B73' : 'var(--color-danger)',
                  }}
                >
                  {monthlyGrowth >= 0 ? '+' : ''}{monthlyGrowth.toFixed(1)} %
                </span>
              </div>
            ) : (
              <div className="text-[11px] text-center" style={{ color: 'var(--color-text-faint)' }}>
                Pas de données mois précédent pour comparaison
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('analytics')}
            className="mt-4 w-full h-9 rounded-lg text-[12px] font-medium border flex items-center justify-center gap-1.5 transition-all hover:bg-slate-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Voir l'analytique complète
            <ArrowRight size={12} className={dir === 'rtl' ? 'rotate-180' : ''} />
          </button>
        </div>
      </section>

    </div>
  );
};

// ─── Sous-composants ───────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ElementType;
  iconBg: string;
  iconFg: string;
  badge?: { text: string; color: string; textColor: string };
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon: Icon, iconBg, iconFg, badge, onClick }) => (
  <div
    className={`bg-white rounded-xl p-5 border transition-all hover:shadow-card ${onClick ? 'cursor-pointer' : ''}`}
    style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
    onClick={onClick}
  >
    <div className="flex items-center justify-between mb-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: iconBg, color: iconFg }}
      >
        <Icon size={18} strokeWidth={2} />
      </div>
      {badge && (
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full max-w-[120px] truncate"
          style={{ background: badge.color, color: badge.textColor }}
        >
          {badge.text}
        </span>
      )}
    </div>
    <div className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--color-text-subtle)' }}>
      {label}
    </div>
    <div
      className="text-[26px] font-bold tabular-nums leading-none mb-1 truncate"
      style={{ color: 'var(--color-text)' }}
    >
      {value}
    </div>
    <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
      {sub}
    </div>
  </div>
);

interface StatRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}

const StatRow: React.FC<StatRowProps> = ({ label, value, highlight, danger }) => (
  <div className="flex items-center justify-between">
    <span className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>{label}</span>
    <span
      className="text-[13px] font-semibold tabular-nums"
      style={{
        color: danger
          ? 'var(--color-danger)'
          : highlight
          ? 'var(--color-text)'
          : 'var(--color-text-muted)',
      }}
    >
      {value}
    </span>
  </div>
);

export default Dashboard;
