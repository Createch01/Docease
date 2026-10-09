import { invoke } from '@tauri-apps/api/core';
import { bytesToBase64 } from './attachmentService';

// Grille tarifaire, remises et identité professionnelle : tout est décidé et calculé par Rust
// (src-tauri/src/tariff.rs, identity.rs). L'interface ne fixe aucun prix, n'applique aucune règle de remise et
// n'additionne aucun montant : elle recueille des choix et affiche ce que Rust renvoie (centimes entiers).

export type ActCategory = 'CONSULTATION' | 'EXPLORATION' | 'CONTROLE' | 'CERTIFICAT' | 'AUTRE';

export const ACT_CATEGORIES: { id: ActCategory; label: string }[] = [
    { id: 'CONSULTATION', label: 'Consultation' },
    { id: 'EXPLORATION', label: 'Exploration' },
    { id: 'CONTROLE', label: 'Contrôle' },
    { id: 'CERTIFICAT', label: 'Certificat / document' },
    { id: 'AUTRE', label: 'Autre' },
];

export const categoryLabel = (id: string): string => ACT_CATEGORIES.find(c => c.id === id)?.label ?? id;

export interface PricePoint { priceCents: number | null; from: string; by: string; at: string }

export interface Act {
    id: string;
    code: string;
    label: string;
    category: ActCategory;
    /** Centimes ; null = prix non renseigné (acte non utilisable). */
    priceCents: number | null;
    ngapLetter?: string | null;
    ngapCoefficient?: string | null;
    active: boolean;
    order: number;
    priceHistory: PricePoint[];
}

export interface TariffSettings {
    /** Plafond de remise de l'assistante, en % du brut (0 = aucune remise). */
    assistantDiscountCapPct: number;
    /** Délai du contrôle gratuit, en jours (0 = désactivé). */
    freeControlDays: number;
}

export interface TariffGrid { version: number; settings: TariffSettings; acts: Act[] }

export interface ActInput {
    id?: string;
    code: string;
    label: string;
    category: ActCategory;
    priceCents?: number | null;
    ngapLetter?: string | null;
    ngapCoefficient?: string | null;
    order?: number;
}

export type DiscountKind = 'PERCENT' | 'AMOUNT' | 'FREE';
export type DiscountReason = 'CONFRERE' | 'FAMILLE' | 'SOCIAL' | 'CONTROLE_GRATUIT' | 'GESTE' | 'AUTRE';

export const DISCOUNT_REASONS: { id: DiscountReason; label: string }[] = [
    { id: 'CONFRERE', label: 'Confrère' },
    { id: 'FAMILLE', label: 'Famille / proche' },
    { id: 'SOCIAL', label: 'Situation sociale' },
    { id: 'CONTROLE_GRATUIT', label: 'Contrôle gratuit' },
    { id: 'GESTE', label: 'Geste du cabinet' },
    { id: 'AUTRE', label: 'Autre' },
];

export const reasonLabel = (id: string): string => DISCOUNT_REASONS.find(r => r.id === id)?.label ?? id;

export interface DiscountInput {
    kind: DiscountKind;
    percent?: number;
    amountCents?: number;
    reason: string;
    reasonText?: string;
}

export interface LineInput {
    actId?: string;
    /** Ligne libre (médecin) seulement. */
    label?: string;
    quantity?: number;
    /** Ligne libre : prix saisi, en centimes. */
    unitPriceCents?: number;
    discount?: DiscountInput;
}

/** Remise telle que Rust l'a enregistrée (auteur et date posés par Rust). */
export interface StoredDiscount extends DiscountInput { cents: number; by: string; at: string; date: string }

export interface PreviewLine {
    actId?: string;
    code?: string;
    category?: string;
    label: string;
    quantity: number;
    unitPriceCents: number;
    tariffUnitCents?: number;
    grossCents: number;
    discount?: StoredDiscount;
    discountCents: number;
    netCents: number;
}

export interface Preview {
    lines: PreviewLine[];
    noteDiscount: StoredDiscount | null;
    grossCents: number;
    lineDiscountsCents: number;
    noteDiscountCents: number;
    discountCents: number;
    netCents: number;
    inWords: string;
}

export interface ControlOffer { noteId: string; noteNumber: string; date: string; days: number }

export interface StampView { id: string; mime: string; dataBase64: string }

const isTauri = (): boolean => typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

const call = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (!isTauri()) throw new Error("La grille tarifaire n'est disponible que dans l'application de bureau.");
    try {
        return await invoke<T>(cmd, args);
    } catch (e) {
        throw new Error(typeof e === 'string' ? e : (e as any)?.message || 'Opération impossible.');
    }
};

/** Acte utilisable : actif ET avec un prix (même règle que Rust, qui refuse le reste). */
export const isUsableAct = (a: Act): boolean => a.active && (a.priceCents ?? 0) > 0;

/** Aucun acte utilisable : bandeau « Complétez vos tarifs ». */
export const gridIsEmpty = (g: TariffGrid | null): boolean => !g || !g.acts.some(isUsableAct);

export const tariffService = {
    grid: () => call<TariffGrid>('tariff_grid'),
    saveAct: (act: ActInput) => call<TariffGrid>('tariff_act_save', { act }),
    setActive: (id: string, active: boolean) => call<TariffGrid>('tariff_act_set_active', { id, active }),
    saveSettings: (assistantDiscountCapPct: number, freeControlDays: number) =>
        call<TariffGrid>('tariff_settings_save', { assistantDiscountCapPct, freeControlDays }),
    freeControlOffer: (patientId: string) => call<ControlOffer | null>('tariff_free_control_offer', { patientId }),
    /** Lignes, remises et totaux calculés par Rust (aucune écriture), avec les droits de la session. */
    preview: (lines: LineInput[], noteDiscount: DiscountInput | null, patientId?: string) =>
        call<Preview>('tariff_preview', { lines, noteDiscount, patientId: patientId ?? null }),
    /** Cachet / signature (médecin) : image chiffrée, métadonnées supprimées par Rust. */
    setStamp: (bytes: Uint8Array) => call<string>('identity_stamp_set', { dataBase64: bytesToBase64(bytes) }),
    /** Cachet pour l'impression (toute session). */
    stamp: () => call<StampView | null>('identity_stamp'),
    /** Champs d'identité manquants (INPE, IF) pour le bandeau. */
    identityMissing: () => call<string[]>('identity_check'),
    migrate: () => call<number>('tariffs_migrate'),
};

/** Image du cachet en data: URL (affichage / impression). */
export const stampDataUrl = (s: StampView | null): string | null => (s ? `data:${s.mime};base64,${s.dataBase64}` : null);
