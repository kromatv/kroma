import { describe, expect, it } from 'vitest';
import { keyLabel } from './label';

function rendered(from: { scope: string | null; locale: string } | undefined, locale = 'fr') {
  return { key: 'auth.login', from, locale, text: 'Connexion', vars: undefined, holes: [] };
}

describe('the label a key renders as', () => {
  it("names the app's own catalogs by the base scope", () => {
    expect(keyLabel(rendered({ scope: null, locale: 'fr' }))).toBe('[core/auth.login]');
  });

  it('names the scope that answered, where one did', () => {
    expect(keyLabel(rendered({ scope: 'tv.kroma.torrents', locale: 'fr' }))).toBe(
      '[tv.kroma.torrents/auth.login]',
    );
  });

  it('says the locale too where the answer came from a fallback', () => {
    expect(keyLabel(rendered({ scope: null, locale: 'en' }))).toBe('[core@en/auth.login]');
  });

  it('says a scope and its fallback locale together', () => {
    expect(keyLabel(rendered({ scope: 'tv.kroma.notes', locale: 'en' }))).toBe(
      '[tv.kroma.notes@en/auth.login]',
    );
  });

  it('marks a key nothing answered at all', () => {
    expect(keyLabel(rendered(undefined))).toBe('[missing/auth.login]');
  });
});
