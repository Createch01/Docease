import { useCallback, useEffect, useState } from 'react';
import { TariffGrid, tariffService } from '../../services/tariffService';

/** Grille tarifaire lue par Rust (toute session). `null` tant qu'elle n'est pas chargée ou hors application de bureau. */
export function useTariffGrid() {
    const [grid, setGrid] = useState<TariffGrid | null>(null);
    const [error, setError] = useState<string | null>(null);
    const reload = useCallback(async () => {
        try { setGrid(await tariffService.grid()); setError(null); }
        catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }, []);
    useEffect(() => { void reload(); }, [reload]);
    return { grid, setGrid, error, reload };
}
