// Shared complexity rule for every credential in the app (master password and
// per-user identification passwords): at least one letter, at least one digit,
// minimum length below. Enforced client-side only — the Rust backend (see
// src-tauri/src/lib.rs) hashes whatever string it's given and has no format
// opinion, so this is the single source of truth for the rule.
export const MIN_PASSWORD_LENGTH = 6;

export interface PasswordCheck {
  valid: boolean;
  error?: string;
}

export const validatePassword = (password: string): PasswordCheck => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Le mot de passe doit contenir au moins une lettre.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Le mot de passe doit contenir au moins un chiffre.' };
  }
  return { valid: true };
};
