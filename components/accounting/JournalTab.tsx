import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Journal, JournalRow, MODE_LABEL, accountingService } from '../../services/accountingService';
import { PAYMENT_KIND_LABEL, PaymentRegistryReport, paymentRegistryService } from '../../services/paymentRegistryService';
import { formatCents } from '../../services/receiptService';

// Journal des recettes : une ligne par écriture du registre des encaissements, à la date du PAIEMENT.
// Sous-totaux par jour et totaux par mode calculés par Rust ; aucun montant n'est additionné ici.

const field = 'h-9 px-2.5 rounded-lg border text-[13px] outline-none bg-white';
const border = { borderColor: 'var(--color-border)' } as React.CSSProperties;
const money = (cents: number) => <span style={cents < 0 ? { color: 'var(--color-danger-700, #b91c1c)' } : undefined}>{formatCents(cents)}</span>;

const JournalTab: React.FC<{ from: string; to: string; refresh: number }> = ({ from: defFrom, to: defTo, refresh }) => {
  const [from, setFrom] = useState(defFrom);
  const [to, setTo] = useState(defTo);
  const [mode, setMode] = useState('');
  const [kind, setKind] = useState<'' | 'payment' | 'refund'>('');
  const [data, setData] = useState<Journal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<PaymentRegistryReport | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => { setFrom(defFrom); setTo(defTo); }, [defFrom, defTo]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try { setData(await accountingService.journal(from, to, mode || undefined, kind || undefined)); }
    catch (e) { setData(null); setError(e instanceof Error ? e.message : 'Lecture impossible.'); }
    finally { setBusy(false); }
  }, [from, to, mode, kind]);
  useEffect(() => { void load(); }, [load, refresh]);

  const verify = async () => {
    setVerifying(true);
    try { setReport(await paymentRegistryService.verify()); }
    catch (e) { setReport(null); setError(e instanceof Error ? e.message : 'Vérification impossible.'); }
    finally { setVerifying(false); }
  };

  const rowsOfDay = (date: string): JournalRow[] => (data?.rows ?? []).filter(r => r.date === date);
  // Tous les jours qui ont au moins une ligne (même hors totaux) ; sous-total fourni par Rust.
  const days = Array.from(new Set((data?.rows ?? []).map(r => r.date))).map(date => data?.dayTotals.find(d => d.date === date) ?? { date, grossCents: 0, refundsCents: 0, netCents: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Du
          <input type="date" className={`${field} block mt-1`} style={border} value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Au
          <input type="date" className={`${field} block mt-1`} style={border} value={to} onChange={e => setTo(e.target.value)} /></label>
        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Mode
          <select className={`${field} block mt-1`} style={border} value={mode} onChange={e => setMode(e.target.value)}>
            <option value="">Tous</option>
            {['CASH', 'CHEQUE', 'TRANSFER', 'CARD'].map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select></label>
        <label className="text-[12px] font-medium" style={{ color: 'var(--color-text-subtle)' }}>Type
          <select className={`${field} block mt-1`} style={border} value={kind} onChange={e => setKind(e.target.value as '' | 'payment' | 'refund')}>
            <option value="">Tous</option>
            <option value="payment">Encaissements</option>
            <option value="refund">Remboursements</option>
          </select></label>
        {busy && <Loader2 size={16} className="animate-spin mb-2" />}
        <button type="button" onClick={verify} disabled={verifying}
          className="h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white disabled:opacity-40 ml-auto" style={border}>
          {verifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Vérifier l'intégrité
        </button>
      </div>

      {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
      {report && report.ok && (
        <p role="status" className="text-[13px] flex items-center gap-2" style={{ color: 'var(--color-success-700, #15803d)' }}>
          <CheckCircle2 size={16} /> Registre intact : {report.count} écriture{report.count > 1 ? 's' : ''}, net encaissé {formatCents(report.netCents)}.
        </p>
      )}
      {report && !report.ok && (
        <div role="alert" className="p-3 rounded-md text-[13px]" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>
          <p className="font-semibold flex items-center gap-2"><ShieldAlert size={16} /> Anomalie dans le registre</p>
          <ul className="list-disc pl-5 mt-1">{report.problems.map(p => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]" style={{ color: 'var(--color-text)' }}>
            <div className="p-3 rounded-lg bg-white border" style={border}><p style={{ color: 'var(--color-text-subtle)' }}>Encaissé (brut)</p><p className="text-[16px] font-semibold">{money(data.grossCents)}</p></div>
            <div className="p-3 rounded-lg bg-white border" style={border}><p style={{ color: 'var(--color-text-subtle)' }}>Remboursé</p><p className="text-[16px] font-semibold">{money(-data.refundsCents)}</p></div>
            <div className="p-3 rounded-lg bg-white border" style={border}><p style={{ color: 'var(--color-text-subtle)' }}>Net de la période</p><p className="text-[16px] font-semibold">{money(data.netCents)}</p></div>
            <div className="p-3 rounded-lg bg-white border" style={border}>
              <p style={{ color: 'var(--color-text-subtle)' }}>Par mode (net)</p>
              <ul className="mt-1">{data.modeTotals.map(m => <li key={m.mode} className="flex justify-between"><span>{MODE_LABEL[m.mode] ?? m.mode}</span><span>{money(m.netCents)}</span></li>)}</ul>
            </div>
          </div>

          <div className="overflow-x-auto bg-white rounded-lg border" style={border}>
            <table className="w-full text-[13px] text-left" style={{ color: 'var(--color-text)' }}>
              <thead>
                <tr style={{ color: 'var(--color-text-subtle)' }}>
                  {['Date', 'Heure', 'N° note', 'Patient', 'Type', 'Mode', 'Montant', 'Auteur', 'Motif'].map((h, i) => (
                    <th key={h} className={`py-2 px-3 font-medium ${h === 'Montant' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center" style={{ color: 'var(--color-text-subtle)' }}>Aucune écriture sur cette période.</td></tr>}
                {days.map(day => (
                  <React.Fragment key={day.date}>
                    {rowsOfDay(day.date).map(r => (
                      <tr key={r.seq} className="border-t" style={{ borderColor: 'var(--color-border)', opacity: r.neutralized ? 0.5 : 1 }}>
                        <td className="py-1.5 px-3">{r.date}</td>
                        <td className="py-1.5 px-3">{r.time || '—'}</td>
                        <td className="py-1.5 px-3 font-mono">{r.noteNumber || '—'}{r.noteCancelled && <span className="ml-2 text-[11px]" style={{ color: 'var(--color-danger-700)' }}>annulée</span>}</td>
                        <td className="py-1.5 px-3">{r.patientName || '—'}</td>
                        <td className="py-1.5 px-3">{r.kind === 'refund' ? PAYMENT_KIND_LABEL.refund : PAYMENT_KIND_LABEL.payment}{r.migrated && <span className="ml-2 text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>migré</span>}{r.neutralized && <span className="ml-2 text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>hors totaux</span>}</td>
                        <td className="py-1.5 px-3">{MODE_LABEL[r.mode] ?? r.mode}</td>
                        <td className="py-1.5 px-3 text-right">{money(r.amountCents)}</td>
                        <td className="py-1.5 px-3">{r.by}</td>
                        <td className="py-1.5 px-3">{r.reason || ''}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-medium" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg, #f8fafc)' }}>
                      <td className="py-1.5 px-3" colSpan={6}>Total du {day.date}</td>
                      <td className="py-1.5 px-3 text-right">{money(day.netCents)}</td>
                      <td className="py-1.5 px-3" colSpan={2}>{day.refundsCents > 0 ? `dont ${formatCents(-day.refundsCents)} remboursés` : ''}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default JournalTab;
