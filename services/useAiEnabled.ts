import { useEffect, useState } from 'react';
import { aiService, AI_STATUS_EVENT } from './aiService';
import { sessionService } from './sessionService';

/**
 * Vrai si le médecin a activé « Fonctions IA » (Paramètres). Faux hors application de
 * bureau, en session assistante, ou tant que l'état n'est pas lu.
 */
export function useAiEnabled(active: boolean = true): boolean {
    const [enabled, setEnabled] = useState(aiService.isEnabledCached());

    useEffect(() => {
        if (!active) return;
        const onChange = (e: Event) => setEnabled(!!(e as CustomEvent).detail?.enabled);
        window.addEventListener(AI_STATUS_EVENT, onChange);
        if (aiService.isTauri() && sessionService.isMedecin()) {
            aiService.getStatus().then(s => setEnabled(s.enabled)).catch(() => setEnabled(false));
        } else {
            setEnabled(false);
        }
        return () => window.removeEventListener(AI_STATUS_EVENT, onChange);
    }, [active]);

    return enabled;
}
