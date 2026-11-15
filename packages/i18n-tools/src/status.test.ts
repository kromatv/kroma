import { afterEach, describe, expect, it } from 'vitest';
import { syncSet } from './edit.ts';
import { removeSets, setOf, write } from './fixture.ts';
import { coverage, fileOf, inspectLocale, inspectWorkspace, readSource } from './status.ts';

afterEach(removeSets);

const FR = {
  'fr/nav.json': { 'nav.home': 'Accueil', 'nav.back': 'Retour', 'nav.more': 'Plus' },
  'fr/cart.json': { 'cart.items': '{count} articles', 'cart.items_one': 'Un article' },
};

describe('inspectLocale', () => {
  it('counts a message the locale spells as translated and the rest as missing', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });

    const status = inspectLocale(set, readSource(set), 'de');

    expect(status.tally).toEqual({
      total: 4,
      translated: 1,
      unreviewed: 0,
      inherited: 0,
      outdated: 0,
      missing: 3,
    });
    expect(status.missing).toEqual(['cart.items', 'nav.back', 'nav.more']);
  });

  it('counts a plural message once, whatever its variants', () => {
    const set = setOf({ ...FR, 'ru/cart.json': { 'cart.items': 'a', 'cart.items_few': 'b' } });

    const status = inspectLocale(set, readSource(set), 'ru');

    expect(status.files.get('cart')).toMatchObject({ total: 1, translated: 1 });
  });

  it('calls a translation outdated once its source moves and it does not', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start', 'nav.back': 'Zurück' } });
    syncSet(set);

    write(set, 'fr/nav.json', { 'nav.home': 'Maison', 'nav.back': 'Retour', 'nav.more': 'Plus' });
    const status = inspectLocale(set, readSource(set), 'de');

    expect(status.outdated).toEqual(['nav.home']);
    expect(status.tally).toMatchObject({ translated: 1, outdated: 1 });
  });

  it('calls it current again once the translation moves too', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });
    syncSet(set);
    write(set, 'fr/nav.json', { 'nav.home': 'Maison', 'nav.back': 'Retour', 'nav.more': 'Plus' });

    write(set, 'de/nav.json', { 'nav.home': 'Zuhause' });
    const status = inspectLocale(set, readSource(set), 'de');

    expect(status.outdated).toEqual([]);
  });

  it('calls a plural message outdated when only a variant of its source moved', () => {
    const set = setOf({ ...FR, 'de/cart.json': { 'cart.items': '{count} Artikel' } });
    syncSet(set);

    write(set, 'fr/cart.json', { 'cart.items': '{count} articles', 'cart.items_one': '1 article' });

    expect(inspectLocale(set, readSource(set), 'de').outdated).toEqual(['cart.items']);
  });

  it('takes a translation no lock has seen as current', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });

    expect(inspectLocale(set, readSource(set), 'de').outdated).toEqual([]);
  });

  it('counts an empty translation as missing', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': '' } });

    expect(inspectLocale(set, readSource(set), 'de').missing).toContain('nav.home');
  });

  it('lists the keys the source has no message for', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.gone': 'Weg' } });

    expect(inspectLocale(set, readSource(set), 'de').strays).toEqual(['nav.gone']);
  });
});

describe('a regional locale', () => {
  it('inherits what the language it belongs to has, and misses the rest', () => {
    const set = setOf({
      ...FR,
      'pt/nav.json': { 'nav.home': 'Início', 'nav.back': 'Voltar' },
      'pt-BR/nav.json': { 'nav.back': 'Retornar' },
    });

    const status = inspectLocale(set, readSource(set), 'pt-BR');

    expect(status.tally).toEqual({
      total: 4,
      translated: 1,
      unreviewed: 0,
      inherited: 1,
      outdated: 0,
      missing: 2,
    });
    expect(status.missing).toEqual(['cart.items', 'nav.more']);
  });

  it('is whole when its language is the source, however little it writes', () => {
    const set = setOf({ ...FR, 'fr-CH/nav.json': { 'nav.more': 'Davantage' } });

    const status = inspectLocale(set, readSource(set), 'fr-CH');

    expect(status.tally).toMatchObject({ translated: 1, inherited: 3, missing: 0 });
    expect(coverage(status.tally)).toBe(1);
  });

  it('does not inherit from a language it merely falls back to', () => {
    const set = setOf(
      { ...FR, 'en/nav.json': { 'nav.home': 'Home' }, 'de/nav.json': {} },
      {
        source: 'fr',
        fallback: 'en',
      },
    );

    expect(inspectLocale(set, readSource(set), 'de').tally.inherited).toBe(0);
  });
});

describe('fileOf', () => {
  it('follows the file the source keeps a key in, and a new variant its base', () => {
    const set = setOf({ 'fr/admin/users.json': { 'admin.invites': '{count} invitations' } });
    const source = readSource(set);

    expect(fileOf(set, source, 'admin.invites')).toBe('admin/users');
    expect(fileOf(set, source, 'admin.invites_few')).toBe('admin/users');
    expect(fileOf(set, source, 'admin.unknown')).toBe('admin');
  });
});

describe('inspectWorkspace', () => {
  it('leads with the source language and adds a language up across sets', () => {
    const app = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } }, { source: 'fr' });
    const module = {
      ...setOf(
        { 'en.json': { 'page.title': 'Notes' }, 'de.json': { 'page.title': 'Notizen' } },
        { source: 'en' },
        'flat',
      ),
      name: 'tv.kroma.notes',
    };

    const languages = inspectWorkspace([app, module]);

    expect(languages.map((language) => language.locale)).toEqual(['fr', 'de', 'en']);
    expect(languages[1]?.tally).toEqual({
      total: 5,
      translated: 2,
      unreviewed: 0,
      inherited: 0,
      outdated: 0,
      missing: 3,
    });
    expect(coverage(languages[1]!.tally)).toBeCloseTo(0.4);
  });
});
