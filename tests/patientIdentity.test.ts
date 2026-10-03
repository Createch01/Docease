import { describe, it, expect } from 'vitest';
import { civility, sexLetter } from '../utils/patientIdentity';

describe('civility', () => {
  it('M. pour un homme, Mme pour une femme', () => {
    expect(civility('M', 40)).toBe('M.');
    expect(civility('F', 40)).toBe('Mme');
  });
  it('Enfant sous 15 ans, quel que soit le sexe', () => {
    expect(civility('M', 14)).toBe('Enfant');
    expect(civility('F', 6)).toBe('Enfant');
    expect(civility('F', 15)).toBe('Mme');
    expect(civility(undefined, 3)).toBe('Enfant');
    expect(civility('M', undefined, 'Child')).toBe('Enfant');
  });
  it('rien si le sexe est inconnu', () => {
    expect(civility(undefined, 40)).toBe('');
    expect(civility('', 0)).toBe('');
  });
});

describe('sexLetter', () => {
  it('M ou F, vide si inconnu', () => {
    expect(sexLetter('M')).toBe('M');
    expect(sexLetter('F')).toBe('F');
    expect(sexLetter('Femme')).toBe('F');
    expect(sexLetter('Enfant')).toBe('');
    expect(sexLetter(undefined)).toBe('');
  });
});
