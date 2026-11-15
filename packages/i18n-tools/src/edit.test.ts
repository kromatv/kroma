import { afterEach, describe, expect, it } from 'vitest';
import { addLocale, fill, move, prune, syncSet } from './edit.ts';
import { has, moduleOf, read, removeSets, setOf } from './fixture.ts';
import { readLock } from './lock.ts';
import { localesOf, lockPath } from './set.ts';

afterEach(removeSets);

const FR = {
  'fr/lang.json': { 'lang.fr': 'Français' },
  'fr/nav.json': { 'nav.back': 'Retour', 'nav.count': '{count} pages', 'nav.home': 'Accueil' },
};

describe('syncSet', () => {
  it('records every translation, and nothing for the source language', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });

    const { locked } = syncSet(set);

    expect(locked).toEqual(['de']);
    expect([...readLock(lockPath(set, 'de')).keys()]).toEqual(['nav.home']);
    expect(has(set, 'fr/i18n.lock')).toBe(false);
  });

  it('changes nothing the second time', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });
    syncSet(set);

    expect(syncSet(set)).toEqual({ mirrored: [], locked: [] });
  });

  it('moves a translation into the file the source now keeps its key in', () => {
    const set = setOf({
      'fr/admin/users.json': { 'admin.invite': 'Inviter' },
      'fr/admin.json': { 'admin.title': 'Console' },
      'de/admin.json': { 'admin.invite': 'Einladen', 'admin.title': 'Konsole' },
    });

    const { mirrored } = syncSet(set);

    expect(mirrored).toEqual(['de']);
    expect(read(set, 'de/admin/users.json')).toEqual({ 'admin.invite': 'Einladen' });
    expect(read(set, 'de/admin.json')).toEqual({ 'admin.title': 'Konsole' });
  });
});

describe('fill', () => {
  it('writes each translation into its file, in the order of the source', () => {
    const set = setOf(FR);

    fill(set, 'de', { 'nav.home': 'Start', 'nav.back': 'Zurück', 'lang.fr': 'Französisch' });

    expect(Object.keys(read(set, 'de/nav.json'))).toEqual(['nav.back', 'nav.home']);
    expect(read(set, 'de/lang.json')).toEqual({ 'lang.fr': 'Französisch' });
  });

  it('keeps a plural variant only the translation has beside its base', () => {
    const set = setOf(FR);

    fill(set, 'ru', { 'nav.home': 'a', 'nav.count_few': 'b', 'nav.count': 'c' });

    expect(Object.keys(read(set, 'ru/nav.json'))).toEqual([
      'nav.count',
      'nav.count_few',
      'nav.home',
    ]);
  });

  it('refuses a key that is no message, and writes the rest', () => {
    const set = setOf(FR);

    const { written, rejected } = fill(set, 'de', { 'nav.home': 'Start', 'nav.nope': 'x' });

    expect([written, rejected]).toEqual([['nav.home'], ['nav.nope']]);
  });

  it('removes a key given an empty text, and the file once it holds nothing', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start' } });

    fill(set, 'de', { 'nav.home': '' });

    expect(has(set, 'de/nav.json')).toBe(false);
  });
});

describe('prune', () => {
  it('removes the keys the source language no longer has, and only those', () => {
    const set = setOf({ ...FR, 'de/nav.json': { 'nav.home': 'Start', 'nav.gone': 'Weg' } });

    const removed = prune(set, 'de');

    expect(removed).toEqual(['nav.gone']);
    expect(read(set, 'de/nav.json')).toEqual({ 'nav.home': 'Start' });
  });
});

describe('move', () => {
  it('splits a namespace in the source and in every translation at once', () => {
    const set = setOf({
      'fr/admin.json': { 'admin.backupNow': 'Sauvegarder', 'admin.title': 'Console' },
      'de/admin.json': { 'admin.backupNow': 'Sichern', 'admin.title': 'Konsole' },
    });

    const moved = move(set, 'admin.backup', 'admin/backup');

    expect(moved).toEqual(['admin.backupNow']);
    expect(read(set, 'fr/admin/backup.json')).toEqual({ 'admin.backupNow': 'Sauvegarder' });
    expect(read(set, 'de/admin/backup.json')).toEqual({ 'admin.backupNow': 'Sichern' });
    expect(read(set, 'de/admin.json')).toEqual({ 'admin.title': 'Konsole' });
  });

  it('refuses to put a message in a file of another namespace', () => {
    const set = setOf({ 'fr/admin.json': { 'admin.title': 'Console' } });

    expect(() => move(set, 'admin.', 'nav/admin')).toThrow('its namespace is admin');
  });
});

describe('addLocale', () => {
  it('starts a folder that names the language in its own words', () => {
    const set = setOf(FR);

    const added = addLocale(set, 'de');

    expect(added.name).toBe('Deutsch');
    expect(read(set, 'de/lang.json')).toEqual({ 'lang.de': 'Deutsch' });
  });

  it('teaches the source and every stable language its name for the new one', () => {
    const set = setOf(
      { ...FR, 'en/lang.json': { 'lang.en': 'English', 'lang.fr': 'French' } },
      { source: 'fr', locales: { en: { stage: 'stable' } } },
    );

    const added = addLocale(set, 'de');

    expect(read(set, 'fr/lang.json')).toEqual({ 'lang.de': 'Allemand', 'lang.fr': 'Français' });
    expect(read(set, 'en/lang.json')['lang.de']).toBe('German');
    expect(added.named).toEqual(['en']);
  });

  it('takes the name it is given over the one it would look up', () => {
    const set = setOf(FR);

    expect(addLocale(set, 'pt-BR', 'Português (Brasil)').name).toBe('Português (Brasil)');
  });

  it('refuses a tag that is not one, and a language that already exists', () => {
    const set = setOf(FR);

    expect(() => addLocale(set, 'german')).toThrow('not a language tag');
    expect(() => addLocale(set, 'fr')).toThrow('already exists');
  });

  it('starts a language of a folder module as one empty file, in the first its source has', () => {
    const set = moduleOf({
      'locales/en/settings.json': { 'settings.title': 'Settings' },
      'locales/en/nav.json': { 'nav.title': 'Notes' },
    });

    addLocale(set, 'de');

    expect(read(set, 'de/nav.json')).toEqual({});
    expect(localesOf(set)).toEqual(['de', 'en']);
  });

  it('keeps that empty file through a sync, so the language stays started', () => {
    const set = moduleOf({ 'locales/en/nav.json': { 'nav.title': 'Notes' } });
    addLocale(set, 'de');

    syncSet(set);

    expect(read(set, 'de/nav.json')).toEqual({});
  });

  it('starts a language of a one-file module as that file, empty', () => {
    const set = moduleOf({ 'locales/en.json': { 'nav.title': 'Notes' } });

    addLocale(set, 'de');

    expect(read(set, 'de.json')).toEqual({});
  });

  it('refuses to start a language of a folder module that has no message yet', () => {
    const set = setOf({ 'notes.json': {} }, { source: 'en' });

    expect(() => addLocale(set, 'de')).toThrow('no en message to translate yet');
  });
});
