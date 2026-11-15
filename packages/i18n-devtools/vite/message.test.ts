import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeMessage } from './message.ts';
import { app, removeSets } from './sets.fixture.ts';

afterEach(removeSets);

describe('reading a message for the editor', () => {
  it('hands over what the locale writes beside what the source language says', () => {
    const set = app();

    const answer = describeMessage(() => [set], { scope: null, locale: 'en', key: 'nav.home' });

    expect(answer).toEqual({
      refused: null,
      message: {
        set: 'core',
        source: 'fr',
        reference: { 'nav.home': 'Accueil' },
        forms: { 'nav.home': 'Home' },
        variables: [],
      },
    });
  });

  it('hands over every plural form of the source where the locale has none yet', () => {
    const set = app();

    const { message } = describeMessage(() => [set], {
      scope: null,
      locale: 'en',
      key: 'content.seasons',
    });

    expect(message).toMatchObject({
      reference: {
        'content.seasons_one': '{count} saison',
        'content.seasons_other': '{count} saisons',
      },
      forms: {},
      variables: ['count'],
    });
  });

  it('reads the source language against itself', () => {
    const set = app();

    const { message } = describeMessage(() => [set], {
      scope: null,
      locale: 'fr',
      key: 'nav.home',
    });

    expect(message?.forms).toEqual({ 'nav.home': 'Accueil' });
  });

  it('refuses a key the source language has no message for', () => {
    const set = app();

    const answer = describeMessage(() => [set], { scope: null, locale: 'en', key: 'nav.gone' });

    expect(answer).toEqual({ message: null, refused: 'nav.gone is not a message of core' });
  });

  it('refuses to guess the app where no set is known at all', () => {
    const answer = describeMessage(() => [], { scope: null, locale: 'en', key: 'nav.home' });

    expect(answer).toEqual({ message: null, refused: 'no catalogs are known for the app' });
  });

  it('refuses an ask that names no message at all', () => {
    const set = app();

    const answer = describeMessage(() => [set], { scope: null, locale: 'en' });

    expect(answer.refused).toContain('malformed');
  });

  it('says why where the catalogs cannot be read', () => {
    const set = app();
    writeFileSync(join(set.dir, 'fr/nav.json'), '{ "nav.home": ');

    const answer = describeMessage(() => [set], { scope: null, locale: 'en', key: 'nav.home' });

    expect(answer.refused).toContain('is not a flat map of strings');
  });
});
