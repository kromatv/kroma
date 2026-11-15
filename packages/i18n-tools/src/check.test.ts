import { afterEach, describe, expect, it } from 'vitest';
import { checkSet, policyProblems } from './check.ts';
import { syncSet } from './edit.ts';
import { removeSets, setOf, write } from './fixture.ts';
import type { CatalogSet } from './set.ts';

afterEach(removeSets);

const FR = {
  'fr/lang.json': { 'lang.fr': 'Français', 'lang.de': 'Allemand' },
  'fr/nav.json': {
    'nav.home': 'Accueil',
    'nav.count': '{count} pages',
    'nav.count_one': 'Une page',
  },
};
const DE_LANG = { 'de/lang.json': { 'lang.de': 'Deutsch' } };

function problemsOf(set: CatalogSet): string[] {
  syncSet(set);
  return checkSet(set).map((problem) => `${problem.where}: ${problem.message}`);
}

describe('checkSet', () => {
  it('passes a draft that has translated next to nothing', () => {
    expect(problemsOf(setOf({ ...FR, ...DE_LANG }))).toEqual([]);
  });

  it('refuses a key in a file of another namespace', () => {
    const set = setOf({ ...FR, ...DE_LANG, 'de/nav.json': { 'cart.pay': 'Zahlen' } });

    expect(problemsOf(set).join('\n')).toContain('cart.pay is not a message of nav');
  });

  it('refuses a key the source language does not have, and says how to drop it', () => {
    const set = setOf({ ...FR, ...DE_LANG, 'de/nav.json': { 'nav.gone': 'Weg' } });

    expect(problemsOf(set).join('\n')).toContain('nav.gone is no message of fr');
  });

  it('refuses a placeholder the source never passes', () => {
    const set = setOf({ ...FR, ...DE_LANG, 'de/nav.json': { 'nav.count': '{total} Seiten' } });

    expect(problemsOf(set).join('\n')).toContain('nav.count names {total}');
  });

  it('refuses a plural variant without its base beside it', () => {
    const set = setOf({ ...FR, ...DE_LANG, 'de/nav.json': { 'nav.count_one': 'Eine Seite' } });

    expect(problemsOf(set).join('\n')).toContain('nav.count_one has no nav.count beside it');
  });

  it('refuses an empty translation', () => {
    const set = setOf({ ...FR, ...DE_LANG, 'de/nav.json': { 'nav.home': '' } });

    expect(problemsOf(set).join('\n')).toContain('nav.home is empty');
  });

  it('refuses a language that does not name itself', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });

    expect(problemsOf(set).join('\n')).toContain('lang.de is missing');
  });

  it('refuses a quote of a message that does not exist, or of another file', () => {
    const set = setOf({
      'fr/nav.json': { 'nav.home': 'Accueil', 'nav.to': 'Vers $t(nav.nope) et $t(cart.pay)' },
      'fr/cart.json': { 'cart.pay': 'Payer' },
    });

    const problems = problemsOf(set).join('\n');

    expect(problems).toContain('nav.to quotes nav.nope, which is no message');
    expect(problems).toContain('nav.to quotes cart.pay: a message only quotes its own file');
  });

  it('refuses a key kept in another file than the source keeps it in', () => {
    const set = setOf({
      'fr/admin/users.json': { 'admin.invite': 'Inviter' },
      'de/admin.json': { 'admin.invite': 'Einladen' },
    });

    const problems = checkSet(set).map((problem) => problem.message);

    expect(problems.join('\n')).toContain('admin.invite belongs in admin/users.json');
  });

  it('holds a stable language to every message, and names what it lacks', () => {
    const set = setOf(
      { ...FR, ...DE_LANG, 'de/nav.json': { 'nav.home': 'Start' } },
      { source: 'fr', locales: { de: { stage: 'stable' } } },
    );

    expect(problemsOf(set).join('\n')).toContain('de: stable, and missing 2: lang.fr, nav.count');
  });

  it('holds a stable language to the current source, and says how to confirm', () => {
    const set = setOf(
      { 'fr/nav.json': { 'nav.home': 'Accueil' }, 'de/nav.json': { 'nav.home': 'Start' } },
      { source: 'fr', locales: { de: { stage: 'stable' } } },
    );
    syncSet(set);

    write(set, 'fr/nav.json', { 'nav.home': 'Maison' });
    const problems = checkSet(set).map((problem) => problem.message);

    expect(problems.join('\n')).toContain('stable, and outdated in 1: nav.home');
    expect(problems.join('\n')).toContain('bun run i18n confirm de');
  });

  it('refuses a lock the files have moved past', () => {
    const set = setOf({ ...FR, ...DE_LANG });
    syncSet(set);

    write(set, 'de/nav.json', { 'nav.home': 'Start' });

    expect(checkSet(set)).toEqual([
      { set: 'app', where: 'de/i18n.lock', message: 'out of date: run `bun run i18n sync`' },
    ]);
  });

  it('refuses a set whose source language has no catalog', () => {
    expect(checkSet(setOf({ 'de/nav.json': {} })).map((problem) => problem.message)).toEqual([
      'the source language has no catalog',
    ]);
  });

  it('refuses a language file left beside the language folders, which nothing reads', () => {
    const set = setOf({ ...FR, ...DE_LANG, 'de.json': { 'nav.home': 'Start' } });

    expect(problemsOf(set)).toContain(
      'de.json: is not read beside the language folders: move its messages into de/',
    );
  });

  it('refuses a folder that is not a language tag', () => {
    const set = setOf({ ...FR, 'Deutsch/nav.json': {} });

    expect(problemsOf(set)).toContain('Deutsch: is not a language tag');
  });
});

describe('policyProblems', () => {
  it('refuses a locale or a fallback the folders do not hold', () => {
    const set = setOf(FR, { source: 'fr', fallback: 'en', locales: { de: { stage: 'beta' } } });

    expect(policyProblems(set).map((problem) => problem.message)).toEqual([
      'the fallback en has no folder',
      'the locale de has no folder',
    ]);
  });

  it('refuses a regional locale cut off from its language', () => {
    const set = setOf(
      { ...FR, 'pt/nav.json': {}, 'pt-BR/nav.json': {} },
      { source: 'fr', locales: { 'pt-BR': { fallback: 'fr' } } },
    );

    expect(policyProblems(set).map((problem) => problem.message)).toEqual([
      'pt-BR never falls back to pt',
    ]);
  });
});
