import { describe, expect, it } from 'vitest';
import { createI18n } from './i18n';
import { expandRefs, hasUnresolvedRef } from './nest';

describe('expandRefs', () => {
  it('substitutes a referenced key into the value that quotes it', () => {
    const out = expandRefs({ en: { brand: 'KROMA', hi: 'Welcome to $t(brand)' } }, 'en');

    expect(out.en.hi).toBe('Welcome to KROMA');
  });

  it('resolves a reference through its own locale before the default', () => {
    const catalogs = {
      en: { unit: 'season', of: 'One $t(unit)' },
      fr: { unit: 'saison', of: 'Une $t(unit)' },
    };

    const out = expandRefs(catalogs, 'en');

    expect(out.fr.of).toBe('Une saison');
  });

  it('falls back to the default locale for a reference the locale does not define', () => {
    const out = expandRefs({ en: { brand: 'KROMA' }, fr: { hi: 'Bonjour $t(brand)' } }, 'en');

    expect(out.fr.hi).toBe('Bonjour KROMA');
  });

  it('expands a chain of references', () => {
    const out = expandRefs({ en: { a: 'A', b: '$t(a)B', c: '$t(b)C' } }, 'en');

    expect(out.en.c).toBe('ABC');
  });

  it('leaves a reference to a missing key standing', () => {
    const out = expandRefs({ en: { hi: 'Hello $t(nope)' } }, 'en');

    expect(out.en.hi).toBe('Hello $t(nope)');
    expect(hasUnresolvedRef(out.en.hi)).toBe(true);
  });

  it('breaks a cycle instead of recursing forever', () => {
    const out = expandRefs({ en: { a: 'x$t(b)', b: 'y$t(a)' } }, 'en');

    expect(out.en.a).toBe('xy$t(a)');
    expect(hasUnresolvedRef(out.en.a)).toBe(true);
  });

  it('leaves a value with no reference untouched', () => {
    const out = expandRefs({ en: { hi: 'Hello {name}' } }, 'en');

    expect(out.en.hi).toBe('Hello {name}');
  });
});

describe('createI18n with references', () => {
  it('expands at construction, so a variable can never reach a key', () => {
    const i18n = createI18n({
      catalogs: { en: { brand: 'KROMA', hi: 'Welcome to $t(brand)' } },
      defaultLocale: 'en',
    });

    expect(i18n.translate('en', 'hi')).toBe('Welcome to KROMA');
    expect(i18n.translate('en', 'brand', { brand: '$t(hi)' })).toBe('KROMA');
  });
});
