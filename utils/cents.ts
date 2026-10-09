/** « 1 250,50 » → 125050 (centimes) ; null si invalide. Saisie seulement : aucun calcul de montant. */
export const parseCents = (text: string): number | null => {
    const t = text.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
};

/** 25050 → « 250,50 » (centimes fournis par Rust). */
export const centsToText = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');
