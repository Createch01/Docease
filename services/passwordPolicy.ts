import { UserRole } from '../types';

// Longueurs minimales : 12 pour le médecin, 8 pour l'assistante. Elles s'appliquent
// aux NOUVEAUX mots de passe et aux changements seulement, jamais au déverrouillage
// (un mot de passe existant plus court n'est pas bloqué). Rust applique la même règle
// (users::validate_password) : celle-ci n'est qu'un retour immédiat dans l'interface.
export const MAX_PASSWORD_LENGTH = 64;

export const minPasswordLength = (role: UserRole): number => (role === 'Medecin' ? 12 : 8);

export interface PasswordCheck {
  valid: boolean;
  error?: string;
}

export const validatePassword = (password: string, role: UserRole = 'Medecin'): PasswordCheck => {
  const min = minPasswordLength(role);
  if ([...password].length < min) {
    return { valid: false, error: `Le mot de passe doit contenir au moins ${min} caractères.` };
  }
  if ([...password].length > MAX_PASSWORD_LENGTH) {
    return { valid: false, error: `Le mot de passe ne doit pas dépasser ${MAX_PASSWORD_LENGTH} caractères.` };
  }
  return { valid: true };
};
