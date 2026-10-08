import React, { useState } from 'react';
import { CheckCircle2, Loader2, Receipt, ShieldAlert } from 'lucide-react';
import { ReceiptVerifyReport, receiptService } from '../../services/receiptService';
import { SettingsCard } from './SettingsUI';

/** Médecin : contrôle du registre des reçus (chaîne d'empreintes, suite continue, compteur). */
const ReceiptsRegistryCard: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReceiptVerifyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try { setReport(await receiptService.verify()); }
    catch (e) { setReport(null); setError(e instanceof Error ? e.message : 'Vérification impossible.'); }
    finally { setBusy(false); }
  };

  return (
    <SettingsCard
      title="Registre des reçus"
      icon={<Receipt size={16} />}
      description="Les reçus sont numérotés par l'application (REC-année-numéro, remise à 1 chaque année). Ils ne se modifient ni ne se suppriment : une erreur se corrige par un reçu d'annulation."
    >
      <button type="button" onClick={run} disabled={busy}
        className="h-10 px-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white disabled:opacity-40 w-fit"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Vérifier le registre
      </button>
      {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
      {report && report.ok && (
        <p role="status" className="text-[13px] flex items-center gap-2" style={{ color: 'var(--color-success-700, #15803d)' }}>
          <CheckCircle2 size={16} /> Registre intact : {report.count} entrée{report.count > 1 ? 's' : ''}{report.lastNumber ? `, dernier reçu ${report.lastNumber}` : ''}.
        </p>
      )}
      {report && !report.ok && (
        <div role="alert" className="p-3.5 rounded-md text-[13px]" style={{ background: 'var(--color-danger-50)', color: 'var(--color-danger-700)' }}>
          <p className="font-semibold flex items-center gap-2"><ShieldAlert size={16} /> Anomalie dans le registre</p>
          <ul className="list-disc pl-5 mt-1">{report.problems.map(p => <li key={p}>{p}</li>)}</ul>
          <p className="mt-1">Ne supprimez rien. Restaurez la dernière sauvegarde saine ou contactez le support : le registre actuel est conservé.</p>
        </div>
      )}
    </SettingsCard>
  );
};

export default ReceiptsRegistryCard;
