import { afterEach, describe, expect, it } from 'vitest';
import { setEngine } from '../engine/engine';
import { type I18n, i18next } from '../engine/i18next/i18next';
import { engine as kroma } from '../engine/kroma/kroma';
import { engine as paraglide } from '../engine/paraglide/paraglide';
import { setLive } from '../live';
import { testEngine } from '../testing';
import { confirmTarget, editTarget } from './message-target';
import type { Probe } from './probe';

function pointingAt(over: Partial<Probe> = {}): Probe {
  return {
    key: 'nav.home',
    text: 'Home',
    scope: null,
    locale: 'en',
    grade: 'catalog',
    vars: undefined,
    holes: [],
    origin: null,
    left: 0,
    top: 0,
    bottom: 0,
    copied: false,
    ...over,
  };
}

const I18NEXT: I18n = {
  language: 'en',
  options: {},
  use: () => undefined,
  emit: () => {},
  changeLanguage: () => Promise.resolve(),
};

afterEach(() => {
  setEngine(null);
  setLive({ keys: false, outline: 'off', locale: null });
});

describe('what the editor opens on', () => {
  it('is the key under the pointer, in the locale the app resolved', () => {
    setEngine(testEngine({ writable: true, activeLocale: () => 'en' }));

    expect(editTarget(pointingAt())).toEqual({ scope: null, locale: 'en', key: 'nav.home' });
  });

  it('writes the locale being rendered, not the one a fallback answered in', () => {
    setEngine(kroma);
    setLive({ locale: 'de' });

    expect(editTarget(pointingAt({ locale: 'en', grade: 'fallback' }))?.locale).toBe('de');
  });

  it('carries the module a message belongs to', () => {
    setEngine(testEngine({ writable: true }));

    expect(editTarget(pointingAt({ scope: 'tv.kroma.vpn' }))?.scope).toBe('tv.kroma.vpn');
  });

  it('is nothing for a sentence that never was a key', () => {
    setEngine(testEngine({ writable: true }));

    expect(editTarget(pointingAt({ key: null, grade: 'raw' }))).toBeNull();
  });

  it('is nothing while the pointer is over no string', () => {
    setEngine(testEngine({ writable: true }));

    expect(editTarget(null)).toBeNull();
  });

  it('is nothing before the engine has resolved a locale', () => {
    setEngine(testEngine({ writable: true, activeLocale: () => '' }));

    expect(editTarget(pointingAt())).toBeNull();
  });

  it.each([
    ['i18next', i18next(I18NEXT)],
    ['paraglide', paraglide],
    ['undeclared', testEngine()],
  ])(
    'is nothing through the %s adapter, which does not say it writes catalogs',
    (_name, adapter) => {
      setEngine(adapter);
      setLive({ locale: 'en' });

      expect(editTarget(pointingAt())).toBeNull();
      expect(confirmTarget(pointingAt({ grade: 'outdated' }))).toBeNull();
    },
  );
});

describe('what a confirm vouches for', () => {
  it.each(['outdated', 'unreviewed'] as const)(
    'is the translation under the pointer where it is %s',
    (grade) => {
      setEngine(testEngine({ writable: true, activeLocale: () => 'en' }));

      expect(confirmTarget(pointingAt({ grade }))).toEqual({
        scope: null,
        locale: 'en',
        key: 'nav.home',
      });
    },
  );

  it.each(['catalog', 'fallback', 'vars', 'missing'] as const)(
    'is nothing for a string graded %s',
    (grade) => {
      setEngine(testEngine({ writable: true }));

      expect(confirmTarget(pointingAt({ grade }))).toBeNull();
    },
  );
});
