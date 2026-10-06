import { Vaccine, VaccinationRecord, Patient } from "../types";
import { dataService } from "./dataService";

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

/**
 * Fenêtres d'alerte « en retard » (en mois d'âge).
 *
 * Source visée : calendrier du Programme National d'Immunisation (PNI), Ministère de la
 * Santé et de la Protection sociale du Maroc. Consultation tentée le 2026-10-04 : le site
 * officiel et les guides PNI n'étaient pas accessibles ; seules des sources secondaires
 * ont été lues (HB 1 « pendant le premier mois si non faite dans les 24 h »). Les valeurs
 * ci-dessous marquées `verified: false` sont des REPLIS PRUDENTS À VALIDER par le médecin
 * ou à remplacer par la valeur officielle ; elles ne doivent pas être lues comme le PNI.
 *  - Doses de naissance (VPO 0, HB 1) : pas de rattrapage après la fenêtre ; la série continue.
 *  - BCG : limite d'âge de rattrapage non trouvée -> repli 6 ans.
 *  - Rotavirus (rota1-3) : limite non trouvée -> repli 6 ans, explicite (non exclu des alertes).
 *  - Autres vaccins : limite de rattrapage non trouvée -> repli 6 ans.
 */
export const CATCHUP_WINDOWS: Record<string, { untilMonths: number; verified: boolean }> = {
    vpo0: { untilMonths: 1, verified: false },
    hb1: { untilMonths: 1, verified: false },
    bcg: { untilMonths: 72, verified: false },
    rota1: { untilMonths: 72, verified: false },
    rota2: { untilMonths: 72, verified: false },
    rota3: { untilMonths: 72, verified: false },
};
export const DEFAULT_CATCHUP = { untilMonths: 72, verified: false };

/**
 * Les âges cibles de `VACCINES` (1,5 / 2,5 / 3,5 mois, rotavirus, rappels…) n'ont PAS été
 * confrontés au calendrier officiel du PNI (carnet de santé de l'enfant) : à passer à `true`
 * seulement après cette vérification. Le rotavirus fait partie du PNI selon le médecin : il
 * n'est donc jamais exclu des alertes, et sa limite de rattrapage reste un repli non vérifié.
 */
export const CALENDAR_VERIFIED = false;

/** Vrai seulement si le calendrier ET toutes les fenêtres de rattrapage sont vérifiés. */
export const isCalendarVerified = (): boolean =>
    CALENDAR_VERIFIED && DEFAULT_CATCHUP.verified && Object.values(CATCHUP_WINDOWS).every(w => w.verified);

export const CALENDAR_UNVERIFIED_MESSAGE = 'Calendrier en cours de vérification avec le PNI officiel — vérifiez avant de vous y fier.';
/** Délai de grâce avant de parler de retard (conserve l'ancien comportement). */
const OVERDUE_GRACE_MONTHS = 2;
const MONTH_MS = 30.4375 * 86400000;

export type VaccineStatus = 'DONE' | 'OVERDUE' | 'DUE' | 'UPCOMING' | 'MISSED';

const catchupOf = (id: string) => CATCHUP_WINDOWS[id] ?? DEFAULT_CATCHUP;

export const vaccinationService = {
    getSchedule: () => VACCINES,

    /** Carnet d'un patient, lu dans le stockage chiffré (médecin seulement ; vide pour l'assistante). */
    getPatientRecords: (patientId: string): VaccinationRecord[] =>
        dataService.getVaccinationRecords().filter(r => r.patientId === patientId),

    saveRecord: (record: VaccinationRecord): Promise<void> => {
        const all = dataService.getVaccinationRecords();
        const idx = all.findIndex(r => r.patientId === record.patientId && r.vaccineId === record.vaccineId);
        const next = idx >= 0 ? all.map((r, i) => (i === idx ? record : r)) : [...all, record];
        return dataService.saveVaccinationRecords(next);
    },

    deleteRecord: (patientId: string, vaccineId: string): Promise<void> =>
        dataService.saveVaccinationRecords(dataService.getVaccinationRecords().filter(r => !(r.patientId === patientId && r.vaccineId === vaccineId))),

    /** Module activé dans Paramètres (désactivé par défaut, sans déduction depuis la spécialité). */
    isModuleEnabled: (): boolean => dataService.getDoctorInfo()?.vaccinationEnabled === true,

    /** Suivi activé explicitement sur le dossier, ou au moins un enregistrement. */
    isTracked: (patient: Patient): boolean =>
        patient.vaccinationTracking === true || vaccinationService.getPatientRecords(patient.id).length > 0,

    /** Âge en mois depuis la date de naissance ; null si absente ou invalide. Jamais `age × 12`. */
    ageInMonths: (patient: Pick<Patient, 'dateOfBirth'>, now: Date = new Date()): number | null => {
        if (!patient.dateOfBirth) return null;
        const born = new Date(patient.dateOfBirth);
        if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) return null;
        return (now.getTime() - born.getTime()) / MONTH_MS;
    },

    /** Alertes autorisées : module actif + suivi du patient + date de naissance connue. */
    isActionable: (patient: Patient): boolean =>
        vaccinationService.isModuleEnabled() && vaccinationService.isTracked(patient) && vaccinationService.ageInMonths(patient) !== null,

    /**
     * Statut de chaque vaccin. `gated` (défaut) : liste vide si les alertes ne sont pas autorisées
     * (module désactivé, patient non suivi, date de naissance absente). Sans date de naissance,
     * la liste est vide dans tous les cas : aucun calcul n'est fait depuis l'âge en années.
     */
    getVaccinationStatus: (patient: Patient, opts: { gated?: boolean; now?: Date } = {}) => {
        const { gated = true, now } = opts;
        const ageMonths = vaccinationService.ageInMonths(patient, now);
        if (ageMonths === null) return [];
        if (gated && !(vaccinationService.isModuleEnabled() && vaccinationService.isTracked(patient))) return [];
        const records = vaccinationService.getPatientRecords(patient.id);

        return VACCINES.map(vaccine => {
            const record = records.find(r => r.vaccineId === vaccine.id);
            const window = catchupOf(vaccine.id);
            let status: VaccineStatus;
            if (record) status = 'DONE';
            else if (ageMonths < vaccine.targetAgeMonths) status = 'UPCOMING';
            else if (ageMonths > window.untilMonths) status = 'MISSED'; // fenêtre close : aucune alerte
            else if (ageMonths - vaccine.targetAgeMonths > OVERDUE_GRACE_MONTHS && window.untilMonths > OVERDUE_GRACE_MONTHS + vaccine.targetAgeMonths) status = 'OVERDUE';
            else status = 'DUE';
            return { vaccine, record, status };
        });
    },
};
