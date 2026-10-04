import { DoctorInfo } from '../types';
import { dataService } from './dataService';
import { sessionService } from './sessionService';
import { toastService } from './toastService';

export interface CabinetSetupState {
    hasName: boolean;
    hasInpe: boolean;
    hasContact: boolean;
    hasLogo: boolean;
    /** Nom ET INPE renseignés : condition pour accéder aux ordonnances et imprimer. */
    complete: boolean;
}

const filled = (v?: string): boolean => !!v && v.trim().length > 0;

export function cabinetSetupState(doctor: Partial<DoctorInfo>): CabinetSetupState {
    const hasName = filled(doctor.nameFr);
    const hasInpe = filled(doctor.inpe);
    return {
        hasName,
        hasInpe,
        hasContact: filled(doctor.addressFr) || filled(doctor.phone),
        hasLogo: filled(doctor.logoUrl),
        complete: hasName && hasInpe,
    };
}

export const SETUP_BLOCKED_MESSAGE =
    "Impression et export PDF bloqués : renseignez votre nom et votre INPE dans Paramètres › Mon profil.";

/** Faux (avec message) tant que le nom ou l'INPE du médecin est vide : impression et export PDF. */
export function canOutput(): boolean {
    if (sessionService.isMedecin() && !cabinetSetupState(dataService.getDoctorInfo()).complete) {
        toastService.error(SETUP_BLOCKED_MESSAGE);
        return false;
    }
    return true;
}

/**
 * Remplace window.print par une version gardée : tant que le nom ou l'INPE du médecin
 * est vide, rien ne s'imprime (toutes les impressions de l'application passent par
 * window.print). Réservé à la session médecin : l'assistante ne reçoit pas l'INPE.
 * Renvoie la fonction de retrait.
 */
export function installPrintGuard(): () => void {
    const original = window.print.bind(window);
    window.print = () => { if (canOutput()) original(); };
    return () => { window.print = original; };
}
