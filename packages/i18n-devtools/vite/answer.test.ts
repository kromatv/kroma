import { afterEach, describe, expect, it } from 'vitest';
import { answer } from './answer.ts';
import { app, read, removeSets, standing } from './sets.fixture.ts';

afterEach(removeSets);

describe('answering the page about the catalogs', () => {
  it('answers under the number the ask carried', () => {
    const set = app();

    const said = answer(
      'kroma:i18n:edit',
      { at: 7, scope: null, locale: 'en', key: 'nav.home', forms: { 'nav.home': 'House' } },
      () => [set],
    );

    expect(said).toEqual({ at: 7, written: ['nav.home'], refused: null });
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'House' });
  });

  it('reads a message for the ask that wants one', () => {
    const set = app();

    const said = answer(
      'kroma:i18n:message',
      { at: 3, scope: null, locale: 'en', key: 'nav.home' },
      () => [set],
    );

    expect(said).toMatchObject({ at: 3, message: { forms: { 'nav.home': 'Home' } } });
  });

  it('says how a locale stands for the ask that wants that', () => {
    const set = standing();

    const said = answer('kroma:i18n:status', { at: 4, locale: 'en' }, () => [set]);

    expect(said).toMatchObject({ at: 4, status: { missing: 1, outdated: 1, unreviewed: 1 } });
  });

  it('confirms a translation for the ask that names one', () => {
    const set = standing();

    const said = answer(
      'kroma:i18n:confirm',
      { at: 5, scope: null, locale: 'en', key: 'state.outdated' },
      () => [set],
    );

    expect(said).toEqual({ at: 5, settled: ['state.outdated'], refused: null });
  });

  it('reads the sets of this repository where a caller hands it none', () => {
    const said = answer('kroma:i18n:message', {
      at: 6,
      scope: 'tv.kroma.no-such-module',
      locale: 'en',
      key: 'nav.home',
    });

    expect(said).toEqual({
      at: 6,
      message: null,
      refused: 'no catalogs are known for tv.kroma.no-such-module',
    });
  });

  it('says nothing to an ask it could not answer under, and writes nothing', () => {
    const set = app();

    const said = answer(
      'kroma:i18n:edit',
      { scope: null, locale: 'en', key: 'nav.home', forms: { 'nav.home': 'House' } },
      () => [set],
    );

    expect(said).toBeNull();
    expect(read(set, 'en/nav.json')).toEqual({ 'nav.home': 'Home' });
  });
});
