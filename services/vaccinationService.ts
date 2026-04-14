import { Vaccine, VaccinationRecord, Patient } from "../types";

// Programme National d'Immunisation (Maroc) & Recommandations
const VACCINES: Vaccine[] = [
    { id: 'bcg', name: 'BCG', targetAgeMonths: 0, mandatory: true, diseasePrevented: 'Tuberculose' },
    { id: 'vpo0', name: 'VPO 0', targetAgeMonths: 0, mandatory: true, diseasePrevented: 'Poliomyélite' },
    { id: 'hb1', name: 'HB 1', targetAgeMonths: 0, mandatory: true, diseasePrevented: 'Hépatite B' },

    { id: 'dtcp1', name: 'DTC-Hib-HB 1', targetAgeMonths: 1.5, mandatory: true, diseasePrevented: 'Diphtérie, Tétanos, Coqueluche, Hépatite B, Haemophilus' },
    { id: 'vpo1', name: 'VPO 1', targetAgeMonths: 1.5, mandatory: true, diseasePrevented: 'Poliomyélite' },
    { id: 'rota1', name: 'Rotavirus 1', targetAgeMonths: 1.5, mandatory: false, diseasePrevented: 'Gastro-entérite' },
    { id: 'pneu1', name: 'Pneumo 1', targetAgeMonths: 1.5, mandatory: true, diseasePrevented: 'Pneumocoque' },

    { id: 'dtcp2', name: 'DTC-Hib-HB 2', targetAgeMonths: 2.5, mandatory: true, diseasePrevented: 'Diphtérie, Tétanos, Coqueluche, Hépatite B, Haemophilus' },
    { id: 'vpo2', name: 'VPO 2', targetAgeMonths: 2.5, mandatory: true, diseasePrevented: 'Poliomyélite' },
    { id: 'rota2', name: 'Rotavirus 2', targetAgeMonths: 2.5, mandatory: false, diseasePrevented: 'Gastro-entérite' },
    { id: 'pneu2', name: 'Pneumo 2', targetAgeMonths: 2.5, mandatory: true, diseasePrevented: 'Pneumocoque' },

    { id: 'dtcp3', name: 'DTC-Hib-HB 3', targetAgeMonths: 3.5, mandatory: true, diseasePrevented: 'Diphtérie, Tétanos, Coqueluche, Hépatite B, Haemophilus' },
    { id: 'vpo3', name: 'VPO 3', targetAgeMonths: 3.5, mandatory: true, diseasePrevented: 'Poliomyélite' },
    { id: 'rota3', name: 'Rotavirus 3', targetAgeMonths: 3.5, mandatory: false, diseasePrevented: 'Gastro-entérite' },

    { id: 'rougeole', name: 'Rougeole (RR 1)', targetAgeMonths: 9, mandatory: true, diseasePrevented: 'Rougeole, Rubéole' },

    { id: 'pneu3', name: 'Pneumo 3 (Rappel)', targetAgeMonths: 12, mandatory: true, diseasePrevented: 'Pneumocoque' }, // 12-18 mois

    { id: 'rr2', name: 'Rougeole-Rubéole (RR 2)', targetAgeMonths: 18, mandatory: true, diseasePrevented: 'Rougeole, Rubéole' },
    { id: 'dtcp_rap1', name: 'DTC Premier Rappel', targetAgeMonths: 18, mandatory: true, diseasePrevented: 'Diphtérie, Tétanos, Coqueluche' },
    { id: 'vpo_rap1', name: 'VPO Rappel 1', targetAgeMonths: 18, mandatory: true, diseasePrevented: 'Poliomyélite' },

    { id: 'dtcp_rap2', name: 'DTC Deuxième Rappel', targetAgeMonths: 60, mandatory: true, diseasePrevented: 'Diphtérie, Tétanos, Coqueluche' }, // 5 ans
    { id: 'vpo_rap2', name: 'VPO Rappel 2', targetAgeMonths: 60, mandatory: true, diseasePrevented: 'Poliomyélite' },
];

export const vaccinationService = {
    getSchedule: () => VACCINES,

    getPatientRecords: (patientId: string): VaccinationRecord[] => {
        const stored = localStorage.getItem(`vaccinations_${patientId}`);
        return stored ? JSON.parse(stored) : [];
    },

    saveRecord: (record: VaccinationRecord) => {
        const records = vaccinationService.getPatientRecords(record.patientId);
        const existingIndex = records.findIndex(r => r.vaccineId === record.vaccineId);

        if (existingIndex >= 0) {
            records[existingIndex] = record;
        } else {
            records.push(record);
        }

        localStorage.setItem(`vaccinations_${record.patientId}`, JSON.stringify(records));
        window.dispatchEvent(new Event('meddoc_data_update'));
    },

    deleteRecord: (patientId: string, vaccineId: string) => {
        const records = vaccinationService.getPatientRecords(patientId);
        const filtered = records.filter(r => r.vaccineId !== vaccineId);
        localStorage.setItem(`vaccinations_${patientId}`, JSON.stringify(filtered));
        window.dispatchEvent(new Event('meddoc_data_update'));
    },

    getVaccinationStatus: (patient: Patient) => {
        const records = vaccinationService.getPatientRecords(patient.id);
        const ageMonths = patient.age * 12; // Approximation simplifiée, idéalement utiliser date naissance précise

        const status = VACCINES.map(vaccine => {
            const record = records.find(r => r.vaccineId === vaccine.id);
            const isDue = !record && ageMonths >= vaccine.targetAgeMonths;
            const isOverdue = isDue && (ageMonths - vaccine.targetAgeMonths > 2); // 2 mois de retard = overdue

            return {
                vaccine,
                record,
                status: record ? 'DONE' : isOverdue ? 'OVERDUE' : isDue ? 'DUE' : 'UPCOMING'
            };
        });

        return status;
    }
};
