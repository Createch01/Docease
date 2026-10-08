import React, { useEffect, useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { ExpenseCategory, expenseService } from '../../services/expenseService';
import { SettingsCard } from './SettingsUI';

/** Médecin : catégories de dépenses. Une catégorie ne se supprime jamais (des dépenses peuvent l'utiliser) : elle se désactive. */
const ExpenseCategoriesCard: React.FC = () => {
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { expenseService.categories().then(setCats).catch(e => setError(e instanceof Error ? e.message : 'Lecture impossible.')); }, []);

  const run = async (fn: () => Promise<ExpenseCategory[]>) => {
    setBusy(true);
    setError(null);
    try { setCats(await fn()); setName(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Opération impossible.'); }
    finally { setBusy(false); }
  };

  return (
    <SettingsCard
      title="Catégories de dépenses"
      icon={<Tags size={16} />}
      description="Liste proposée à la saisie d'une dépense. Une catégorie déjà utilisée ne se supprime pas : désactivez-la, elle reste lisible sur les anciennes dépenses. « Achat de matériel (à amortir) » est listée mais exclue du résultat."
    >
      <ul className="text-[13px] grid grid-cols-1 md:grid-cols-2 gap-x-6" style={{ color: 'var(--color-text)' }}>
        {cats.map(c => (
          <li key={c.name} className="flex items-center justify-between py-1">
            <span style={c.active ? undefined : { color: 'var(--color-text-subtle)', textDecoration: 'line-through' }}>{c.name}{c.amortizable ? ' · à amortir' : ''}</span>
            <button type="button" disabled={busy} className="text-[12px] underline disabled:opacity-40" onClick={() => run(() => expenseService.setCategoryActive(c.name, !c.active))}>
              {c.active ? 'Désactiver' : 'Réactiver'}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 items-center">
        <input className="h-10 px-3 rounded-lg border text-[14px] outline-none bg-white w-64" style={{ borderColor: 'var(--color-border)' }} maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Nouvelle catégorie" />
        <button type="button" disabled={busy || name.trim().length === 0} onClick={() => run(() => expenseService.addCategory(name))}
          className="h-10 px-4 rounded-lg border text-[13px] font-medium bg-white disabled:opacity-40 flex items-center gap-2" style={{ borderColor: 'var(--color-border)' }}>
          {busy && <Loader2 size={14} className="animate-spin" />} Ajouter
        </button>
      </div>
      {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--color-danger-700)' }}>{error}</p>}
    </SettingsCard>
  );
};

export default ExpenseCategoriesCard;
