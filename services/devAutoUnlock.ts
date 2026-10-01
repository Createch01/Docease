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
