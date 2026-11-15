import { describe, expect, it, vi } from 'vitest';
import { defineI18n } from './define';

const CATALOGS = {
  fr: { 'lang.fr': 'Français', 'nav.home': 'Accueil', 'nav.back': 'Retour', 'nav.more': 'Plus' },
  en: { 'lang.en': 'English', 'nav.home': 'Home', 'nav.back': 'Back' },
  de: { 'lang.de': 'Deutsch', 'nav.home': 'Start' },
  it: { 'lang.it': 'Italiano' },
};

const PROJECT = {
  source: 'fr',
  fallback: 'en',
  locales: { en: { stage: 'stable' }, de: { stage: 'beta' } },
};

function build() {
  return defineI18n({ catalogs: CATALOGS, project: PROJECT });
}

describe('defineI18n', () => {
  it('offers the languages past a draft, and says which are still being translated', () => {
    expect(build().LOCALES).toEqual([
      { code: 'fr', labelKey: 'lang.fr', stage: 'stable' },
      { code: 'en', labelKey: 'lang.en', stage: 'stable' },
      { code: 'de', labelKey: 'lang.de', stage: 'beta' },
    ]);
  });

  it('never resolves a reader to a draft, by tag or by name', () => {
    const { normalizeLocale, isLocale, detectLocale } = build();

    expect([normalizeLocale('it-IT'), normalizeLocale('Italiano')]).toEqual([null, null]);
    expect(isLocale('it')).toBe(false);
    expect(detectLocale('it')).not.toBe('it');
  });

  it('still renders a draft for a tool that asks for it by code', () => {
    const { i18n } = build();

    expect(i18n.locales()).toContain('it');
    expect(i18n.translator('it' as never)('lang.it' as never)).toBe('Italiano');
  });

  it('reads an unfinished language in its fallback, then in the source', () => {
    const t = build().i18n.translator('de' as never) as (key: string) => string;

    expect([t('nav.home'), t('nav.back'), t('nav.more')]).toEqual(['Start', 'Back', 'Plus']);
  });

  it('defaults to the source language', () => {
    expect(build().DEFAULT_LOCALE).toBe('fr');
  });

  it('fetches a beta language with its fallback, and a stable one alone', async () => {
    const loads = {
      fr: vi.fn(() => Promise.resolve({ 'cart.pay': 'Payer' })),
      en: vi.fn(() => Promise.resolve({ 'cart.pay': 'Pay' })),
      de: vi.fn(() => Promise.resolve({})),
    };
    const { i18n } = defineI18n({ catalogs: CATALOGS, project: PROJECT, lazy: { cart: loads } });
    i18n.warm('de' as never);
    i18n.register('cart', loads);

    await i18n.ready('de' as never);

    expect((i18n.translator('de' as never) as (key: string) => string)('cart.pay')).toBe('Pay');
    expect([
      loads.de.mock.calls.length,
      loads.en.mock.calls.length,
      loads.fr.mock.calls.length,
    ]).toEqual([1, 1, 0]);
  });
});

describe('a language whose catalogs do not ship up front', () => {
  it('exists by its name alone, and is offered like any other', () => {
    const { LOCALES, normalizeLocale, i18n } = defineI18n({
      catalogs: {},
      names: { fr: 'Français', en: 'English', de: 'Deutsch' },
      project: PROJECT,
    });

    expect(LOCALES.map((locale) => locale.code)).toEqual(['fr', 'en', 'de']);
    expect(normalizeLocale('Deutsch')).toBe('de');
    expect(i18n.locales()).toEqual(['fr', 'en', 'de']);
  });
});

describe('a catalog that is in the bundle but read on demand', () => {
  function bundle() {
    const read = {
      fr: vi.fn(() => ({ 'nav.home': 'Accueil', 'nav.more': 'Plus' })),
      en: vi.fn(() => ({ 'nav.home': 'Home' })),
      de: vi.fn(() => ({ 'nav.home': 'Start' })),
    };
    const defined = defineI18n({
      catalogs: {
        fr: { 'lang.fr': 'Français' },
        en: { 'lang.en': 'English' },
        de: { 'lang.de': 'Deutsch' },
      },
      deferred: read,
      project: PROJECT,
    });
    return { ...defined, read };
  }

  it('is not read until its language is rendered', () => {
    const { read, LOCALES } = bundle();

    expect(LOCALES).toHaveLength(3);
    expect([read.fr, read.en, read.de].map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it('is read once, with the languages it falls back to and no other', () => {
    const { i18n, read } = bundle();
    const t = i18n.translator('en' as never) as (key: string) => string;

    const said = [t('nav.home'), t('nav.more'), t('nav.home')];

    expect(said).toEqual(['Home', 'Plus', 'Home']);
    expect([read.fr, read.en, read.de].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 0]);
  });
});
