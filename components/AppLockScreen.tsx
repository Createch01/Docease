import React, { useState } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { securityService } from '../services/securityService';
import { validatePassword } from '../services/passwordPolicy';
import RecoveryKeyDisplay from './RecoveryKeyDisplay';

interface AppLockScreenProps {
    mode: 'setup' | 'unlock';
    onUnlocked: () => void;
}

type View = 'form' | 'recovery-display' | 'recover-phrase';

// Mandatory app-lock gate shown BEFORE any patient data is loaded — dataService can
// only load once the encrypted store's AES key is set (see securityService/lib.rs).
// 'setup' runs once on first launch (no PIN configured yet); 'unlock' runs on every
// subsequent launch. Also hosts the recovery-phrase display (shown once after setup,
// migration, or a successful "PIN oublié ?" recovery) and the recovery flow itself.
const AppLockScreen: React.FC<AppLockScreenProps> = ({ mode, onUnlocked }) => {
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const [view, setView] = useState<View>('form');
    const [recoveryPhrase, setRecoveryPhrase] = useState('');
    const [recoveryIsRotation, setRecoveryIsRotation] = useState(false);

    const [recoverInput, setRecoverInput] = useState('');
    const [recoverNewPin, setRecoverNewPin] = useState('');
    const [recoverConfirmPin, setRecoverConfirmPin] = useState('');
    const [recoverError, setRecoverError] = useState('');

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        const check = validatePassword(pin);
        if (!check.valid) { setError(check.error!); return; }
        if (pin !== confirmPin) { setError('Les deux mots de passe ne correspondent pas.'); return; }
        setBusy(true);
        try {
            const phrase = await securityService.setupPin(pin);
            if (phrase) {
                setRecoveryPhrase(phrase);
                setRecoveryIsRotation(false);
                setView('recovery-display');
            } else {
                onUnlocked();
            }
        } catch (err) {
            setError("Erreur lors de la création du mot de passe. Réessayez.");
            setBusy(false);
        }
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        const { ok, needsMigration } = await securityService.unlock(pin);
        if (!ok) {
            setError('Mot de passe incorrect.');
            setPin('');
            setBusy(false);
            return;
        }
        if (needsMigration) {
            try {
                const phrase = await securityService.migrateToRecovery(pin);
                setRecoveryPhrase(phrase);
                setRecoveryIsRotation(false);
                setView('recovery-display');
                return;
            } catch {
                // Migration failing shouldn't lock the doctor out — the legacy key
                // already unlocked the app; they can retry migration from Réglages later.
                onUnlocked();
                return;
            }
        }
        onUnlocked();
    };

    const handleRecoverSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRecoverError('');
        const check = validatePassword(recoverNewPin);
        if (!check.valid) { setRecoverError(check.error!); return; }
        if (recoverNewPin !== recoverConfirmPin) { setRecoverError('Les deux mots de passe ne correspondent pas.'); return; }
        setBusy(true);
        try {
            const phrase = await securityService.recoverWithPhrase(recoverInput, recoverNewPin);
            setRecoveryPhrase(phrase);
            setRecoveryIsRotation(true);
            setView('recovery-display');
        } catch (err: any) {
            setRecoverError(typeof err === 'string' ? err : (err?.message || 'Échec de la récupération.'));
            setBusy(false);
        }
    };

    if (view === 'recovery-display') {
        return (
            <RecoveryKeyDisplay
                phrase={recoveryPhrase}
                rotated={recoveryIsRotation}
                onContinue={onUnlocked}
            />
        );
    }

    if (view === 'recover-phrase') {
        return (
            <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
                <div className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full p-10 text-center animate-in zoom-in-95 duration-300">
                    <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit">
                        <ShieldCheck className="w-12 h-12 text-emerald-600" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">
                        Récupération
                    </h2>
                    <p className="text-gray-500 mb-8 font-bold text-sm">
                        Saisissez votre clé de récupération à 24 mots, puis choisissez un nouveau mot de passe maître.
                    </p>

                    <form onSubmit={handleRecoverSubmit} className="space-y-4">
                        <textarea
                            value={recoverInput}
                            onChange={(e) => { setRecoverInput(e.target.value); setRecoverError(''); }}
                            placeholder="mot1 mot2 mot3 ..."
                            rows={3}
                            className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-sm outline-none transition-all text-black resize-none"
                            autoFocus
                        />
                        <div className="relative">
                            <input
                                type={showPin ? 'text' : 'password'}
                                value={recoverNewPin}
                                onChange={(e) => { setRecoverNewPin(e.target.value); setRecoverError(''); }}
                                placeholder="Nouveau mot de passe maître"
                                className="w-full py-4 px-5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-base outline-none transition-all text-black"
                                maxLength={64}
                            />
                        </div>
                        <input
                            type={showPin ? 'text' : 'password'}
                            value={recoverConfirmPin}
                            onChange={(e) => { setRecoverConfirmPin(e.target.value); setRecoverError(''); }}
                            placeholder="Confirmer le nouveau mot de passe"
                            className="w-full py-4 px-5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-base outline-none transition-all text-black"
                            maxLength={64}
                        />

                        {recoverError && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-2xl font-black text-xs uppercase tracking-widest">
                                {recoverError}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!recoverInput.trim() || !recoverNewPin || busy}
                            className="w-full px-6 py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-3xl text-lg transition-all shadow-xl shadow-emerald-900/10 active:scale-95 uppercase tracking-widest"
                        >
                            {busy ? '...' : 'Récupérer l\'accès'}
                        </button>
                    </form>

                    <button
                        type="button"
                        onClick={() => { setView('form'); setRecoverError(''); setBusy(false); }}
                        className="text-gray-400 hover:text-emerald-600 text-xs font-black uppercase tracking-widest transition-colors mt-6"
                    >
                        Retour
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full p-10 text-center animate-in zoom-in-95 duration-300">
                <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit">
                    {mode === 'setup' ? <ShieldCheck className="w-12 h-12 text-emerald-600" /> : <Lock className="w-12 h-12 text-emerald-600" />}
                </div>

                <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">
                    {mode === 'setup' ? 'Sécurisez DocEase' : 'DocEase verrouillé'}
                </h2>
                <p className="text-gray-500 mb-8 font-bold text-sm">
                    {mode === 'setup'
                        ? "Créez un mot de passe (lettres et chiffres) pour protéger l'accès à l'application et chiffrer les données de vos patients."
                        : 'Saisissez votre mot de passe pour accéder aux dossiers.'}
                </p>

                <form onSubmit={mode === 'setup' ? handleSetup : handleUnlock} className="space-y-4">
                    <div className="relative">
                        <input
                            type={showPin ? 'text' : 'password'}
                            value={pin}
                            onChange={(e) => { setPin(e.target.value); setError(''); }}
                            placeholder="Mot de passe"
                            className="w-full py-5 px-5 pr-14 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-lg outline-none transition-all text-black"
                            maxLength={64}
                            autoFocus
                        />
                        <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors">
                            {showPin ? <EyeOff size={22} /> : <Eye size={22} />}
                        </button>
                    </div>

                    {mode === 'setup' && (
                        <input
                            type={showPin ? 'text' : 'password'}
                            value={confirmPin}
                            onChange={(e) => { setConfirmPin(e.target.value); setError(''); }}
                            placeholder="Confirmer le mot de passe"
                            className="w-full py-4 px-5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-base outline-none transition-all text-black"
                            maxLength={64}
                        />
                    )}

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-2xl font-black text-xs uppercase tracking-widest">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!pin || busy}
                        className="w-full px-6 py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-3xl text-lg transition-all shadow-xl shadow-emerald-900/10 active:scale-95 uppercase tracking-widest"
                    >
                        {busy ? '...' : mode === 'setup' ? 'Créer le mot de passe' : 'Déverrouiller'}
                    </button>
                </form>

                {mode === 'unlock' && (
                    <button
                        type="button"
                        onClick={() => { setView('recover-phrase'); setError(''); setPin(''); }}
                        className="text-gray-400 hover:text-emerald-600 text-xs font-black uppercase tracking-widest transition-colors mt-6"
                    >
                        Mot de passe maître oublié ?
                    </button>
                )}

                <p className="text-[10px] text-gray-400 mt-8 font-bold uppercase tracking-widest">
                    Données chiffrées sur cet appareil
                </p>
            </div>
        </div>
    );
};

export default AppLockScreen;
