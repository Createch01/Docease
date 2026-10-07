/**
 * Pastille « 📎 n » : pièces jointes liées à une consultation ou à un résultat. Médecin seulement
 * (Rust refuse de toute façon les commandes aux autres rôles). Un clic ouvre la liste, puis la visionneuse.
 */
import React, { useEffect, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { AttachmentLinkType, AttachmentMeta, attachmentService, categoryLabel } from '../../services/attachmentService';
import { sessionService } from '../../services/sessionService';
import AttachmentViewer from './AttachmentViewer';

const CHANGED = 'docease_attachments_changed';

const AttachmentChip: React.FC<{ patientId: string; linkedType: AttachmentLinkType; linkedId: string; excludeIds?: string[] }> = ({ patientId, linkedType, linkedId, excludeIds = [] }) => {
    const [items, setItems] = useState<AttachmentMeta[]>([]);
    const [open, setOpen] = useState(false);
    const [viewing, setViewing] = useState<AttachmentMeta | null>(null);
    const medecin = sessionService.isMedecin();

    useEffect(() => {
        if (!medecin || typeof (window as any).__TAURI_INTERNALS__ === 'undefined') return;
        let alive = true;
        const load = () => attachmentService.list(patientId).then(all => alive && setItems(all.filter(a => a.linkedType === linkedType && a.linkedId === linkedId && !excludeIds.includes(a.id)))).catch(() => undefined);
        void load();
        window.addEventListener(CHANGED, load);
        return () => { alive = false; window.removeEventListener(CHANGED, load); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientId, linkedType, linkedId, medecin, excludeIds.join(',')]);

    if (!medecin || items.length === 0) return null;
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} title="Pièces jointes liées"
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100">
                <Paperclip size={11} /> {items.length}
            </button>
            {open && !viewing && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
                    <div role="dialog" aria-modal="true" aria-label="Pièces jointes liées" className="w-full max-w-[420px] rounded-xl border p-5 space-y-3" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>Pièces jointes liées</h3>
                            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="p-1.5 rounded-md hover:bg-[var(--color-surface-alt)]"><X size={16} /></button>
                        </div>
                        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                            {items.map(a => (
                                <li key={a.id} className="py-2">
                                    <button type="button" disabled={a.missing} onClick={() => setViewing(a)} className="w-full text-left disabled:opacity-50">
                                        <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--color-text)' }}>{a.title}</span>
                                        <span className="block text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{categoryLabel(a.category)} · {a.examDate.split('-').reverse().join('/')}{a.missing ? ' · fichier manquant' : ''}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
            {viewing && <AttachmentViewer meta={viewing} onClose={() => setViewing(null)} />}
        </>
    );
};

export default AttachmentChip;
