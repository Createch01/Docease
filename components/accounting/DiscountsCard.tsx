import React from 'react';
import { Tag } from 'lucide-react';
import type { Summary } from '../../services/accountingService';
import { formatCents } from '../../services/receiptService';
import { reasonLabel } from '../../services/tariffService';

// Carte « Remises & gratuités » de l'aperçu : facturé brut (au tarif), remises (total et par motif), facturé net,
// nombre de gratuités. Tout vient d'`accounting_summary` (Rust, centimes) : aucune addition ici. Les notes
// annulées sont exclues ; le journal des recettes n'est pas concerné (aucun encaissement).
const DiscountsCard: React.FC<{ summary: Summary | null }> = ({ summary }) => {
    if (!summary) return null;
    const reasons = summary.discountsByReason ?? [];
    return (
        <section className="bg-white rounded-xl border p-4 min-w-0" style={{ borderColor: 'var(--color-border)' }} aria-label="Remises et gratuités" data-testid="discounts-card">
            <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Tag size={18} /></div>
                <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text)' }}>Remises &amp; gratuités</h3>
            </div>
            <dl className="grid gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                <div><dt style={{ color: 'var(--color-text-subtle)' }}>Facturé brut (au tarif)</dt><dd data-testid="disc-gross" className="text-[18px] font-semibold">{formatCents(summary.grossInvoicedCents ?? 0)}</dd></div>
                <div><dt style={{ color: 'var(--color-text-subtle)' }}>Remises accordées</dt><dd data-testid="disc-total" className="text-[18px] font-semibold">− {formatCents(summary.discountsCents ?? 0)}</dd></div>
                <div><dt style={{ color: 'var(--color-text-subtle)' }}>Facturé net</dt><dd data-testid="disc-net" className="text-[18px] font-semibold">{formatCents(summary.invoicedCents)}</dd></div>
                <div><dt style={{ color: 'var(--color-text-subtle)' }}>Gratuités (notes à 0 DH)</dt><dd data-testid="disc-free" className="text-[18px] font-semibold">{summary.freeCount ?? 0}</dd></div>
            </dl>
            {reasons.length > 0 ? (
                <table className="w-full text-[13px] mt-4">
                    <thead>
                        <tr style={{ color: 'var(--color-text-subtle)' }}>
                            <th className="text-left font-medium py-1">Motif</th>
                            <th className="text-right font-medium py-1">Remises</th>
                            <th className="text-right font-medium py-1">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reasons.map(r => (
                            <tr key={r.reason} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                                <td className="py-1.5">{reasonLabel(r.reason)}</td>
                                <td className="py-1.5 text-right">{r.count}</td>
                                <td className="py-1.5 text-right">{formatCents(r.cents)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="text-[12px] mt-3" style={{ color: 'var(--color-text-subtle)' }}>Aucune remise sur la période.</p>
            )}
        </section>
    );
};

export default DiscountsCard;
