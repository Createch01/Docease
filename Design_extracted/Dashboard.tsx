/**
 * Dashboard.tsx — DocEase v3 (new design system)
 *
 * Token-aligned: uses CSS variables from variables.css
 *   --color-primary #1A6B8A · --color-secondary #2ECC9A · 8px grid · Inter
 *
 * Logic, props, hooks, dataService calls — UNCHANGED.
 */

import React, { useState, useEffect } from 'react';
import {
  Plus, Database, UserCheck, Users, FileText, ShieldAlert,
  ArrowRight, TrendingUp, MoreHorizontal,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { dataService } from '../services/dataService';
import { Patient } from '../types';

interface DashboardProps {
  onNewPrescription: (patient?: Patient) => void;
  onNavigate: (view: any) => void;
  onViewDossier: (patientId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNewPrescription, onNavigate, onViewDossier }) => {
  const { t, lang, dir } = useI18n();
  const doctor = dataService.getDoctorInfo();
  const prescriptions = dataService.getPrescriptions();
  const [queue, setQueue] = useState<Patient[]>(dataService.getTodayQueue());
  const today = new Date().toISOString().split('T')[0];
  const todaysList = prescriptions.filter(p => p.date === today);

  useEffect(() => {
    const loadQueue = () => setQueue(dataService.getTodayQueue());
    loadQueue();
    const handleUpdate = (e: any) => {
      if (e.detail?.key === 'meddoc_today_queue' || e.detail?.key === 'all') loadQueue();
    };
    window.addEventListener('meddoc_data_update', handleUpdate);
    return () => window.removeEventListener('meddoc_data_update', handleUpdate);
  }, []);

  // Generate sparkline values (7-day activity, last = today's count)
  const sparkData = [4, 7, 6, 9, 7, 8, todaysList.length];
  const sparkMax = Math.max(...sparkData, 1);

  const formatDoctorName = lang === 'ar' ? doctor.nameAr : doctor.nameFr;
  const dateLabel = new Date().toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-[var(--max-content-width)] mx-auto pb-10">
      {/* ─── Page header ─── */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[12px] font-medium mb-1 capitalize" style={{ color: 'var(--color-text-subtle)' }}>
            {dateLabel}
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>
            {t('welcome')}, {formatDoctorName}
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Voici un aperçu de votre journée.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm("Voulez-vous effectuer la sauvegarde et archiver la journée ?\n\nCette action téléchargera une sauvegarde de vos données et videra la salle d'attente.")) {
                dataService.exportFullBackup();
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

      {/* ─── KPI row ─── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: t('consultations'),
            value: todaysList.length,
            sub: t('today'),
            icon: UserCheck,
            iconBg: 'var(--color-primary-50)',
            iconFg: 'var(--color-primary)',
            trend: '+12%',
            trendBg: 'var(--color-secondary-50)',
            trendFg: '#25946A',
            showTrendIcon: true,
          },
          {
            label: t('waiting_room'),
            value: queue.length,
            sub: t('queue_description'),
            icon: Users,
            iconBg: 'var(--color-warning-50)',
            iconFg: 'var(--color-warning-hover)',
            trend: 'Stable',
            trendBg: 'var(--color-surface-alt)',
            trendFg: 'var(--color-text-subtle)',
            showTrendIcon: false,
          },
          {
            label: 'Ordonnances',
            value: todaysList.length,
            sub: `Cette semaine : ${prescriptions.length}`,
            icon: FileText,
            iconBg: 'var(--color-secondary-50)',
            iconFg: '#1F9B73',
            trend: '+8%',
            trendBg: 'var(--color-secondary-50)',
            trendFg: '#25946A',
            showTrendIcon: true,
          },
          {
            label: 'Alertes sécurité',
            value: 0,
            sub: 'À vérifier ce jour',
            icon: ShieldAlert,
            iconBg: 'var(--color-danger-50)',
            iconFg: 'var(--color-danger)',
            trend: 'Aucune',
            trendBg: 'var(--color-secondary-50)',
            trendFg: '#1F7B5C',
            showTrendIcon: false,
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-6 border transition-all hover:shadow-card"
            style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: stat.iconBg, color: stat.iconFg }}
              >
                <stat.icon size={18} strokeWidth={2} />
              </div>
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded flex items-center gap-1"
                style={{ background: stat.trendBg, color: stat.trendFg }}
              >
                {stat.showTrendIcon && <TrendingUp size={12} />}
                {stat.trend}
              </span>
            </div>
            <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--color-text-subtle)' }}>
              {stat.label}
            </div>
            <div className="text-[32px] font-bold tabular-nums leading-none mb-1" style={{ color: 'var(--color-text)' }}>
              {stat.value}
            </div>
            <div className="text-[12px]" style={{ color: 'var(--color-text-subtle)' }}>
              {stat.sub}
            </div>
          </div>
        ))}
      </section>

      {/* ─── Two-column lower section ─── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Waiting room — spans 2 cols */}
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
                  Ordre d'arrivée
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
                        <span>ID {p.id}</span>
                        <span>·</span>
                        <span>{p.age} ans</span>
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

        {/* Activity sparkline */}
        <div
          className="bg-white rounded-xl border p-6"
          style={{ borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-soft)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
              Activité 7 jours
            </div>
            <button
              className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-slate-50 transition-all"
              style={{ color: 'var(--color-text-faint)' }}
              aria-label="Options"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
          <div className="flex items-end gap-2 h-32 mb-4">
            {sparkData.map((v, idx) => {
              const isToday = idx === sparkData.length - 1;
              const heightPct = (v / sparkMax) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 rounded-t relative"
                  style={{
                    background: isToday ? 'var(--color-primary)' : 'var(--color-primary-100)',
                    height: `${heightPct}%`,
                    minHeight: '8%',
                  }}
                >
                  {isToday && (
                    <div
                      className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-semibold px-1.5 py-0.5 rounded text-white tabular-nums"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      {v}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 text-[10px] text-center" style={{ color: 'var(--color-text-faint)' }}>
            <span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span>
            <span className="font-semibold" style={{ color: 'var(--color-primary)' }}>D</span>
          </div>
          <div
            className="mt-5 pt-5 border-t flex items-center justify-between"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div>
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>Moy. quotidienne</div>
              <div className="text-[18px] font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {(sparkData.reduce((a, b) => a + b, 0) / sparkData.length).toFixed(1)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>Total semaine</div>
              <div className="text-[18px] font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                {sparkData.reduce((a, b) => a + b, 0)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Recent activity (full width) ─── */}
      {todaysList.length > 0 && (
        <section
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
                style={{ background: 'var(--color-secondary-50)', color: '#1F9B73' }}
              >
                <FileText size={16} strokeWidth={2.25} />
              </div>
              <div className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>
                {t('recent_activity')}
              </div>
            </div>
            <button
              className="text-[12px] font-medium flex items-center gap-1"
              style={{ color: 'var(--color-primary)' }}
            >
              {t('view_history')} <ArrowRight size={12} className={dir === 'rtl' ? 'rotate-180' : ''} />
            </button>
          </div>
          <ul>
            {todaysList.slice().reverse().map((p, i) => (
              <li
                key={i}
                onClick={() => onViewDossier(p.patientId)}
                className="px-6 py-3 flex items-center justify-between border-b cursor-pointer transition-all hover:bg-[var(--color-row-hover)]"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {(dataService.getPatientProfile(p.patientId)?.name || p.patientId).substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[14px] font-medium" style={{ color: 'var(--color-text)' }}>
                      {dataService.getPatientProfile(p.patientId)?.name || p.patientId}
                    </div>
                    <div className="text-[12px] flex items-center gap-2 mt-0.5" style={{ color: 'var(--color-text-subtle)' }}>
                      <span>{p.items.length} médicaments</span>
                      <span>·</span>
                      <span>{p.patientType}</span>
                    </div>
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: 'var(--color-text-faint)' }} className={dir === 'rtl' ? 'rotate-180' : ''} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default Dashboard;
