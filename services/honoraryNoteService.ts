import { invoke } from '@tauri-apps/api/core';
import { HonoraryNote } from '../types';
import { dataService } from './dataService';

// Annulation et contrôle de la numérotation des notes d'honoraires : tout est décidé par Rust
// (src-tauri/src/numbering.rs). L'interface n'attribue, ne modifie ni ne supprime jamais un numéro.

export interface NumberingCheck {
    /** Faux s'il existe un doublon, un numéro mal formé ou un trou (anomalies héritées, jamais corrigées). */
    clean: boolean;
    years: { year: number; last: number; count: number }[];
    duplicates: string[];
    malformed: string[];
    gaps: string[];
    gapsTotal: number;
    /** Notes sans numéro (héritées) : numérotées à leur prochaine écriture. */
    unnumbered: number;
    cancelled: number;
}

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("La numérotation n'est disponible que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new Error(typeof e === 'string' ? e : (e as any)?.message || 'Opération impossible.');
    }
};

export interface CancelPreview { noteNumber: string; netCents: number; receipts: string[]; blocked: string | null }

export const honoraryNoteService = {
    /**
     * Médecin : annule une note numérotée (motif obligatoire ; date et auteur posés par Rust). La note
     * garde son numéro, est figée et ne compte plus dans les montants.
     */
    cancel: async (id: string, reason: string): Promise<HonoraryNote> => {
        const note = await call<HonoraryNote>('honorary_note_cancel', { id, reason });
        await dataService.reloadHonoraryNotes();
        return note;
    },
    /**
     * Médecin : « Rembourser puis annuler » une note encore encaissée. Un seul motif, deux écritures posées par
     * Rust : remboursement du net encaissé (registre des encaissements) puis annulation de la note.
     */
    /** Aperçu de « Rembourser puis annuler » : net à rembourser, reçus concernés, mois clôturé éventuel (calculés par Rust). */
    cancelPreview: (id: string) => call<CancelPreview>('honorary_note_cancel_preview', { id }),
    refundAndCancel: async (id: string, reason: string, refundMode: string): Promise<HonoraryNote> => {
        const note = await call<HonoraryNote>('honorary_note_refund_and_cancel', { id, reason, refundMode });
        await dataService.reloadHonoraryNotes();
        return note;
    },
    /** Médecin : doublons, trous et numéros mal formés hérités (information seulement). */
    check: () => call<NumberingCheck>('invoice_numbering_check'),
};
