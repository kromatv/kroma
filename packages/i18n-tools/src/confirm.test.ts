import { afterEach, describe, expect, it } from 'vitest';
import { confirm } from './confirm.ts';
import { markMachine, syncSet } from './edit.ts';
import { removeSets, setOf, write } from './fixture.ts';
import { inspectLocale, readSource } from './status.ts';

afterEach(removeSets);

const FILES = {
  'fr/nav.json': { 'nav.home': 'Accueil', 'nav.homeTitle': 'Titre', 'nav.back': 'Retour' },
  'de/nav.json': { 'nav.home': 'Start', 'nav.homeTitle': 'Titel', 'nav.back': 'Zurück' },
};

describe('confirm', () => {
  it('settles an outdated translation and a machine one, and only the keys it is given', () => {
    const set = setOf(FILES);
    syncSet(set);
    markMachine(set, 'de', ['nav.back', 'nav.homeTitle']);
    write(set, 'fr/nav.json', { ...FILES['fr/nav.json'], 'nav.home': 'Maison' });

    const confirmed = confirm(set, 'de', ['nav.home', 'nav.back', 'nav.nope']);

    const status = inspectLocale(set, readSource(set), 'de');
    expect(confirmed).toEqual(['nav.home', 'nav.back']);
    expect([status.outdated, status.unreviewed]).toEqual([[], ['nav.homeTitle']]);
  });

  it('settles every key that starts with a prefix, and no other', () => {
    const set = setOf(FILES);
    syncSet(set);
    markMachine(set, 'de', ['nav.back', 'nav.home', 'nav.homeTitle']);

    const confirmed = confirm(set, 'de', { prefixes: ['nav.home'] });

    expect(confirmed).toEqual(['nav.home', 'nav.homeTitle']);
    expect(inspectLocale(set, readSource(set), 'de').unreviewed).toEqual(['nav.back']);
  });

  it('settles everything pending when given no prefix', () => {
    const set = setOf(FILES);
    syncSet(set);
    markMachine(set, 'de', ['nav.back']);
    write(set, 'fr/nav.json', { ...FILES['fr/nav.json'], 'nav.home': 'Maison' });

    confirm(set, 'de', { prefixes: [] });

    const status = inspectLocale(set, readSource(set), 'de');
    expect([status.outdated, status.unreviewed]).toEqual([[], []]);
  });
});
