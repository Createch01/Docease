import { useEffect, useState } from 'react';
import { stampDataUrl, tariffService } from '../../services/tariffService';

/** Cachet / signature (pièce jointe chiffrée lue par Rust) pour l'impression : toute session, `null` sans cachet. */
export function useStamp(): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        tariffService.stamp().then(s => { if (alive) setUrl(stampDataUrl(s)); }).catch(() => { if (alive) setUrl(null); });
        return () => { alive = false; };
    }, []);
    return url;
}
