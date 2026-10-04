import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, ShieldAlert } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { RecoverySheetModel, buildRecoverySheet } from '../../services/recoverySheet';

const SheetBody: React.FC<{ model: RecoverySheetModel }> = ({ model }) => (
  <div style={{ fontFamily: 'Inter, Arial, sans-serif', color: '#111', padding: '18mm 20mm', background: '#fff' }}>
    <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{model.title}</h1>
    <p style={{ fontSize: 13, margin: '6px 0 0' }}>{model.cabinet} · {model.dateLabel}</p>
    <div style={{ margin: '22px 0', padding: '16px 18px', border: '2px solid #111', borderRadius: 6 }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Phrase de passe</p>
      <p style={{ fontFamily: 'Consolas, "Courier New", monospace', fontSize: 18, fontWeight: 700, margin: 0, wordBreak: 'break-word' }}>{model.phrase}</p>
    </div>
    <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
      {model.instructions.map(t => <li key={t}>{t}</li>)}
    </ul>
  </div>
);

/**
 * Fiche de secours imprimable. La phrase n'existe que dans les propriétés de ce composant
 * (donc en mémoire) : démonter le composant l'efface. Aucun enregistrement sur disque par DocEase.
 */
const RecoverySheetModal: React.FC<{ phrase: string; onClose: () => void }> = ({ phrase, onClose }) => {
  const model = buildRecoverySheet(phrase, dataService.getDoctorInfo().nameFr);
  return (
    <>
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)' }} role="dialog" aria-modal="true" aria-label="Fiche de secours">
        <div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
          <p className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            <ShieldAlert size={18} /> Imprimez votre fiche de secours maintenant
          </p>
          <p className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
            Cette fiche n'est <strong>enregistrée nulle part</strong> et ne pourra plus être réaffichée : fermée, la phrase disparaît de l'écran.
            Imprimez-la sur papier (évitez « Enregistrer en PDF », qui laisserait un fichier sur l'ordinateur) et gardez-la hors du cabinet.
          </p>
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-border)' }}><SheetBody model={model} /></div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
              Fermer
            </button>
            <button type="button" onClick={() => window.print()} className="h-10 px-4 rounded-lg text-[13px] font-medium text-white flex items-center gap-2" style={{ background: 'var(--color-primary)' }}>
              <Printer size={15} /> Imprimer la fiche
            </button>
          </div>
        </div>
      </div>
      {/* Copie réservée à l'impression : le contrat d'impression global n'affiche que .document-print-container. */}
      {createPortal(<div className="document-print-container" style={{ display: 'none' }}><SheetBody model={model} /></div>, document.body)}
    </>
  );
};

export default RecoverySheetModal;
