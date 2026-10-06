import { describe, it, expect } from 'vitest';
import type { VaccinationRecord } from '../types';
import { migrateLegacyVaccinations } from '../services/vaccinationMigration';

const rec = (patientId: string, vaccineId: string, date = '2026-01-01'): VaccinationRecord => ({ id: `${patientId}-${vaccineId}`, patientId, vaccineId, dateAdministered: date, status: 'DONE' });

const memStorage = (init: Record<string, string>) => {
    const m = new Map(Object.entries(init));
    return {
        m,
        get length() { return m.size; },
        key: (i: number) => [...m.keys()][i] ?? null,
        getItem: (k: string) => m.get(k) ?? null,
        removeItem: (k: string) => { m.delete(k); },
    };
};

/** « Disque chiffré » simulé ; `failWrites` : l'écriture échoue sans lever d'erreur (comme storageService.save). */
const disk = (initial: VaccinationRecord[] | null = null, failWrites = false) => {
    const d = { data: initial, writes: 0 };
    return {
        d,
        save: async (r: VaccinationRecord[]) => { d.writes++; if (!failWrites) d.data = r; },
        load: async () => d.data,
    };
};

describe('migration des carnets de vaccination', () => {
    const legacy = () => memStorage({
        vaccinations_p1: JSON.stringify([rec('p1', 'bcg'), rec('p1', 'vpo0')]),
        vaccinations_p2: JSON.stringify([rec('p2', 'hb1')]),
        meddoc_patients: '[]', // autre clé : jamais touchée
        docease_language: 'fr',
    });

    it('copie chiffrée, relecture de contrôle, puis suppression des anciennes clés', async () => {
        const ls = legacy(); const dk = disk();
        const r = await migrateLegacyVaccinations({ legacy: ls, current: [], save: dk.save, load: dk.load });
        expect(r).toMatchObject({ migrated: 3, removedKeys: 2, kept: [] });
        expect(dk.d.data).toHaveLength(3);
        expect([...ls.m.keys()].sort()).toEqual(['docease_language', 'meddoc_patients']);
    });

    it("écriture qui échoue : les anciennes clés restent intactes", async () => {
        const ls = legacy(); const dk = disk(null, true);
        const r = await migrateLegacyVaccinations({ legacy: ls, current: [], save: dk.save, load: dk.load });
        expect(r.removedKeys).toBe(0);
        expect(r.kept.sort()).toEqual(['vaccinations_p1', 'vaccinations_p2']);
        expect(ls.m.has('vaccinations_p1') && ls.m.has('vaccinations_p2')).toBe(true);
    });

    it("relecture partielle : seule la clé entièrement retrouvée est supprimée", async () => {
        const ls = legacy();
        const r = await migrateLegacyVaccinations({ legacy: ls, current: [], save: async () => {}, load: async () => [rec('p2', 'hb1')] });
        expect(r.removedKeys).toBe(1);
        expect(r.kept).toEqual(['vaccinations_p1']);
        expect(ls.m.has('vaccinations_p2')).toBe(false);
    });

    it('idempotente : un second passage ne réécrit rien', async () => {
        const ls = legacy(); const dk = disk();
        const first = await migrateLegacyVaccinations({ legacy: ls, current: [], save: dk.save, load: dk.load });
        const second = await migrateLegacyVaccinations({ legacy: ls, current: first.records, save: dk.save, load: dk.load });
        expect(second).toMatchObject({ migrated: 0, removedKeys: 0 });
        expect(dk.d.writes).toBe(1);
    });

    it('reprise après interruption : clés restées en place, données déjà chiffrées sans doublon', async () => {
        const ls = legacy(); const already = [rec('p1', 'bcg', '2026-03-03')];
        const dk = disk(already);
        const r = await migrateLegacyVaccinations({ legacy: ls, current: already, save: dk.save, load: dk.load });
        expect(r.migrated).toBe(2);
        expect(dk.d.data!.filter(x => x.patientId === 'p1' && x.vaccineId === 'bcg')).toHaveLength(1);
        expect(dk.d.data!.find(x => x.vaccineId === 'bcg')!.dateAdministered).toBe('2026-03-03'); // la copie chiffrée prévaut
        expect(ls.m.has('vaccinations_p1')).toBe(false);
    });

    it('JSON illisible : clé conservée, les autres migrent', async () => {
        const ls = memStorage({ vaccinations_bad: '{pas du json', vaccinations_p1: JSON.stringify([rec('p1', 'bcg')]) });
        const dk = disk();
        const r = await migrateLegacyVaccinations({ legacy: ls, current: [], save: dk.save, load: dk.load });
        expect(r.kept).toEqual(['vaccinations_bad']);
        expect(ls.m.has('vaccinations_bad')).toBe(true);
        expect(dk.d.data).toHaveLength(1);
    });

    it('rien à migrer : aucune écriture', async () => {
        const dk = disk();
        const r = await migrateLegacyVaccinations({ legacy: memStorage({ docease_language: 'fr' }), current: [], save: dk.save, load: dk.load });
        expect(r).toMatchObject({ migrated: 0, removedKeys: 0 });
        expect(dk.d.writes).toBe(0);
    });
});
