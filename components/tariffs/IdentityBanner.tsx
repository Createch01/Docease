import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { tariffService } from '../../services/tariffService';
import { settingsHash } from '../settings/settingsRoutes';
import { sessionService } from '../../services/sessionService';

const LABEL: Record<string, string> = { inpe: 'INPE', taxId: 'IF' };

/**
 * Bandeau « Identité professionnelle incomplète » (médecin) : INPE ou IF manquants. Rust décide de ce qui
 * manque (`identity_check`) ; les autres champs (ICE, TP, CNSS, RIB) sont facultatifs.
 */
const IdentityBanner: React.FC<{ onNavigate?: () => void; version?: unknown }> = ({ onNavigate, version }) => {
    const [missing, setMissing] = useState<string[]>([]);
    useEffect(() => {
        let alive = true;
        if (!sessionService.isMedecin()) { setMissing([]); return; }
        tariffService.identityMissing().then(m => { if (alive) setMissing(m); }).catch(() => { if (alive) setMissing([]); });
        return () => { alive = false; };
    }, [version]);
    if (missing.length === 0) return null;
    return (
        <div role="note" data-testid="identity-incomplete" className="p-3 rounded-lg flex gap-2.5 items-start" style={{ background: 'var(--color-warning-50)' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-warning-800)' }} />
            <p className="text-[13px]" style={{ color: 'var(--color-warning-800)' }}>
                <strong className="font-semibold">Identité professionnelle incomplète</strong> : {missing.map(m => LABEL[m] ?? m).join(' et ')} manquant{missing.length > 1 ? 's' : ''} sur vos notes et reçus.{' '}
                <a className="underline" href={settingsHash({ section: 'cabinet', tab: 'identite' })} onClick={onNavigate}>Compléter</a>
            </p>
        </div>
    );
};

export default IdentityBanner;
