import { DoctorInfo, PrescriptionAppearance } from '../types';

// Logo DocEase (icône de l'application). Ancienne valeur par défaut de
// DoctorInfo.logoUrl : elle ne doit jamais apparaître sur un document.
const DOCEASE_LOGO = /(^|\/)logo\.png$/;

export const withoutDocEaseLogo = (url?: string | null): string =>
  url && !DOCEASE_LOGO.test(url) ? url : '';

/**
 * Logo du cabinet — source unique : DoctorInfo.logoUrl (Cabinet › Logo).
 *
 * Tant que ce champ n'a jamais été enregistré (undefined, ou l'ancien
 * '/logo.png' par défaut), l'ancienne copie de l'apparence est lue en secours.
 * L'enregistrement de Cabinet réécrit la valeur dans DoctorInfo ('' si vide)
 * et supprime la copie.
 */
export function resolveCabinetLogo(
  doctor?: Pick<DoctorInfo, 'logoUrl'> | null,
  legacy?: Pick<PrescriptionAppearance, 'logoUrl' | 'customTemplateConfig'> | null,
): string {
  const own = doctor?.logoUrl;
  if (own !== undefined && own !== null && withoutDocEaseLogo(own) === own) return own;
  return withoutDocEaseLogo(legacy?.logoUrl) || withoutDocEaseLogo(legacy?.customTemplateConfig?.logoUrl);
}
