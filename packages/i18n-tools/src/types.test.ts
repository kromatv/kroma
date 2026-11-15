import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { has, moduleOf, removeSets, setOf } from './fixture.ts';
import { writeTypes } from './types.ts';

afterEach(removeSets);

describe('writeTypes', () => {
  it('declares the keys of a module that keeps one folder per language beside its front end', () => {
    const set = moduleOf({
      'locales/en/nav.json': { 'nav.title': 'Notes' },
      'locales/en/settings/advanced.json': { 'settings.port': 'Port {port}' },
    });
    const path = join(set.dir, '..', 'ui', 'src', 'messages.d.ts');

    const moved = writeTypes([set]);

    const text = readFileSync(path, 'utf8');
    expect(moved).toEqual([path]);
    expect(text).toContain("declare module '@kromatv/module-sdk' {");
    expect(text).toContain("'settings.port': { port: V };");
    expect(has(set, 'messages.d.ts')).toBe(false);
  });

  it('declares the same keys for a module that keeps one file per language', () => {
    const folders = moduleOf({ 'locales/en/nav.json': { 'nav.title': 'Notes' } });
    const files = moduleOf({ 'locales/en.json': { 'nav.title': 'Notes' } });

    writeTypes([folders, files]);

    expect(readFileSync(join(folders.dir, '..', 'ui', 'src', 'messages.d.ts'), 'utf8')).toBe(
      readFileSync(join(files.dir, '..', 'ui', 'src', 'messages.d.ts'), 'utf8'),
    );
  });

  it('writes the declaration of the app beside the policy file it is rendered from', () => {
    const set = setOf({ 'i18n.json': { source: 'fr' }, 'fr/nav.json': { 'nav.home': 'Accueil' } });

    expect(writeTypes([set])).toEqual([join(set.dir, 'messages.d.ts')]);
  });

  it('writes nothing for a set that has neither a front end nor a policy file', () => {
    const set = setOf({ 'en/nav.json': { 'nav.title': 'Notes' } }, { source: 'en' });

    expect(writeTypes([set])).toEqual([]);
  });

  it('writes nothing the second time', () => {
    const set = moduleOf({ 'locales/en/nav.json': { 'nav.title': 'Notes' } });
    writeTypes([set]);

    expect(writeTypes([set])).toEqual([]);
  });
});
