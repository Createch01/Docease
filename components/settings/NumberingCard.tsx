import React, { useState } from 'react';
import { CheckCircle2, Hash, Info, Loader2 } from 'lucide-react';
import { NumberingCheck, honoraryNoteService } from '../../services/honoraryNoteService';
import { SettingsCard } from './SettingsUI';

/** Médecin : contrôle de la numérotation des notes d'honoraires. Information seulement : rien n'est corrigé. */
const NumberingCard: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<NumberingCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try { setReport(await honoraryNoteService.check()); }
    catch (e) { setReport(null); setError(e instanceof Error ? e.message : 'Contrôle impossible.'); }
    finally { setBusy(false); }
  };

  return (
    <SettingsCard
      title="Numérotation des notes"
      icon={<Hash size={16} />}
      description="Chaque note reçoit, à son enregistrement, le numéro suivant de l'année (AAAA-NNNN) ; un numéro n'est jamais réutilisé. Une note numérotée ne se supprime pas : elle s'annule (motif obligatoire) et garde son numéro."
    >
      <button type="button" onClick={run} disabled={busy}
        className="h-10 px-4 rounded-lg border text-[13px] font-medium flex items-center gap-2 bg-white disabled:opacity-40 w-fit"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Contrôler la numérotation
      </button>
      {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
      {report && (
        <div role="status" className="text-[13px] space-y-2" style={{ color: 'var(--color-text)' }}>
          <p className="flex items-center gap-2" style={{ color: report.clean ? 'var(--color-success-700, #15803d)' : 'var(--color-warning-800)' }}>
            {report.clean ? <CheckCircle2 size={16} /> : <Info size={16} />}
            {report.clean ? 'Suite de numéros continue, sans doublon.' : 'Anomalies héritées détectées (information : rien n\'est modifié automatiquement).'}
          </p>
          <ul className="list-disc pl-5">
            {report.years.map(y => <li key={y.year}>{y.year} : {y.count} note{y.count > 1 ? 's' : ''}, dernier numéro {y.year}-{String(y.last).padStart(4, '0')}</li>)}
            {report.duplicates.length > 0 && <li>Numéros en double : {report.duplicates.join(', ')}</li>}
            {report.gapsTotal > 0 && <li>{report.gapsTotal} numéro{report.gapsTotal > 1 ? 's' : ''} manquant{report.gapsTotal > 1 ? 's' : ''}{report.gaps.length < report.gapsTotal ? ' (liste partielle)' : ''} : {report.gaps.join(', ')}</li>}
            {report.malformed.length > 0 && <li>Numéros mal formés : {report.malformed.join(', ')}</li>}
            {report.unnumbered > 0 && <li>{report.unnumbered} note{report.unnumbered > 1 ? 's' : ''} sans numéro (numérotée{report.unnumbered > 1 ? 's' : ''} à la prochaine écriture)</li>}
            {report.cancelled > 0 && <li>{report.cancelled} note{report.cancelled > 1 ? 's' : ''} annulée{report.cancelled > 1 ? 's' : ''} (numéro conservé)</li>}
          </ul>
        </div>
      )}
    </SettingsCard>
  );
};

export default NumberingCard;
