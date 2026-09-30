import { useCallback, useState } from 'react';
import { DoctorInfo } from '../../types';
import { dataService } from '../../services/dataService';
import { toastService } from '../../services/toastService';
import { fieldsDiffer, pickFields } from './SettingsUI';
import { useUnsavedChanges } from './unsavedChanges';

/**
 * Brouillon d'un sous-ensemble de DoctorInfo (source unique). L'enregistrement
 * fusionne uniquement ces champs dans le DoctorInfo stocké au moment du clic —
 * jamais un instantané pris au montage — pour ne pas écraser ce que d'autres
 * pages ont modifié entre-temps (collaborateurs, PIN…).
 */
export function useDoctorDraft<K extends keyof DoctorInfo>(
  key: string,
  fields: readonly K[],
  // Valeurs initiales dérivées (ex. site web lu en secours dans l'apparence).
  resolve?: (info: DoctorInfo) => Partial<Pick<DoctorInfo, K>>,
) {
  const [saved, setSaved] = useState<Pick<DoctorInfo, K>>(() => {
    const info = dataService.getDoctorInfo();
    return { ...pickFields(info, fields), ...resolve?.(info) };
  });
  const [draft, setDraft] = useState(saved);
  const dirty = fieldsDiffer(draft, saved, fields);
  useUnsavedChanges(key, dirty);

  const update = useCallback((patch: Partial<Pick<DoctorInfo, K>>) => setDraft(d => ({ ...d, ...patch })), []);

  const save = useCallback(async (afterSave?: (values: Pick<DoctorInfo, K>, previous: Pick<DoctorInfo, K>) => void) => {
    await dataService.saveDoctorInfo({ ...dataService.getDoctorInfo(), ...draft });
    afterSave?.(draft, saved);
    setSaved(draft);
    toastService.success('Modifications enregistrées');
  }, [draft, saved]);

  return { draft, update, dirty, save };
}
