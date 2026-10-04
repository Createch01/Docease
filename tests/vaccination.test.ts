import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Patient } from '../types';

let enabled = true;
vi.mock('../services/dataService', () => ({ dataService: { getDoctorInfo: () => ({ vaccinationEnabled: enabled }) } }));
import { vaccinationService } from '../services/vaccinationService';

const NOW = new Date('2026-10-04T12:00:00Z');
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 30.4375 * 86400000).toISOString().slice(0, 10);
const patient = (over: Partial<Patient> = {}): Patient => ({ id: 'p1', name: 'X', age: 30, sex: 'F', type: 'Adult', ...over } as Patient);
const overdue = (p: Patient) => vaccinationService.getVaccinationStatus(p, { now: NOW }).filter(s => s.status === 'OVERDUE').map(s => s.vaccine.id);

describe('suivi vaccinal', () => {
    beforeEach(() => { enabled = true; localStorage.clear(); });

    it("adulte sans suivi : aucune alerte, même avec date de naissance", () => {
        expect(overdue(patient({ dateOfBirth: '1990-01-01' }))).toEqual([]);
    });

    it('module désactivé : aucune alerte même pour un enfant suivi', () => {
        enabled = false;
        expect(overdue(patient({ dateOfBirth: monthsAgo(8), vaccinationTracking: true }))).toEqual([]);
    });

    it("sans date de naissance : aucune alerte, l'âge en années n'est jamais utilisé", () => {
        expect(overdue(patient({ age: 1, vaccinationTracking: true }))).toEqual([]);
    });

    it('enfant suivi de 8 mois : doses de naissance hors fenêtre (pas en retard), série de 1,5 à 3,5 mois en retard', () => {
        const ids = overdue(patient({ dateOfBirth: monthsAgo(8), vaccinationTracking: true }));
        expect(ids).toContain('bcg');
        expect(ids).not.toContain('vpo0');
        expect(ids).not.toContain('hb1');
        expect(ids).toContain('dtcp1');
        expect(ids).not.toContain('rougeole');
        expect(ids).not.toContain('rota1'); // vaccin non obligatoire : jamais en retard
    });

    it('au-delà de la limite de rattrapage (6 ans) : plus aucune alerte', () => {
        expect(overdue(patient({ dateOfBirth: monthsAgo(80), vaccinationTracking: true }))).toEqual([]);
    });

    it('un enregistrement suffit à activer le suivi', () => {
        localStorage.setItem('vaccinations_p1', JSON.stringify([{ id: 'r', patientId: 'p1', vaccineId: 'bcg', dateAdministered: '2026-01-01', status: 'DONE' }]));
        const ids = overdue(patient({ dateOfBirth: monthsAgo(8) }));
        expect(ids).not.toContain('bcg');
        expect(ids).toContain('dtcp1');
    });
});
