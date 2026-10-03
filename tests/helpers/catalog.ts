import fs from 'node:fs';
import path from 'node:path';
import type { Medicament } from '../../services/drugCatalogService';

/** Catalogue local complet (public/medicaments/medicament_A..Z_final.json), chargé une fois pour les tests. */
let cached: Medicament[] | null = null;

export function loadCatalog(): Medicament[] {
    if (cached) return cached;
    const dir = path.resolve(__dirname, '../../public/medicaments');
    const all: Medicament[] = [];
    for (const f of fs.readdirSync(dir).filter(n => /^medicament_[A-Z]_final\.json$/.test(n))) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        all.push(...(Array.isArray(j) ? j : j.medicaments || j.items || []));
    }
    cached = all;
    return all;
}
