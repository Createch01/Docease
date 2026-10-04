import { describe, it, expect } from 'vitest';
import { redundancyMessage } from '../services/backupService';

describe('alerte de redondance des sauvegardes', () => {
    it('avertit sans second emplacement et quand les deux sont sur le même disque', () => {
        expect(redundancyMessage('no_secondary')).toMatch(/second emplacement/);
        expect(redundancyMessage('same_disk')).toMatch(/même disque/);
    });

    it('ne dit rien quand les deux emplacements sont sur des supports distincts', () => {
        expect(redundancyMessage(null)).toBeNull();
    });
});
