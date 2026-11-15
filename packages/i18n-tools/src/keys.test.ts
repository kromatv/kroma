import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncSet } from './edit.ts';
import { has, read, removeSets, setOf, write } from './fixture.ts';
import { createMessage, homeFor, removeMessage, renameMessage, rewriteLiterals } from './keys.ts';
import { inspectLocale, readSource } from './status.ts';

afterEach(removeSets);

const SPLIT = {
  'fr/admin.json': { 'admin.title': 'Console' },
  'fr/admin/backup.json': { 'admin.backupNow': 'Sauvegarder' },
  'en/admin.json': { 'admin.title': 'Console' },
  'en/admin/backup.json': { 'admin.backupNow': 'Back up now' },
};

describe('homeFor', () => {
  it('puts a new message beside the keys it looks most like', () => {
    const set = setOf(SPLIT);

    expect(homeFor(set, readSource(set), 'admin.backupRetention')).toBe('admin/backup');
  });

  it('starts a namespace nobody has written in yet as a file of its name', () => {
    const set = setOf(SPLIT);

    expect(homeFor(set, readSource(set), 'cart.pay')).toBe('cart');
  });
});

describe('createMessage', () => {
  it('writes the message in every language given, in key order', () => {
    const set = setOf(SPLIT);

    const created = createMessage(set, 'admin.backupAll', {
      fr: 'Tout sauvegarder',
      en: 'Back up all',
    });

    expect(created).toEqual({ file: 'admin/backup', locales: ['fr', 'en'] });
    expect(Object.keys(read(set, 'fr/admin/backup.json'))).toEqual([
      'admin.backupAll',
      'admin.backupNow',
    ]);
    expect(read(set, 'en/admin/backup.json')['admin.backupAll']).toBe('Back up all');
  });

  it('goes in the file it is told to', () => {
    const set = setOf(SPLIT);

    createMessage(set, 'admin.users', { fr: 'Comptes' }, 'admin/users');

    expect(read(set, 'fr/admin/users.json')).toEqual({ 'admin.users': 'Comptes' });
  });

  it('refuses a key that exists, a text missing in the source language, and a foreign file', () => {
    const set = setOf(SPLIT);

    expect(() => createMessage(set, 'admin.title', { fr: 'x' })).toThrow('already exists');
    expect(() => createMessage(set, 'admin.new', { en: 'x' })).toThrow('starts in fr');
    expect(() => createMessage(set, 'admin.new', { fr: 'x' }, 'nav')).toThrow(
      'its namespace is admin',
    );
  });
});

describe('renameMessage', () => {
  it('renames a message and its plural variants in every language', () => {
    const set = setOf({
      'fr/cart.json': { 'cart.items': '{count} articles', 'cart.items_one': 'Un article' },
      'en/cart.json': { 'cart.items': '{count} items', 'cart.items_one': 'One item' },
    });

    const touched = renameMessage(set, 'cart.items', 'cart.lines');

    expect(touched).toEqual(['en', 'fr']);
    expect(read(set, 'en/cart.json')).toEqual({
      'cart.lines': '{count} items',
      'cart.lines_one': 'One item',
    });
  });

  it('keeps a translation outdated or current as it was', () => {
    const set = setOf({
      'fr/nav.json': { 'nav.home': 'Accueil' },
      'en/nav.json': { 'nav.home': 'Home' },
    });
    syncSet(set);
    write(set, 'fr/nav.json', { 'nav.home': 'Maison' });

    renameMessage(set, 'nav.home', 'nav.start');

    expect(inspectLocale(set, readSource(set), 'en').outdated).toEqual(['nav.start']);
  });

  it('moves the message to the file of its new namespace', () => {
    const set = setOf({
      ...SPLIT,
      'fr/nav.json': { 'nav.backups': 'Sauvegardes' },
      'en/nav.json': { 'nav.backups': 'Backups' },
    });

    renameMessage(set, 'nav.backups', 'admin.backupList');

    expect(read(set, 'en/admin/backup.json')['admin.backupList']).toBe('Backups');
    expect(has(set, 'en/nav.json')).toBe(false);
  });

  it('refuses a key that is no message, or a name that is taken', () => {
    const set = setOf(SPLIT);

    expect(() => renameMessage(set, 'admin.nope', 'admin.x')).toThrow('is no message');
    expect(() => renameMessage(set, 'admin.title', 'admin.backupNow')).toThrow('already exists');
  });
});

describe('removeMessage', () => {
  it('deletes the message and its variants from every language', () => {
    const set = setOf({
      'fr/cart.json': { 'cart.items': 'a', 'cart.items_one': 'b', 'cart.pay': 'Payer' },
      'ru/cart.json': { 'cart.items': 'c', 'cart.items_few': 'd' },
    });

    const touched = removeMessage(set, 'cart.items');

    expect(touched).toEqual(['fr', 'ru']);
    expect(read(set, 'fr/cart.json')).toEqual({ 'cart.pay': 'Payer' });
    expect(has(set, 'ru/cart.json')).toBe(false);
  });
});

describe('rewriteLiterals', () => {
  it('replaces the key where it is a whole string literal, in any quote', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kroma-i18n-code-'));
    const file = join(dir, 'page.tsx');
    writeFileSync(file, "t('nav.home'); t(\"nav.home\"); t(`nav.home`); t('nav.homeTitle');");

    const changed = rewriteLiterals([file], 'nav.home', 'nav.start');

    expect(changed).toEqual([file]);
    expect(readFileSync(file, 'utf8')).toBe(
      "t('nav.start'); t(\"nav.start\"); t(`nav.start`); t('nav.homeTitle');",
    );
  });
});
