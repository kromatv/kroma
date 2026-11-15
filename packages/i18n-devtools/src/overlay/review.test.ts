import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TranslationStatus } from '../server/host';
import type { Sighting } from './mark';
import {
  heldStatus,
  holdStatus,
  onStatusChange,
  reviewing,
  shownGrade,
  wantStatus,
} from './review';

function sighted(over: Partial<Sighting> = {}): Sighting {
  return {
    key: 'nav.home',
    scope: null,
    locale: 'en',
    grade: 'catalog',
    vars: undefined,
    holes: [],
    origin: null,
    ...over,
  };
}

function standing(over: Partial<TranslationStatus> = {}): TranslationStatus {
  return {
    locale: 'en',
    coverage: 0.9,
    missing: 0,
    outdated: 1,
    unreviewed: 1,
    sets: [
      { scope: null, outdated: ['nav.home'], unreviewed: ['nav.hello'] },
      { scope: 'tv.kroma.vpn', outdated: [], unreviewed: ['vpn.connect'] },
    ],
    ...over,
  };
}

function held(status: TranslationStatus): void {
  wantStatus(status.locale);
  holdStatus(status);
}

afterEach(() => wantStatus(null));

describe('the grade a sighted message is shown in', () => {
  it('is outdated once the lock says its source moved', () => {
    held(standing());

    expect(shownGrade(sighted({ key: 'nav.home' }))).toBe('outdated');
  });

  it('is unreviewed for a machine translation nobody has read', () => {
    held(standing());

    expect(shownGrade(sighted({ key: 'nav.hello' }))).toBe('unreviewed');
  });

  it('is outdated for a translation that is both', () => {
    held(standing({ sets: [{ scope: null, outdated: ['nav.home'], unreviewed: ['nav.home'] }] }));

    expect(shownGrade(sighted({ key: 'nav.home' }))).toBe('outdated');
  });

  it.each(['missing', 'vars', 'fallback'] as const)(
    'stays %s, which is about what is on screen, whatever the lock says',
    (grade) => {
      held(standing());

      expect(shownGrade(sighted({ key: 'nav.home', grade }))).toBe(grade);
    },
  );

  it('stays as the engine graded it for a translation that is current', () => {
    held(standing());

    expect(shownGrade(sighted({ key: 'nav.settings' }))).toBe('catalog');
  });

  it('looks a message of a module up among the keys of that module', () => {
    held(standing());

    expect(shownGrade(sighted({ key: 'vpn.connect', scope: 'tv.kroma.vpn' }))).toBe('unreviewed');
    expect(shownGrade(sighted({ key: 'vpn.connect' }))).toBe('catalog');
  });

  it('takes nothing from the lock of another language', () => {
    held(standing());

    expect(shownGrade(sighted({ key: 'nav.home', locale: 'fr' }))).toBe('catalog');
  });
});

describe('holding how a locale stands', () => {
  it('has nothing to look up until a translation is pending', () => {
    held(standing({ sets: [{ scope: null, outdated: [], unreviewed: [] }] }));

    expect(reviewing()).toBe(false);
  });

  it('says there is something to look up once one is', () => {
    held(standing());

    expect(reviewing()).toBe(true);
  });

  it('drops what it held the moment another locale is wanted', () => {
    held(standing());

    wantStatus('de');

    expect(heldStatus()).toBeNull();
    expect(shownGrade(sighted({ key: 'nav.home' }))).toBe('catalog');
  });

  it('leaves out an answer that lands for a locale no longer wanted', () => {
    wantStatus('de');

    holdStatus(standing());

    expect(heldStatus()).toBeNull();
  });

  it('tells whoever watches when the status moves, until they stop', () => {
    const watching = vi.fn();
    const stop = onStatusChange(watching);
    held(standing());
    stop();

    wantStatus(null);

    expect(watching).toHaveBeenCalledTimes(1);
  });
});
