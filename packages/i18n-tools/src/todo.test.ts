import { afterEach, describe, expect, it } from 'vitest';
import { syncSet } from './edit.ts';
import { removeSets, setOf, write } from './fixture.ts';
import { todo } from './todo.ts';

afterEach(removeSets);

const FILES = {
  'fr/nav.json': {
    'nav.home': 'Accueil',
    'nav.count': '{count} pages',
    'nav.count_one': 'Une page',
  },
  'en/nav.json': { 'nav.home': 'Home' },
  'de/nav.json': { 'nav.home': 'Start' },
};

describe('todo', () => {
  it('lists what is missing, with the source and the reference language', () => {
    const set = setOf({ ...FILES, 'de/nav.json': {} });

    const work = todo(set, 'de', { reference: 'en' });

    expect(work['nav.home']).toEqual({ state: 'missing', source: 'Accueil', reference: 'Home' });
  });

  it('gives a plural message as its templates by key', () => {
    const set = setOf(FILES);

    expect(todo(set, 'de')['nav.count']?.source).toEqual({
      'nav.count': '{count} pages',
      'nav.count_one': 'Une page',
    });
  });

  it('lists an outdated message first, with what the locale says today', () => {
    const set = setOf(FILES);
    syncSet(set);
    write(set, 'fr/nav.json', { ...FILES['fr/nav.json'], 'nav.home': 'Maison' });

    const work = todo(set, 'de');

    expect(Object.keys(work)).toEqual(['nav.home', 'nav.count']);
    expect(work['nav.home']).toEqual({ state: 'outdated', source: 'Maison', current: 'Start' });
  });

  it('narrows to the keys that start with a prefix', () => {
    const set = setOf({ ...FILES, 'de/nav.json': {} });

    expect(Object.keys(todo(set, 'de', { prefixes: ['nav.c'] }))).toEqual(['nav.count']);
  });
});
