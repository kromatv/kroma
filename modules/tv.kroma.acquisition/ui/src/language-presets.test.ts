import { describe, expect, it } from 'vitest';
import { isLanguagePreset, LANGUAGE_PRESETS } from './language-presets';

describe('LANGUAGE_PRESETS', () => {
  it('offers the dubs a French library is sorted by', () => {
    expect(LANGUAGE_PRESETS.map((preset) => preset.value)).toEqual([
      'original',
      'fr-FR',
      'fr-CA',
      'fr',
      'en',
    ]);
  });
});

describe('isLanguagePreset', () => {
  it('knows a tag the picker can show', () => {
    expect(isLanguagePreset('fr-CA')).toBe(true);
  });

  it('sends a tag nobody listed to the free entry', () => {
    expect(isLanguagePreset('pt-BR')).toBe(false);
    expect(isLanguagePreset('')).toBe(false);
  });
});
