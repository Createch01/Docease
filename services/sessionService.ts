import { Permission, ROLE_PERMISSIONS, UserRole } from '../types';

// Reflet côté interface de la session tenue par Rust (src-tauri/src/access.rs).
// Ce n'est PAS la sécurité : chaque commande Rust revérifie le rôle. Ce module ne
// sert qu'à masquer les menus, rediriger les routes et filtrer l'affichage.
export interface Session {
    userId: string;
    name: string;
    role: UserRole;
    mustChangePassword: boolean;
}

let current: Session | null = null;

export const sessionFromRust = (s: { user_id: string; name: string; role: UserRole; must_change_password: boolean }): Session => ({
    userId: s.user_id,
    name: s.name,
    role: s.role,
    mustChangePassword: s.must_change_password,
});

export const sessionService = {
    set: (s: Session | null) => { current = s; },
    get: (): Session | null => current,
    clear: () => { current = null; },
    role: (): UserRole | null => current?.role ?? null,
    isMedecin: (): boolean => current?.role === 'Medecin',
    isAssistant: (): boolean => current?.role === 'Assistant',
    can: (permission: Permission): boolean =>
        !!current && ROLE_PERMISSIONS[current.role].includes(permission),
};
