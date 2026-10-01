import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff, User, UserCog, ChevronRight, ArrowLeft } from 'lucide-react';
import { securityService, Profile } from '../services/securityService';
import { validatePassword, minPasswordLength } from '../services/passwordPolicy';
import { getDevAutoUnlockPassword } from '../services/devAutoUnlock';
import RecoveryKeyDisplay from './RecoveryKeyDisplay';

interface AppLockScreenProps {
    mode: 'setup' | 'unlock';
    onUnlocked: () => void;
}

type View = 'form' | 'recovery-display' | 'recover-phrase' | 'change-password';

const ROLE_LABEL = { Medecin: 'Médecin', Assistant: 'Assistante' } as const;

// Mandatory app-lock gate shown BEFORE any patient data is loaded — dataService can
// only load once the encrypted store's AES key is set (see securityService/lib.rs).
// 'setup' runs once on first launch (création du compte médecin) ; 'unlock' runs on
// every launch and after every verrouillage : on choisit son profil puis on saisit SON
// mot de passe. Héberge aussi la phrase de récupération (affichée une fois) et la
// récupération du médecin ; il n'y a plus d'effacement des comptes depuis cet écran.
const AppLockScreen: React.FC<AppLockScreenProps> = ({ mode, onUnlocked }) => {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [profilesLoaded, setProfilesLoaded] = useState(false);
    const [selected, setSelected] = useState<Profile | null>(null);

    const [name, setName] = useState('');
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

    const [newOwnPassword, setNewOwnPassword] = useState('');
    const [confirmOwnPassword, setConfirmOwnPassword] = useState('');
    const [currentPasswordUsed, setCurrentPasswordUsed] = useState('');
    const [ownRole, setOwnRole] = useState<'Medecin' | 'Assistant'>('Assistant');

    useEffect(() => {
        if (mode !== 'unlock') return;
        securityService.listProfiles().then(list => {
            setProfiles(list);
            if (list.length === 1) setSelected(list[0]);
            setProfilesLoaded(true);
        });
    }, [mode]);

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        const check = validatePassword(pin, 'Medecin');
        if (!check.valid) { setError(check.error!); return; }
        if (pin !== confirmPin) { setError('Les deux mots de passe ne correspondent pas.'); return; }
        setBusy(true);
        try {
            const phrase = await securityService.setupPin(pin, name.trim() || undefined);
            if (phrase) {
                setRecoveryPhrase(phrase);
                setRecoveryIsRotation(false);
                setView('recovery-display');
            } else {
                onUnlocked();
            }
        } catch (err: any) {
            setError(typeof err === 'string' ? err : "Erreur lors de la création du mot de passe. Réessayez.");
            setBusy(false);
        }
    };

    const unlockWith = async (profile: Profile | null, password: string) => {
        setBusy(true);
        const res = await securityService.unlock(profile?.id ?? null, password);
        if (!res.ok) {
            setError(
                res.retryAfterSecs ? `Trop d'essais. Réessayez dans ${res.retryAfterSecs} s.`
                    : res.error ? res.error
                        : 'Mot de passe incorrect.'
            );
            setPin('');
            setBusy(false);
            return;
        }
        if (res.needsMigration) {
            try {
                const phrase = await securityService.migrateToRecovery(password);
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
        if (res.session?.mustChangePassword) {
            setCurrentPasswordUsed(password);
            setOwnRole(res.session.role);
            setBusy(false);
            setView('change-password');
            return;
        }
        onUnlocked();
    };

    const handleUnlock = (e: React.FormEvent) => {
        e.preventDefault();
        return unlockWith(selected, pin);
    };

    const handleChangeOwn = async (e: React.FormEvent) => {
        e.preventDefault();
        const check = validatePassword(newOwnPassword, ownRole);
        if (!check.valid) { setError(check.error!); return; }
        if (newOwnPassword !== confirmOwnPassword) { setError('Les deux mots de passe ne correspondent pas.'); return; }
        setBusy(true);
        try {
            await securityService.changeOwnPassword(currentPasswordUsed, newOwnPassword);
            onUnlocked();
        } catch (err: any) {
            setError(typeof err === 'string' ? err : 'Impossible de changer le mot de passe.');
            setBusy(false);
        }
    };

    // DEV only (null in production): same unlock path as typing the password, sur le
    // profil médecin (en développement l'application s'ouvre toujours en rôle Médecin).
    const devAutoTried = useRef(false);
    useEffect(() => {
        if (mode !== 'unlock' || !profilesLoaded || devAutoTried.current) return;
        const devPassword = getDevAutoUnlockPassword();
        if (!devPassword) return;
        devAutoTried.current = true;
        void unlockWith(profiles.find(p => p.role === 'Medecin') ?? null, devPassword);
    }, [mode, profilesLoaded]);

    const handleRecoverSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRecoverError('');
        const check = validatePassword(recoverNewPin, 'Medecin');
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

    const inputClass = 'w-full py-4 px-5 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-[2rem] font-bold text-base outline-none transition-all text-black';
    const primaryClass = 'w-full px-6 py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-3xl text-lg transition-all shadow-xl shadow-emerald-900/10 active:scale-95 uppercase tracking-widest';
    const linkClass = 'text-gray-400 hover:text-emerald-600 text-xs font-black uppercase tracking-widest transition-colors';
    const errorBox = (msg: string) => msg && (
        <div className="bg-red-50 text-red-600 p-3 rounded-2xl font-black text-xs uppercase tracking-widest">{msg}</div>
    );
    const shell = (children: React.ReactNode) => (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-[3rem] shadow-2xl max-w-md w-full p-10 text-center animate-in zoom-in-95 duration-300">
                {children}
            </div>
        </div>
    );

    if (view === 'recovery-display') {
        return (
            <RecoveryKeyDisplay
                phrase={recoveryPhrase}
                rotated={recoveryIsRotation}
                onContinue={onUnlocked}
            />
        );
    }

    if (view === 'change-password') {
        return shell(<>
            <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit"><ShieldCheck className="w-12 h-12 text-emerald-600" /></div>
            <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Nouveau mot de passe</h2>
            <p className="text-gray-500 mb-8 font-bold text-sm">
                Choisissez votre propre mot de passe ({minPasswordLength(ownRole)} caractères minimum) avant de continuer.
            </p>
            <form onSubmit={handleChangeOwn} className="space-y-4">
                <input type={showPin ? 'text' : 'password'} value={newOwnPassword} autoFocus maxLength={64}
                    onChange={(e) => { setNewOwnPassword(e.target.value); setError(''); }}
                    placeholder="Nouveau mot de passe" className={inputClass} />
                <input type={showPin ? 'text' : 'password'} value={confirmOwnPassword} maxLength={64}
                    onChange={(e) => { setConfirmOwnPassword(e.target.value); setError(''); }}
                    placeholder="Confirmer le mot de passe" className={inputClass} />
                {errorBox(error)}
                <button type="submit" disabled={!newOwnPassword || busy} className={primaryClass}>{busy ? '...' : 'Enregistrer'}</button>
            </form>
        </>);
    }

    if (view === 'recover-phrase') {
        return shell(<>
            <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit"><ShieldCheck className="w-12 h-12 text-emerald-600" /></div>
            <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Récupération</h2>
            <p className="text-gray-500 mb-8 font-bold text-sm">
                Réservée au médecin : saisissez votre clé de récupération à 24 mots, puis choisissez un nouveau mot de passe (12 caractères minimum).
                Une assistante qui a oublié son mot de passe doit demander sa réinitialisation au médecin.
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
                <input type={showPin ? 'text' : 'password'} value={recoverNewPin} maxLength={64}
                    onChange={(e) => { setRecoverNewPin(e.target.value); setRecoverError(''); }}
                    placeholder="Nouveau mot de passe" className={inputClass} />
                <input type={showPin ? 'text' : 'password'} value={recoverConfirmPin} maxLength={64}
                    onChange={(e) => { setRecoverConfirmPin(e.target.value); setRecoverError(''); }}
                    placeholder="Confirmer le nouveau mot de passe" className={inputClass} />
                {errorBox(recoverError)}
                <button type="submit" disabled={!recoverInput.trim() || !recoverNewPin || busy} className={primaryClass}>
                    {busy ? '...' : 'Récupérer l\'accès'}
                </button>
            </form>
            <button type="button" onClick={() => { setView('form'); setRecoverError(''); setBusy(false); }} className={`${linkClass} mt-6`}>Retour</button>
        </>);
    }

    // ── Première installation : création du compte médecin ──
    if (mode === 'setup') {
        return shell(<>
            <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit"><ShieldCheck className="w-12 h-12 text-emerald-600" /></div>
            <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">Sécurisez DocEase</h2>
            <p className="text-gray-500 mb-8 font-bold text-sm">
                Créez le compte médecin : un mot de passe d'au moins 12 caractères protège l'accès et chiffre les données de vos patients.
                Vous pourrez ensuite créer un compte pour chaque assistante.
            </p>
            <form onSubmit={handleSetup} className="space-y-4">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Votre nom (ex. Dr Alami)" maxLength={80} className={inputClass} autoFocus />
                <div className="relative">
                    <input type={showPin ? 'text' : 'password'} value={pin} maxLength={64}
                        onChange={(e) => { setPin(e.target.value); setError(''); }}
                        placeholder="Mot de passe" className={`${inputClass} pr-14`} />
                    <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors">
                        {showPin ? <EyeOff size={22} /> : <Eye size={22} />}
                    </button>
                </div>
                <input type={showPin ? 'text' : 'password'} value={confirmPin} maxLength={64}
                    onChange={(e) => { setConfirmPin(e.target.value); setError(''); }}
                    placeholder="Confirmer le mot de passe" className={inputClass} />
                {errorBox(error)}
                <button type="submit" disabled={!pin || busy} className={primaryClass}>{busy ? '...' : 'Créer le compte'}</button>
            </form>
            <p className="text-[10px] text-gray-400 mt-8 font-bold uppercase tracking-widest">Données chiffrées sur cet appareil</p>
        </>);
    }

    // ── Choix du profil ──
    if (!selected) {
        return shell(<>
            <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit"><Lock className="w-12 h-12 text-emerald-600" /></div>
            <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight">DocEase verrouillé</h2>
            <p className="text-gray-500 mb-8 font-bold text-sm">Qui êtes-vous ?</p>
            <div className="space-y-3">
                {profiles.map(p => (
                    <button key={p.id} type="button" onClick={() => { setSelected(p); setError(''); setPin(''); }}
                        className="w-full flex items-center gap-4 p-4 bg-gray-50 hover:bg-emerald-50 border-2 border-transparent hover:border-emerald-500 rounded-[2rem] transition-all text-left">
                        <div className="w-12 h-12 rounded-2xl bg-white text-emerald-600 flex items-center justify-center shadow-sm shrink-0">
                            {p.role === 'Medecin' ? <UserCog size={24} /> : <User size={24} />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-black text-gray-900 truncate">{p.name}</p>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{ROLE_LABEL[p.role]}</p>
                        </div>
                        <ChevronRight size={18} className="text-gray-300" />
                    </button>
                ))}
                {profilesLoaded && profiles.length === 0 && (
                    <p className="text-gray-400 font-bold text-sm">Aucun profil trouvé.</p>
                )}
            </div>
            <button type="button" onClick={() => { setView('recover-phrase'); setError(''); }} className={`${linkClass} mt-8`}>
                Mot de passe du médecin oublié ?
            </button>
            <p className="text-[10px] text-gray-400 mt-8 font-bold uppercase tracking-widest">Données chiffrées sur cet appareil</p>
        </>);
    }

    // ── Mot de passe du profil choisi ──
    return shell(<>
        <div className="bg-emerald-50 p-6 rounded-[2rem] mb-8 mx-auto w-fit"><Lock className="w-12 h-12 text-emerald-600" /></div>
        <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">{selected.name}</h2>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">{ROLE_LABEL[selected.role]}</p>
        <form onSubmit={handleUnlock} className="space-y-4">
            <div className="relative">
                <input type={showPin ? 'text' : 'password'} value={pin} maxLength={64} autoFocus
                    onChange={(e) => { setPin(e.target.value); setError(''); }}
                    placeholder="Mot de passe" className={`${inputClass} text-lg pr-14`} />
                <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600 transition-colors">
                    {showPin ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
            </div>
            {errorBox(error)}
            <button type="submit" disabled={!pin || busy} className={primaryClass}>{busy ? '...' : 'Déverrouiller'}</button>
        </form>
        {profiles.length > 1 && (
            <button type="button" onClick={() => { setSelected(null); setError(''); setPin(''); }} className={`${linkClass} mt-6 inline-flex items-center gap-1`}>
                <ArrowLeft size={12} /> Changer de profil
            </button>
        )}
        {selected.role === 'Assistant' && (
            <p className="text-[11px] text-gray-400 mt-6 font-bold">Mot de passe oublié ? Demandez sa réinitialisation au médecin.</p>
        )}
        <p className="text-[10px] text-gray-400 mt-8 font-bold uppercase tracking-widest">Données chiffrées sur cet appareil</p>
    </>);
};

export default AppLockScreen;
