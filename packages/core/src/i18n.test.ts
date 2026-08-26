import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addCatalogs,
  type Catalogs,
  createTranslator,
  detectLocale,
  isLocale,
  LOCALES,
  normalizeLocale,
  translate,
} from './i18n';

describe('isLocale', () => {
  it('accepts supported codes and rejects everything else', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42 as unknown as string)).toBe(false);
  });
});

describe('normalizeLocale', () => {
  it('maps BCP-47 tags to a base locale', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('fr')).toBe('fr');
    expect(normalizeLocale('FR')).toBe('fr');
    expect(normalizeLocale('fr_CA')).toBe('fr');
  });

  it('accepts the server display names', () => {
    expect(normalizeLocale('Français')).toBe('fr');
    expect(normalizeLocale('English')).toBe('en');
  });

  it('accepts every endonym the catalogs spell, so the two cannot drift apart', () => {
    for (const { code, labelKey } of LOCALES) {
      expect(normalizeLocale(translate(code, labelKey))).toBe(code);
    }
  });

  it('returns null for unknown / empty tags', () => {
    expect(normalizeLocale('de-DE')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(null as unknown as string)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
  });
});

describe('detectLocale', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefers an explicit valid preference', () => {
    expect(detectLocale('en')).toBe('en');
    expect(detectLocale('fr-CH')).toBe('fr');
  });

  it('falls back to the default locale when navigator has no supported locale', () => {
    // Bun's navigator.language varies by machine and CI, so stub it out.
    vi.stubGlobal('navigator', undefined);
    expect(detectLocale('xx')).toBe('fr');
    expect(detectLocale(null as unknown as string)).toBe('fr');
  });

  it('uses navigator languages when no explicit preference resolves', () => {
    vi.stubGlobal('navigator', { languages: ['de', 'en-US'] });
    expect(detectLocale(null as unknown as string)).toBe('en');
    vi.stubGlobal('navigator', { language: 'fr-CH' });
    expect(detectLocale('xx')).toBe('fr');
  });
});

describe('translate', () => {
  it('returns the localized string for a known key', () => {
    expect(translate('fr', 'person.role.actor')).toBe('Acteur');
    expect(translate('en', 'person.role.actor')).toBe('Actor');
  });

  it('interpolates named tokens', () => {
    expect(translate('en', 'discover.pageOf', { page: 2, total: 5 })).toBe('Page 2 / 5');
  });

  it('selects the plural variant by count', () => {
    expect(translate('en', 'content.seasonCount', { count: 1 })).toBe('1 season');
    expect(translate('en', 'content.seasonCount', { count: 3 })).toBe('3 seasons');
  });
});

describe('createTranslator', () => {
  it('binds a locale', () => {
    const t = createTranslator('fr');
    expect(t('person.role.director')).toBe('Réalisateur');
  });
});

describe('catalogs added at runtime', () => {
  const catalogs: Catalogs = {
    fr: { greeting: 'Bonjour {name}', item_one: '{count} article', item: '{count} articles' },
    en: { greeting: 'Hello {name}' },
  };

  it('translates a scope against its own catalogs, with interpolation', () => {
    const dispose = addCatalogs('probe.interpolation', catalogs);

    expect(createTranslator('en', 'probe.interpolation')('greeting', { name: 'Max' })).toBe(
      'Hello Max',
    );

    dispose();
  });

  it('falls back inside the scope to its default locale', () => {
    const dispose = addCatalogs('probe.fallback', catalogs);

    expect(createTranslator('en', 'probe.fallback')('item', { count: 5 })).toBe('5 articles');

    dispose();
  });

  it('picks the _one plural variant, else the base', () => {
    const dispose = addCatalogs('probe.plural', catalogs);
    const t = createTranslator('fr', 'probe.plural');

    expect(t('item', { count: 1 })).toBe('1 article');
    expect(t('item', { count: 4 })).toBe('4 articles');

    dispose();
  });

  it('keeps unknown interpolation tokens verbatim', () => {
    const dispose = addCatalogs('probe.tokens', catalogs);

    expect(createTranslator('fr', 'probe.tokens')('greeting', { other: 'x' })).toBe(
      'Bonjour {name}',
    );

    dispose();
  });

  it('renders a key no catalog knows as the key itself', () => {
    const dispose = addCatalogs('probe.missing', catalogs);

    expect(createTranslator('en', 'probe.missing')('missing.key')).toBe('missing.key');

    dispose();
  });

  it('leaves the app catalogs alone once the scope is disposed', () => {
    addCatalogs('probe.dispose', { fr: { 'nav.home': 'Détourné' } })();

    expect(translate('fr', 'nav.home')).not.toBe('Détourné');
  });
});
