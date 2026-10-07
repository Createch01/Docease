import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, X } from 'lucide-react';
import { TodoItem, TodoSeverity } from '../services/notificationsService';

const TONE: Record<TodoSeverity, { bar: string; label: string; text: string }> = {
  critical: { bar: 'var(--color-danger)', label: 'Critique', text: 'var(--color-danger-700)' },
  todo: { bar: 'var(--color-warning-hover)', label: 'À faire', text: 'var(--color-warning-800)' },
  info: { bar: 'var(--color-border-strong)', label: 'Info', text: 'var(--color-text-muted)' },
};

const ACTION_LABEL: Record<TodoItem['action'], string> = {
  open_dossier: 'Ouvrir le dossier',
  open_appointments: 'Ouvrir les rendez-vous',
  open_reminders: 'Envoyer les rappels',
  backup_now: 'Sauvegarder maintenant',
  open_backup_settings: 'Ouvrir les réglages',
  open_billing: 'Ouvrir la comptabilité',
};

interface Props {
  items: TodoItem[];
  loading: boolean;
  onClose: () => void;
  onAction: (item: TodoItem) => Promise<void> | void;
  onSnooze: (item: TodoItem) => void;
  onDismiss: (item: TodoItem) => void;
}

const linkBtn = 'h-7 px-2 rounded-md text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-alt)]';

const Card: React.FC<{ item: TodoItem } & Omit<Props, 'items' | 'loading' | 'onClose'>> = ({ item, onAction, onSnooze, onDismiss }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tone = TONE[item.severity];
  const expandable = item.lines.length > 0;
  return (
    <li className="rounded-lg border bg-white" style={{ borderColor: 'var(--color-border)', borderLeft: `3px solid ${tone.bar}` }}>
      <div className="px-3 pt-2">
        <button type="button" disabled={!expandable} onClick={() => setOpen(o => !o)} aria-expanded={expandable ? open : undefined}
                className="w-full flex items-start gap-1.5 text-left disabled:cursor-default">
          {expandable && (open ? <ChevronDown size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0" />)}
          <span className="text-[13px] font-medium leading-snug" style={{ color: 'var(--color-text)' }}>{item.title}</span>
          <span className="ml-auto shrink-0 text-[11px]" style={{ color: tone.text }}>{tone.label}</span>
        </button>
        {open && (
          <ul className="mt-1 mb-1 pl-5 text-[12px] list-disc" style={{ color: 'var(--color-text-muted)' }}>
            {item.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-0.5">
        <button type="button" disabled={busy} className={linkBtn} style={{ color: 'var(--color-primary)' }}
                onClick={async () => { setBusy(true); try { await onAction(item); } finally { setBusy(false); } }}>
          {busy ? 'En cours…' : ACTION_LABEL[item.action]}
        </button>
        {item.dismissible && (
          <>
            <button type="button" className={`${linkBtn} ml-auto`} style={{ color: 'var(--color-text-muted)' }} onClick={() => onSnooze(item)}>Reporter à demain</button>
            <button type="button" className={linkBtn} style={{ color: 'var(--color-text-muted)' }} onClick={() => onDismiss(item)}>Ignorer</button>
          </>
        )}
      </div>
    </li>
  );
};

/** Panneau latéral « À faire » ouvert depuis la cloche de l'en-tête. */
const TodoDrawer: React.FC<Props> = ({ items, loading, onClose, ...actions }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
         style={{ background: 'rgba(15, 23, 42, 0.25)' }}>
      <aside ref={ref} tabIndex={-1} role="dialog" aria-label="À faire"
             className="absolute right-0 top-0 h-full w-full max-w-[420px] flex flex-col outline-none"
             style={{ background: 'var(--color-surface-alt)', borderLeft: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}>
        <header className="flex items-center gap-2 px-4 h-14 shrink-0 bg-white" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="text-[16px] font-semibold" style={{ color: 'var(--color-text)' }}>À faire</h2>
          {items.length > 0 && <span className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>{items.length} action{items.length > 1 ? 's' : ''}</span>}
          <button type="button" onClick={onClose} aria-label="Fermer" className="ml-auto w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface-alt)]">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
              <CheckCircle2 size={28} />
              <p className="text-[13px]">{loading ? 'Chargement…' : 'Rien à faire pour le moment.'}</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map(it => <Card key={it.id} item={it} {...actions} />)}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
};

export default TodoDrawer;
