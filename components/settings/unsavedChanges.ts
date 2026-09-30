/**
 * Garde « modifications non enregistrées » des Paramètres.
 *
 * Chaque page (ou onglet) déclare son état via useUnsavedChanges(clé, dirty).
 * Toute navigation qui ferait perdre ce brouillon — changement de section dans
 * la sidebar, d'onglet interne, sortie des Paramètres, rechargement — passe par
 * confirmLeave(). Module simple plutôt qu'un contexte : App.tsx (qui possède la
 * navigation) et les pages n'ont pas d'ancêtre commun utile.
 */
import { useEffect } from 'react';

const dirtyKeys = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(l => l());

export const UNSAVED_MESSAGE =
  'Des modifications ne sont pas enregistrées.\nQuitter cette page sans enregistrer ?';

export const unsavedChanges = {
  set(key: string, dirty: boolean) {
    const had = dirtyKeys.has(key);
    if (dirty) dirtyKeys.add(key); else dirtyKeys.delete(key);
    if (had !== dirty) notify();
  },
  isDirty: () => dirtyKeys.size > 0,
  /** true si l'on peut quitter (rien en attente, ou l'utilisateur confirme). */
  confirmLeave(): boolean {
    if (dirtyKeys.size === 0) return true;
    const ok = window.confirm(UNSAVED_MESSAGE);
    if (ok) { dirtyKeys.clear(); notify(); }
    return ok;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

window.addEventListener('beforeunload', (e) => {
  if (!unsavedChanges.isDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

// Application de bureau : la fermeture de la fenêtre Tauri (croix, Alt+F4) ne
// passe pas par beforeunload. onCloseRequested (API Tauri v2) détruit la
// fenêtre après le handler sauf preventDefault — d'où la permission
// core:window:allow-destroy dans src-tauri/capabilities/default.json.
// Garde anti double-enregistrement (HMR en dev).
const w = window as Window & { __TAURI_INTERNALS__?: unknown; __doceaseCloseGuard?: boolean };
if (w.__TAURI_INTERNALS__ && !w.__doceaseCloseGuard) {
  w.__doceaseCloseGuard = true;
  import('@tauri-apps/api/window')
    .then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested((event) => {
      if (!unsavedChanges.confirmLeave()) event.preventDefault();
    }))
    .catch((err) => {
      w.__doceaseCloseGuard = false;
      console.error('Alerte de fermeture indisponible :', err);
    });
}

export function useUnsavedChanges(key: string, dirty: boolean) {
  useEffect(() => {
    unsavedChanges.set(key, dirty);
  }, [key, dirty]);
  useEffect(() => () => unsavedChanges.set(key, false), [key]);
}
