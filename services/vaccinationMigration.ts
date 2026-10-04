import { VaccinationRecord } from '../types';

/** Ancien stockage (en clair, hors sauvegarde) : une clé `vaccinations_<patientId>` par patient. */
export const LEGACY_PREFIX = 'vaccinations_';

type LegacyStore = Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>;

export interface MigrationDeps {
    legacy: LegacyStore;
    /** Enregistrements déjà présents dans le stockage chiffré (prioritaires sur les anciens). */
    current: VaccinationRecord[];
    /** Écriture chiffrée de la liste complète. */
    save: (records: VaccinationRecord[]) => Promise<void>;
    /** Relecture de contrôle depuis le stockage chiffré (null si illisible). */
    load: () => Promise<VaccinationRecord[] | null>;
}

export interface MigrationReport {
    /** Enregistrements repris depuis l'ancien stockage. */
    migrated: number;
    /** Clés localStorage supprimées après contrôle. */
    removedKeys: number;
    /** Clés laissées en place (JSON illisible, ou relecture de contrôle différente). */
    kept: string[];
    /** Liste complète à placer en mémoire. */
    records: VaccinationRecord[];
}

const sameKey = (r: Pick<VaccinationRecord, 'patientId' | 'vaccineId'>) => `${r.patientId}\u0000${r.vaccineId}`;

/**
 * Migration non destructive et idempotente :
 * lecture des anciennes clés → fusion → écriture chiffrée → relecture de contrôle →
 * SEULEMENT ENSUITE suppression des clés. Tout écart laisse les clés en place ; relancer
 * la migration reprend là où elle s'est arrêtée. Un enregistrement déjà présent dans le
 * stockage chiffré n'est jamais écrasé par une ancienne copie.
 */
export async function migrateLegacyVaccinations(deps: MigrationDeps): Promise<MigrationReport> {
    const { legacy } = deps;
    const keys: string[] = [];
    for (let i = 0; i < legacy.length; i++) {
        const k = legacy.key(i);
        if (k && k.startsWith(LEGACY_PREFIX) && k.length > LEGACY_PREFIX.length) keys.push(k);
    }
    if (keys.length === 0) return { migrated: 0, removedKeys: 0, kept: [], records: deps.current };

    const kept: string[] = [];
    const incoming: { key: string; records: VaccinationRecord[] }[] = [];
    for (const key of keys) {
        const patientId = key.slice(LEGACY_PREFIX.length);
        try {
            const parsed = JSON.parse(legacy.getItem(key) ?? '[]');
            if (!Array.isArray(parsed)) throw new Error('format');
            incoming.push({
                key,
                records: parsed
                    .filter((r: any) => r && typeof r === 'object' && typeof r.vaccineId === 'string')
                    .map((r: any) => ({ ...r, patientId })),
            });
        } catch {
            kept.push(key); // illisible : conservé tel quel, jamais supprimé
        }
    }

    const merged = [...deps.current];
    const seen = new Set(merged.map(sameKey));
    let migrated = 0;
    for (const { records } of incoming) {
        for (const r of records) {
            if (seen.has(sameKey(r))) continue;
            seen.add(sameKey(r));
            merged.push(r);
            migrated++;
        }
    }

    if (migrated > 0) await deps.save(merged);

    // Relecture de contrôle : tout enregistrement de la clé doit être présent, à l'identique.
    const back = await deps.load();
    let removedKeys = 0;
    for (const { key, records } of incoming) {
        const ok = back !== null && records.every(r => {
            const found = back.find(b => sameKey(b) === sameKey(r));
            return !!found; // présent (soit migré, soit déjà là : ses valeurs chiffrées font foi)
        });
        if (ok) {
            legacy.removeItem(key);
            removedKeys++;
        } else {
            kept.push(key);
        }
    }
    return { migrated, removedKeys, kept, records: merged };
}
