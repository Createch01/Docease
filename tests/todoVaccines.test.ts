import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Patient } from '../types';

let enabled = true;
let medecin = true;
vi.mock('../services/dataService', () => ({ dataService: { getDoctorInfo: () => ({ vaccinationEnabled: enabled }) } }));
vi.mock('../services/sessionService', () => ({ sessionService: { isMedecin: () => medecin } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { vaccineItems } from '../services/notificationsService';

const monthsAgo = (m: number) => new Date(Date.now() - m * 30.4375 * 86400000).toISOString().slice(0, 10);
const child = { id: 'c1', name: 'HAYAT Salma', age: 0, sex: 'F', type: 'Child', dateOfBirth: monthsAgo(8), vaccinationTracking: true } as Patient;
const adult = { id: 'a1', name: 'DUPONT Jean', age: 40, sex: 'M', type: 'Adult', dateOfBirth: '1986-01-01' } as Patient;

describe('alertes vaccins du panneau À faire', () => {
    beforeEach(() => { enabled = true; medecin = true; localStorage.clear(); });

    it('adulte sans calendrier vaccinal : aucune alerte', () => {
        expect(vaccineItems([adult])).toEqual([]);
    });

    it('enfant suivi : une seule carte groupée, jamais critique', () => {
        const items = vaccineItems([child, adult]);
        expect(items).toHaveLength(1);
        expect(items[0].title).toMatch(/^HAYAT Salma — \d+ vaccins en retard$/);
        expect(items[0].lines.length).toBe(items[0].count);
        expect(items[0].severity).toBe('todo');
    });

    it('module désactivé ou session assistante : aucune donnée vaccinale', () => {
        enabled = false;
        expect(vaccineItems([child])).toEqual([]);
        enabled = true; medecin = false;
        expect(vaccineItems([child])).toEqual([]);
    });
});
