import { describe, it, expect } from 'vitest';
import type { Patient } from '../types';
import { searchPatientList } from '../components/ui/PatientPicker';

const p = (id: string, name: string, phone?: string): Patient => ({ id, name, phone, age: 40, sex: 'M', type: 'Adult' } as Patient);
const list = [p('1', 'BENALI Karim', '06 00 11 22 33'), p('2', 'ALAOUI Sara', '0611223344'), p('3', 'ÉL IDRISSI Omar', '+212 6 55 44 33 22')];

describe('recherche de patient', () => {
    it('par nom, sans accents ni casse', () => {
        expect(searchPatientList(list, 'el idrissi').map(x => x.id)).toEqual(['3']);
        expect(searchPatientList(list, 'ALAOUI').map(x => x.id)).toEqual(['2']);
    });
    it('par téléphone, quel que soit le format saisi', () => {
        expect(searchPatientList(list, '0600').map(x => x.id)).toEqual(['1']);
        expect(searchPatientList(list, '06 11 22').map(x => x.id)).toEqual(['2']);
        expect(searchPatientList(list, '65544').map(x => x.id)).toEqual(['3']);
    });
    it('rien en dessous de 3 chiffres ou sans saisie', () => {
        expect(searchPatientList(list, '06')).toEqual([]);
        expect(searchPatientList(list, '  ')).toEqual([]);
    });
});
