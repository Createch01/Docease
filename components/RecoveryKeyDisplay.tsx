import React, { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle } from 'lucide-react';

interface RecoveryKeyDisplayProps {
    phrase: string;
    // Shown when this screen appears after a PIN/data recovery rather than initial setup.
    rotated?: boolean;
    onContinue: () => void;
}

// Shown exactly once, right after a master PIN is created, migrated, or rotated via
// recovery. This is the ONLY place the 24-word recovery phrase is ever displayed —
// the backend never persists it (see setup_pin/migrate_to_recovery/recover_with_phrase
// in src-tauri/src/lib.rs). If the user loses both their PIN and this phrase, the
// patient data is unrecoverable by design (real encryption, no backdoor).
const RecoveryKeyDisplay: React.FC<RecoveryKeyDisplayProps> = ({ phrase, rotated, onContinue }) => {
    const [confirmed, setConfirmed] = useState(false);
    const [copied, setCopied] = useState(false);
    const words = phrase.trim().split(/\s+/);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(phrase);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable, ignore */ }
    };

    return (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] p-4 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-[3rem] shadow-2xl max-w-2xl w-full p-10 my-8 animate-in zoom-in-95 duration-300">
                <div className="bg-emerald-50 p-6 rounded-[2rem] mb-6 mx-auto w-fit">
                    <KeyRound className="w-12 h-12 text-emerald-600" />
                </div>

                <h2 className="text-2xl font-black text-gray-900 mb-2 uppercase tracking-tight text-center">
                    {rotated ? 'Nouvelle clé de récupération' : 'Votre clé de récupération'}
                </h2>
                <p className="text-gray-500 mb-6 font-bold text-sm text-center">
                    Ces 24 mots permettent de retrouver l'accès à vos données si vous oubliez votre PIN maître.
                    Ils ne seront plus jamais affichés.
                </p>

                <div className="bg-gray-50 rounded-[2rem] p-6 mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {words.map((word, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-100">
                                <span className="text-gray-300 font-black text-xs w-5 text-right">{i + 1}.</span>
                                <span className="text-gray-900 font-bold text-sm tracking-wide">{word}</span>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="mt-4 flex items-center gap-2 mx-auto text-emerald-600 hover:text-emerald-700 font-black text-xs uppercase tracking-widest transition-colors"
                    >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? 'Copié' : 'Copier'}
                    </button>
                </div>

                <div className="bg-red-50 rounded-[2rem] p-5 mb-6 flex gap-3">
                    <AlertTriangle className="w-8 h-8 text-red-500 flex-shrink-0" />
                    <p className="text-red-700 font-bold text-xs leading-relaxed text-left">
                        Notez cette phrase sur papier et conservez-la dans un lieu physique sûr (coffre),
                        séparé de cet ordinateur. Ne la sauvegardez jamais dans un fichier ou une capture
                        d'écran sur ce disque : cela annulerait la protection du chiffrement. Si vous perdez
                        à la fois votre PIN maître ET cette phrase, les données patients seront
                        définitivement et irrémédiablement perdues — aucune récupération ne sera possible.
                    </p>
                </div>

                <label className="flex items-center gap-3 mb-6 cursor-pointer select-none justify-center">
                    <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        className="w-5 h-5 accent-emerald-600"
                    />
                    <span className="text-gray-700 font-bold text-sm">
                        J'ai noté ma clé de récupération en lieu sûr
                    </span>
                </label>

                <button
                    type="button"
                    disabled={!confirmed}
                    onClick={onContinue}
                    className="w-full px-6 py-5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-3xl text-lg transition-all shadow-xl shadow-emerald-900/10 active:scale-95 uppercase tracking-widest"
                >
                    Continuer
                </button>
            </div>
        </div>
    );
};

export default RecoveryKeyDisplay;
