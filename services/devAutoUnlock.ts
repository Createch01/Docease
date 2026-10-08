// DEV ONLY — lets the lock screen unlock itself with the password from .env.local
// so it isn't retyped on every launch. It goes through the normal unlock path
// (securityService.unlock -> Argon2 -> unwrap data key); nothing is skipped.
//
// The env read lives inside the `import.meta.env.DEV` block so Vite replaces the
// condition with `false` in production and the branch (and any value) is dropped
// from the bundle.
export const getDevAutoUnlockPassword = (): string | null => {
    if (import.meta.env.DEV) {
        const password = import.meta.env.VITE_DEV_AUTO_UNLOCK_PASSWORD as string | undefined;
        if (password) return password;
    }
    return null;
};

/**
 * DEV ONLY — désactive le verrouillage automatique par inactivité (VITE_DEV_DISABLE_AUTO_LOCK=1 dans .env.local).
 * La condition `import.meta.env.DEV` est évaluée à l'appel et remplacée par `false` dans un build : en production le
 * verrou reste actif, quelle que soit la variable. (Côté Rust, le délai n'est déjà jamais appliqué dans un build de debug.)
 */
export const isDevAutoLockDisabled = (): boolean => {
    if (import.meta.env.DEV) {
        return import.meta.env.VITE_DEV_DISABLE_AUTO_LOCK === '1';
    }
    return false;
};
