import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { aiService, AiStatus } from '../../services/aiService';
import { toastService } from '../../services/toastService';
import { SettingsCard, Toggle, input40, inputStyle, primaryButton } from './SettingsUI';

const secondaryButton = 'h-10 px-4 rounded-lg text-[13px] font-medium border transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';

// Fonctions IA (Gemini) : interrupteur (désactivé par défaut) + clé API. La clé est
// envoyée au backend Rust, stockée chiffrée, et n'est jamais renvoyée ici.
export const AiSettingsCard: React.FC = () => {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!aiService.isTauri()) { setUnavailable(true); return; }
    aiService.getStatus().then(setStatus).catch(() => setUnavailable(true));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await fn(); } catch (e: any) { setMessage({ ok: false, text: e?.message || 'Erreur.' }); }
    finally { setBusy(false); }
  };

  const toggle = (next: boolean) => run(async () => {
    if (next && !window.confirm(
      "Activer les fonctions IA ?\n\nLes données cliniques saisies (âge, sexe, symptômes, texte d'ordonnance, " +
      "documents analysés) seront envoyées à Google pour traitement. Les identifiants du patient sont retirés " +
      "des textes avant l'envoi, mais pas des documents analysés (image ou PDF).")) return;
    setStatus(await aiService.setEnabled(next));
  });

  const save = () => run(async () => {
    setStatus(await aiService.saveKey(keyInput));
    setKeyInput('');
    toastService.success('Clé API enregistrée (chiffrée)');
  });

  const test = () => run(async () => {
    await aiService.testKey();
    setMessage({ ok: true, text: 'Clé valide : le service IA répond.' });
  });

  const remove = () => run(async () => {
    if (!window.confirm('Supprimer la clé API enregistrée ?')) return;
    setStatus(await aiService.deleteKey());
    toastService.success('Clé API supprimée');
  });

  return (
    <SettingsCard
      title="Fonctions IA (Gemini)" icon={<Sparkles size={16} />}
      description="Analyse de documents, aide à la consultation, lecture d'ordonnances. Désactivé par défaut."
      actions={status && <Toggle label="Fonctions IA" checked={status.enabled} onChange={toggle} />}
    >
      {unavailable && (
        <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          Disponible uniquement dans l'application de bureau, une fois DocEase déverrouillé.
        </p>
      )}
      {status && (
        <div className="space-y-4 max-w-md">
          <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            Lorsque cette option est activée, les données médicales envoyées à chaque demande sont traitées par
            Google. Le nom, le prénom, le téléphone, la CIN, l'adresse et le numéro de dossier sont retirés des
            textes avant l'envoi ; un document analysé (image ou PDF) est envoyé tel quel. Les fonctions
            d'interactions et de contre-indications n'utilisent jamais l'IA.
          </p>

          <div className="space-y-2">
            <label className="block text-[12px] font-medium" htmlFor="ai-key">Clé API Gemini</label>
            {status.hasKey && (
              <p className="text-[12px] font-medium" style={{ color: 'var(--color-text)' }}>
                Clé enregistrée · se termine par …{status.keySuffix}
                {status.fromDev && ' (fournie par .env.local, développement)'}
              </p>
            )}
            <input
              id="ai-key" type="password" autoComplete="off" spellCheck={false}
              value={keyInput} onChange={e => { setKeyInput(e.target.value); setMessage(null); }}
              placeholder={status.hasKey ? 'Remplacer la clé…' : 'Collez votre clé API'}
              onKeyDown={e => e.key === 'Enter' && keyInput && !busy && save()}
              className={input40} style={inputStyle}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={save} disabled={!keyInput.trim() || busy}
                      className={primaryButton} style={{ background: 'var(--color-primary)' }}>
                Enregistrer la clé
              </button>
              <button type="button" onClick={test} disabled={!status.hasKey || busy}
                      className={secondaryButton} style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
                Tester la clé
              </button>
              <button type="button" onClick={remove} disabled={!status.hasKey || status.fromDev || busy}
                      className={secondaryButton} style={{ borderColor: 'var(--color-border)', color: 'var(--color-danger)' }}>
                Supprimer la clé
              </button>
            </div>
          </div>

          {message && (
            <p role="status" className="text-[12px] font-medium"
               style={{ color: message.ok ? 'var(--color-primary)' : 'var(--color-danger)' }}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </SettingsCard>
  );
};
