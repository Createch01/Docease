/**
 * Onglet « Pièces jointes » du dossier patient (médecin seulement) : photos d'ECG, analyses,
 * imagerie, courriers… (PDF, JPG, PNG, 20 Mo au plus). Fichiers chiffrés par Rust ; ouverture en
 * mémoire uniquement (voir AttachmentViewer).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Image as ImageIcon, Link2, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Patient } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import {
    AttachmentCategory, AttachmentLinkType, AttachmentMeta, AttachmentsStatus, CATEGORIES, attachmentService, categoryLabel, checkFile, defaultTitle, formatSize, heavyWarning,
} from '../../services/attachmentService';
import { makeThumb } from '../../services/attachmentThumb';
import { todayLocal } from '../../utils/localDate';
import ConfirmModal from '../ConfirmModal';
import AttachmentViewer from './AttachmentViewer';

export const ATTACHMENTS_CHANGED_EVENT = 'docease_attachments_changed';

const field = 'w-full h-10 px-3 rounded-md border text-[14px] outline-none bg-white';
const fieldStyle = { borderColor: 'var(--color-border)', color: 'var(--color-text)' } as React.CSSProperties;
const label = 'block text-[12px] font-medium mb-1';
const labelStyle = { color: 'var(--color-text-muted)' } as React.CSSProperties;

const frDate = (d: string) => d.split('-').reverse().join('/');

interface Draft {
    key: string;
    file: File;
    bytes: Uint8Array;
    mime: AttachmentMeta['mime'];
    thumb?: string;
    title: string;
    category: AttachmentCategory;
    examDate: string;
    link: string; // '' | 'consultation:<id>' | 'result:<id>'
}

const linkParts = (link: string): { linkedType?: AttachmentLinkType; linkedId?: string } => {
    const [t, ...rest] = link.split(':');
    return t === 'consultation' || t === 'result' ? { linkedType: t, linkedId: rest.join(':') } : {};
};

const LinkSelect: React.FC<{ patientId: string; value: string; onChange: (v: string) => void }> = ({ patientId, value, onChange }) => {
    const consultations = dataService.getConsultations(patientId).slice().sort((a, b) => b.date.localeCompare(a.date));
    const results = dataService.getMedicalResults(patientId).slice().sort((a, b) => b.date.localeCompare(a.date));
    return (
        <select className={field} style={fieldStyle} value={value} onChange={e => onChange(e.target.value)} aria-label="Lien avec une consultation ou un résultat">
            <option value="">Aucun lien</option>
            {consultations.length > 0 && <optgroup label="Consultations">{consultations.map(c => <option key={c.id} value={`consultation:${c.id}`}>{frDate(c.date.slice(0, 10))} — {c.motif || 'Consultation'}</option>)}</optgroup>}
            {results.length > 0 && <optgroup label="Résultats">{results.map(r => <option key={r.id} value={`result:${r.id}`}>{frDate(r.date.slice(0, 10))} — {r.title}</option>)}</optgroup>}
        </select>
    );
};

const Thumb: React.FC<{ meta: AttachmentMeta }> = ({ meta }) => (
    <div className="w-full aspect-[4/3] rounded-lg overflow-hidden flex items-center justify-center" style={{ background: 'var(--color-surface-alt)' }}>
        {meta.thumb
            ? <img src={meta.thumb} alt="" className="w-full h-full object-cover" draggable={false} />
            : meta.mime === 'application/pdf' ? <FileText size={36} style={{ color: 'var(--color-text-faint)' }} /> : <ImageIcon size={36} style={{ color: 'var(--color-text-faint)' }} />}
    </div>
);

const AttachmentsTab: React.FC<{ patient: Patient }> = ({ patient }) => {
    const [items, setItems] = useState<AttachmentMeta[] | null>(null);
    const [status, setStatus] = useState<AttachmentsStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<AttachmentCategory | 'all'>('all');
    const [viewing, setViewing] = useState<AttachmentMeta | null>(null);
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<AttachmentMeta | null>(null);
    const [deleting, setDeleting] = useState<AttachmentMeta | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const reload = useCallback(async () => {
        try {
            const [list, st] = await Promise.all([attachmentService.list(patient.id), attachmentService.status().catch(() => null)]);
            setItems(list);
            setStatus(st);
            setError(null);
        } catch (e) {
            setError(typeof e === 'string' ? e : "Les pièces jointes n'ont pas pu être chargées.");
            setItems([]);
        }
    }, [patient.id]);

    useEffect(() => { setItems(null); void reload(); }, [reload]);

    const changed = async () => { await reload(); window.dispatchEvent(new Event(ATTACHMENTS_CHANGED_EVENT)); };

    const visible = useMemo(
        () => (items ?? []).filter(i => filter === 'all' || i.category === filter).sort((a, b) => b.examDate.localeCompare(a.examDate) || b.createdAt.localeCompare(a.createdAt)),
        [items, filter],
    );

    // ─── Ajout ───
    const addFiles = async (files: FileList | File[]) => {
        const next: Draft[] = [];
        for (const file of Array.from(files)) {
            const check = checkFile(file);
            if (check.ok === false) { toastService.error(`${file.name} : ${check.message}`); continue; }
            const bytes = new Uint8Array(await file.arrayBuffer());
            next.push({
                key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
                file, bytes, mime: check.mime,
                title: defaultTitle(file.name), category: 'autre', examDate: todayLocal(), link: '',
            });
        }
        if (next.length === 0) return;
        setDrafts(d => [...d, ...next]);
        // Vignettes en arrière-plan (images : canvas ; PDF : première page via pdf.js).
        for (const d of next) {
            void makeThumb(d.bytes, d.mime).then(thumb => setDrafts(cur => cur.map(x => (x.key === d.key ? { ...x, thumb } : x))));
        }
    };

    const patchDraft = (key: string, p: Partial<Draft>) => setDrafts(d => d.map(x => (x.key === key ? { ...x, ...p } : x)));

    const saveDrafts = async () => {
        if (saving) return;
        if (drafts.some(d => !d.title.trim())) { toastService.error('Chaque pièce doit avoir un titre.'); return; }
        setSaving(true);
        const remaining: Draft[] = [];
        let ok = 0;
        for (const d of drafts) {
            try {
                await attachmentService.add({ patientId: patient.id, title: d.title.trim(), category: d.category, examDate: d.examDate, thumb: d.thumb, ...linkParts(d.link) }, d.bytes);
                d.bytes.fill(0);
                ok++;
            } catch (e) {
                remaining.push(d);
                toastService.error(`${d.file.name} : ${typeof e === 'string' ? e : "enregistrement impossible."}`);
            }
        }
        setDrafts(remaining);
        setSaving(false);
        if (ok > 0) { toastService.success(ok > 1 ? `${ok} pièces jointes ajoutées` : 'Pièce jointe ajoutée'); await changed(); }
    };

    const closeDrafts = () => { drafts.forEach(d => d.bytes.fill(0)); setDrafts([]); };

    // ─── Modification / suppression ───
    const saveEdit = async (m: AttachmentMeta, p: { title: string; category: AttachmentCategory; examDate: string; link: string }) => {
        try {
            const link = linkParts(p.link);
            await attachmentService.update(m.id, { title: p.title.trim(), category: p.category, examDate: p.examDate, ...(link.linkedType ? link : { clearLink: true }) });
            setEditing(null);
            toastService.success('Pièce jointe modifiée');
            await changed();
        } catch (e) {
            toastService.error(typeof e === 'string' ? e : 'Modification impossible.');
        }
    };

    const confirmDelete = async () => {
        const m = deleting;
        if (!m) return;
        setDeleting(null);
        try {
            await attachmentService.remove(m.id);
            toastService.success('Pièce jointe supprimée');
            await changed();
        } catch (e) {
            toastService.error(typeof e === 'string' ? e : 'Suppression impossible.');
        }
    };

    const warning = status ? heavyWarning(status) : null;
    const missing = (items ?? []).filter(i => i.missing).length;
    const linkText = (m: AttachmentMeta) => {
        if (!m.linkedType || !m.linkedId) return null;
        if (m.linkedType === 'consultation') { const c = dataService.getConsultations(patient.id).find(x => x.id === m.linkedId); return c ? `Consultation du ${frDate(c.date.slice(0, 10))}` : 'Consultation'; }
        const r = dataService.getMedicalResults(patient.id).find(x => x.id === m.linkedId);
        return r ? `Résultat : ${r.title}` : 'Résultat';
    };

    return (
        <div className="space-y-4" onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={e => e.currentTarget === e.target && setDragOver(false)}
             onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}>
            <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}><Paperclip size={16} /> Pièces jointes {items && <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}>({items.length})</span>}</h3>
                <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label="Filtrer par catégorie">
                    {[{ id: 'all' as const, label: 'Toutes' }, ...CATEGORIES].map(c => (
                        <button key={c.id} type="button" role="radio" aria-checked={filter === c.id} onClick={() => setFilter(c.id)}
                                className="h-7 px-2.5 rounded-full border text-[12px] font-medium"
                                style={filter === c.id ? { background: 'var(--color-primary-50)', borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : { borderColor: 'var(--color-border)', color: 'var(--color-text-muted)', background: 'white' }}>
                            {c.label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto h-9 px-3.5 rounded-lg text-[13px] font-medium text-white flex items-center gap-1.5" style={{ background: 'var(--color-primary)' }}>
                    <Plus size={15} /> Ajouter
                </button>
                <input ref={inputRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                       onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {warning && <p role="alert" className="flex items-start gap-2 p-3 rounded-lg text-[13px]" style={{ background: 'var(--color-warning-50)', color: 'var(--color-warning-800)' }}><AlertTriangle size={15} className="mt-0.5 shrink-0" />{warning}</p>}
            {missing > 0 && <p className="text-[12px]" style={{ color: 'var(--color-warning-800)' }}>{missing} fichier{missing > 1 ? 's' : ''} manquant{missing > 1 ? 's' : ''} (absent{missing > 1 ? 's' : ''} de la sauvegarde restaurée ou supprimé{missing > 1 ? 's' : ''} du disque).</p>}
            {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger)' }}>{error}</p>}

            {items === null ? (
                <p className="py-10 text-center text-[13px]" style={{ color: 'var(--color-text-muted)' }}>Chargement…</p>
            ) : visible.length === 0 ? (
                <button type="button" onClick={() => inputRef.current?.click()} className="w-full py-12 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 text-[13px]"
                        style={{ borderColor: dragOver ? 'var(--color-primary)' : 'var(--color-border)', color: 'var(--color-text-muted)', background: dragOver ? 'var(--color-primary-50)' : 'transparent' }}>
                    <Upload size={24} />
                    {items.length === 0 ? 'Glissez des fichiers ici, ou cliquez pour ajouter (PDF, JPG, PNG — 20 Mo au plus).' : 'Aucune pièce dans cette catégorie.'}
                </button>
            ) : (
                <ul className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                    {visible.map(m => (
                        <li key={m.id} className="rounded-xl border bg-white p-2.5 flex flex-col gap-2" style={{ borderColor: dragOver ? 'var(--color-primary)' : 'var(--color-border)' }}>
                            <button type="button" disabled={m.missing} onClick={() => setViewing(m)} className="text-left disabled:cursor-not-allowed" aria-label={`Ouvrir ${m.title}`}>
                                <Thumb meta={m} />
                            </button>
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--color-text)' }} title={m.title}>{m.title}</div>
                                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{categoryLabel(m.category)} · {frDate(m.examDate)} · {formatSize(m.size)}</div>
                                {linkText(m) && <div className="text-[11px] mt-0.5 flex items-center gap-1 truncate" style={{ color: 'var(--color-text-subtle)' }}><Link2 size={11} />{linkText(m)}</div>}
                                {m.missing && <div className="text-[11px] font-semibold mt-1" style={{ color: 'var(--color-danger)' }}>Fichier manquant</div>}
                            </div>
                            <div className="flex gap-1 mt-auto">
                                <button type="button" onClick={() => setEditing(m)} className="h-7 px-2 rounded-md text-[12px] flex items-center gap-1 hover:bg-[var(--color-surface-alt)]" style={{ color: 'var(--color-text-muted)' }}><Pencil size={12} /> Modifier</button>
                                <button type="button" onClick={() => setDeleting(m)} className="h-7 px-2 rounded-md text-[12px] flex items-center gap-1 ml-auto hover:bg-[var(--color-danger-50)]" style={{ color: 'var(--color-danger)' }} aria-label={`Supprimer ${m.title}`}><Trash2 size={12} /></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {viewing && <AttachmentViewer meta={viewing} onClose={() => setViewing(null)} />}

            {drafts.length > 0 && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
                    <div role="dialog" aria-modal="true" aria-label="Ajouter des pièces jointes" className="w-full max-w-[560px] max-h-[90vh] flex flex-col rounded-xl border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                        <div className="flex items-center justify-between px-6 pt-5 pb-3">
                            <h3 className="text-[17px] font-semibold" style={{ color: 'var(--color-text)' }}>Ajouter {drafts.length > 1 ? `${drafts.length} pièces jointes` : 'une pièce jointe'}</h3>
                            <button type="button" onClick={closeDrafts} disabled={saving} aria-label="Annuler" className="p-1.5 rounded-md hover:bg-[var(--color-surface-alt)]"><X size={18} /></button>
                        </div>
                        <div className="px-6 pb-3 overflow-y-auto space-y-4">
                            {drafts.map(d => (
                                <div key={d.key} className="p-3 rounded-lg border space-y-2.5" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-14 h-14 rounded-md overflow-hidden flex items-center justify-center bg-white shrink-0">
                                            {d.thumb ? <img src={d.thumb} alt="" className="w-full h-full object-cover" /> : d.mime === 'application/pdf' ? <FileText size={22} /> : <ImageIcon size={22} />}
                                        </div>
                                        <div className="min-w-0 text-[12px]" style={{ color: 'var(--color-text-muted)' }}><div className="truncate font-medium" style={{ color: 'var(--color-text)' }}>{d.file.name}</div>{formatSize(d.file.size)}</div>
                                    </div>
                                    <div><label className={label} style={labelStyle}>Titre *</label>
                                        <input className={field} style={fieldStyle} value={d.title} maxLength={120} onChange={e => patchDraft(d.key, { title: e.target.value })} /></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><label className={label} style={labelStyle}>Catégorie</label>
                                            <select className={field} style={fieldStyle} value={d.category} onChange={e => patchDraft(d.key, { category: e.target.value as AttachmentCategory })}>
                                                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                                        <div><label className={label} style={labelStyle}>Date de l'examen</label>
                                            <input type="date" max={todayLocal()} className={field} style={fieldStyle} value={d.examDate} onChange={e => patchDraft(d.key, { examDate: e.target.value })} /></div>
                                    </div>
                                    <div><label className={label} style={labelStyle}>Lier à (facultatif)</label>
                                        <LinkSelect patientId={patient.id} value={d.link} onChange={v => patchDraft(d.key, { link: v })} /></div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                            <button type="button" onClick={closeDrafts} disabled={saving} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white" style={{ borderColor: 'var(--color-border)' }}>Annuler</button>
                            <button type="button" onClick={() => void saveDrafts()} disabled={saving} className="h-10 px-5 rounded-lg text-[13px] font-medium text-white disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                        </div>
                    </div>
                </div>
            )}

            {editing && <EditDialog meta={editing} patientId={patient.id} onClose={() => setEditing(null)} onSave={p => saveEdit(editing, p)} />}

            <ConfirmModal isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void confirmDelete()} type="danger" confirmLabel="Supprimer définitivement"
                          title="Supprimer cette pièce jointe ?"
                          message={`« ${deleting?.title ?? ''} » sera supprimée du dossier. Les anciennes sauvegardes en conservent une copie jusqu'à leur rotation. Cette suppression est inscrite au journal d'accès.`} />
        </div>
    );
};

const EditDialog: React.FC<{ meta: AttachmentMeta; patientId: string; onClose: () => void; onSave: (p: { title: string; category: AttachmentCategory; examDate: string; link: string }) => void }> = ({ meta, patientId, onClose, onSave }) => {
    const [title, setTitle] = useState(meta.title);
    const [category, setCategory] = useState(meta.category);
    const [examDate, setExamDate] = useState(meta.examDate);
    const [link, setLink] = useState(meta.linkedType && meta.linkedId ? `${meta.linkedType}:${meta.linkedId}` : '');
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <form role="dialog" aria-modal="true" aria-label="Modifier la pièce jointe" onSubmit={e => { e.preventDefault(); if (title.trim()) onSave({ title, category, examDate, link }); }}
                  className="w-full max-w-[460px] rounded-xl border p-6 space-y-3" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', boxShadow: 'var(--shadow-premium)' }}>
                <h3 className="text-[17px] font-semibold" style={{ color: 'var(--color-text)' }}>Modifier la pièce jointe</h3>
                <div><label className={label} style={labelStyle}>Titre *</label><input autoFocus className={field} style={fieldStyle} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                    <div><label className={label} style={labelStyle}>Catégorie</label>
                        <select className={field} style={fieldStyle} value={category} onChange={e => setCategory(e.target.value as AttachmentCategory)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                    <div><label className={label} style={labelStyle}>Date de l'examen</label><input type="date" max={todayLocal()} className={field} style={fieldStyle} value={examDate} onChange={e => setExamDate(e.target.value)} /></div>
                </div>
                <div><label className={label} style={labelStyle}>Lié à</label><LinkSelect patientId={patientId} value={link} onChange={setLink} /></div>
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white" style={{ borderColor: 'var(--color-border)' }}>Annuler</button>
                    <button type="submit" disabled={!title.trim()} className="h-10 px-5 rounded-lg text-[13px] font-medium text-white disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>Enregistrer</button>
                </div>
            </form>
        </div>
    );
};

export default AttachmentsTab;
