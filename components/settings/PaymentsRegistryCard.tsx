import React, { useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, Wallet } from 'lucide-react';
import { PAYMENT_KIND_LABEL, PaymentEntry, PaymentRegistryReport, paymentRegistryService } from '../../services/paymentRegistryService';
import { PAYMENT_MODE_LABEL, formatCents } from '../../services/receiptService';
import { dataService } from '../../services/dataService';
import { SettingsCard } from './SettingsUI';

/** Médecin : registre des encaissements (ajout seul). Contrôle de la chaîne d'empreintes et dernières écritures. */
const PaymentsRegistryCard: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<PaymentRegistryReport | null>(null);
  const [entries, setEntries] = useState<PaymentEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await paymentRegistryService.verify());
      setEntries(await paymentRegistryService.list(500));
    } catch (e) { setReport(null); setEntries([]); setError(e instanceof Error ? e.message : 'Vérification impossible.'); }
    finally { setBusy(false); }
  };

  const noteOf = (id: string) => dataService.getAllHonoraryNotes().find(n => n.id === id);

  return (
    <SettingsCard
      title="Registre des encaissements"
      icon={<Wallet size={16} />}
      description="Chaque paiement reçu est inscrit avec sa date, son montant, son mode et son auteur. Le montant payé et le statut d'une note sont calculés à partir de ce registre. Il ne se modifie ni ne se supprime : un remboursement est une écriture négative avec motif."
    >
      <button type="button" onClick={run} disabled={busy}
        className="h-10 px-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white disabled:opacity-40 w-fit"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Vérifier le registre
      </button>
      {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
      {report && report.ok && (
        <p role="status" className="text-[13px] flex items-center gap-2" style={{ color: 'var(--color-success-700, #15803d)' }}>
          <CheckCircle2 size={16} /> Registre intact : {report.count} écriture{report.count > 1 ? 's' : ''} dont {report.migrated} migrée{report.migrated > 1 ? 's' : ''} et {report.refunds} remboursement{report.refunds > 1 ? 's' : ''} ; net encaissé {formatCents(report.netCents)}.
        </p>
      )}
      {report && report.neutralizedNotes > 0 && (
        <p className="text-[13px]" style={{ color: 'var(--color-text)' }}>{report.neutralizedNotes} note{report.neutralizedNotes > 1 ? 's' : ''} annulée{report.neutralizedNotes > 1 ? 's' : ''} neutralisée{report.neutralizedNotes > 1 ? 's' : ''} (encaissement migré à tort compensé par un remboursement « migré » ; rien n'a été supprimé).</p>
      )}
      {report && report.cancelledNotSettled > 0 && (
        <p role="alert" className="text-[13px]" style={{ color: 'var(--color-warning-800)' }}>{report.cancelledNotSettled} note{report.cancelledNotSettled > 1 ? 's' : ''} annulée{report.cancelledNotSettled > 1 ? 's' : ''} avec un net encaissé non nul : à rembourser.</p>
      )}
      {report && report.netByDay.length > 0 && (
        <div className="text-[12px]" style={{ color: 'var(--color-text)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--color-text-subtle)' }}>Net encaissé par jour</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4">{report.netByDay.map(d => <li key={d.date} className="flex justify-between"><span>{d.date}</span><span>{formatCents(d.netCents)}</span></li>)}</ul>
        </div>
      )}
      {report && !report.ok && (
        <div role="alert" className="p-3.5 rounded-md text-[13px]" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>
          <p className="font-semibold flex items-center gap-2"><ShieldAlert size={16} /> Anomalie dans le registre</p>
          <ul className="list-disc pl-5 mt-1">{report.problems.map(p => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] text-left" style={{ color: 'var(--color-text)' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-subtle)' }}>
                <th className="py-1 pr-3 font-medium">Date</th><th className="py-1 pr-3 font-medium">Note</th><th className="py-1 pr-3 font-medium">État</th><th className="py-1 pr-3 font-medium">Type</th>
                <th className="py-1 pr-3 font-medium text-right">Montant</th><th className="py-1 pr-3 font-medium">Mode</th><th className="py-1 font-medium">Par</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.seq} className="border-t" style={{ borderColor: 'var(--color-border)' }} title={e.reason ? `Motif : ${e.reason}` : undefined}>
                  <td className="py-1 pr-3">{e.date}</td>
                  <td className="py-1 pr-3 font-mono">{noteOf(e.noteId)?.invoiceNumber || '—'}</td>
                  <td className="py-1 pr-3">{noteOf(e.noteId)?.cancelledAt ? 'Note annulée' : ''}</td>
                  <td className="py-1 pr-3">{PAYMENT_KIND_LABEL[e.kind] ?? e.kind}</td>
                  <td className="py-1 pr-3 text-right">{formatCents(e.amountCents)}</td>
                  <td className="py-1 pr-3">{PAYMENT_MODE_LABEL[e.mode] ?? e.mode}</td>
                  <td className="py-1">{e.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsCard>
  );
};

export default PaymentsRegistryCard;
