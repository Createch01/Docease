import { describe, it, expect } from 'vitest';
import { BackupError, formatAge, formatStamp } from '../services/backupService';

describe('backupService (présentation)', () => {
    it('formate l’ancienneté', () => {
        expect(formatAge(null)).toBe('jamais');
        expect(formatAge(30)).toBe("à l'instant");
        expect(formatAge(20 * 60)).toBe('il y a 20 min');
        expect(formatAge(3 * 3600)).toBe('il y a 3 h');
        expect(formatAge(3 * 86400)).toBe('il y a 3 jours');
    });

    it('lit le code et le message d’une erreur Rust', () => {
        const e = new BackupError('WRONG_PASSPHRASE|Phrase de passe incorrecte.');
        expect(e.code).toBe('WRONG_PASSPHRASE');
        expect(e.message).toBe('Phrase de passe incorrecte.');
        const other = new BackupError('Locked: no encryption key set');
        expect(other.code).toBe('UNKNOWN');
        expect(other.message).toBe('Locked: no encryption key set');
    });

    it('formate l’horodatage du nom de fichier', () => {
        expect(formatStamp('20261004-153000')).toContain('2026');
        expect(formatStamp('n-importe-quoi')).toBe('n-importe-quoi');
    });
});
