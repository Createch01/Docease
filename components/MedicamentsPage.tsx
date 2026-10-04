import React, { Suspense, useState } from 'react';
import { sessionService } from '../services/sessionService';
import LoadingIndicator from './LoadingIndicator';

const PharmaDirectory = React.lazy(() => import('./PharmaDirectory'));
const DrugCompatibility = React.lazy(() => import('./DrugCompatibility'));
const MedicamentManagement = React.lazy(() => import('./admin/MedicamentManagement'));

type TabId = 'repertoire' | 'interactions' | 'gestion';

/**
 * Page unique « Médicaments » : Répertoire (consultation du catalogue), Interactions
 * (vérification d'une association) et Gestion (édition du catalogue, médecin seulement).
 */
const MedicamentsPage: React.FC = () => {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'repertoire', label: 'Répertoire' },
    ...(sessionService.can('CREATE_PRESCRIPTION') ? [{ id: 'interactions' as TabId, label: 'Interactions' }] : []),
    ...(sessionService.can('MANAGE_SETTINGS') ? [{ id: 'gestion' as TabId, label: 'Gestion' }] : []),
  ];
  const [tab, setTab] = useState<TabId>('repertoire');

  return (
    <div>
      <div role="tablist" aria-label="Médicaments" className="flex gap-1 mb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="px-4 h-10 text-[13px] font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderColor: tab === t.id ? 'var(--color-primary)' : 'transparent',
              color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingIndicator /></div>}>
        {tab === 'repertoire' && <PharmaDirectory />}
        {tab === 'interactions' && <DrugCompatibility />}
        {tab === 'gestion' && <MedicamentManagement />}
      </Suspense>
    </div>
  );
};

export default MedicamentsPage;
