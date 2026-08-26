import { describe, expect, it } from 'vitest';
import { resolvePluralKey, selectCategory } from './plural';

describe('selectCategory', () => {
  it('follows CLDR, which puts zero in one for French and in other for English', () => {
    expect(selectCategory('fr', 0)).toBe('one');
    expect(selectCategory('en', 0)).toBe('other');
    expect(selectCategory('fr', 1)).toBe('one');
    expect(selectCategory('en', 1)).toBe('one');
    expect(selectCategory('en', 2)).toBe('other');
  });

  it('defers to a supplied rule', () => {
    expect(selectCategory('fr', 0, () => 'other')).toBe('other');
  });
});

describe('resolvePluralKey', () => {
  it('picks the variant for the category count falls in', () => {
    const en = { n: '{count} items', n_one: '{count} item' };

    expect(resolvePluralKey(en, 'en', 'n', { count: 1 })).toBe('n_one');
    expect(resolvePluralKey(en, 'en', 'n', { count: 3 })).toBe('n');
  });

  it('never reaches past the catalog it was given', () => {
    const en = { n: '{count} items' };

    expect(resolvePluralKey(en, 'en', 'n', { count: 1 })).toBe('n');
  });

  it('prefers an explicit zero variant over the category', () => {
    const en = { n: '{count} items', n_one: '{count} item', n_zero: 'Nothing yet' };

    expect(resolvePluralKey(en, 'en', 'n', { count: 0 })).toBe('n_zero');
    expect(resolvePluralKey(en, 'en', 'n', { count: 1 })).toBe('n_one');
  });

  it('lets a French zero take the zero variant ahead of its one category', () => {
    const fr = { n: '{count} objets', n_one: '{count} objet', n_zero: 'Aucun objet' };

    expect(resolvePluralKey(fr, 'fr', 'n', { count: 0 })).toBe('n_zero');
  });

  it('falls back to the other variant when the category has no entry', () => {
    const en = { apples_other: '{count} apples' };

    expect(resolvePluralKey(en, 'ru', 'apples', { count: 3 })).toBe('apples_other');
  });

  it('pluralises on a variable that is not called count', () => {
    const en = { moved: '{files} files', moved_files_one: '{files} file' };

    expect(resolvePluralKey(en, 'en', 'moved', { files: 1 })).toBe('moved_files_one');
    expect(resolvePluralKey(en, 'en', 'moved', { files: 4 })).toBe('moved');
  });

  it('gives count priority so a second numeric variable cannot take over', () => {
    const en = {
      both: '{count} of {files}',
      both_one: 'one of {files}',
      both_files_one: '{count} of one',
    };

    expect(resolvePluralKey(en, 'en', 'both', { count: 1, files: 1 })).toBe('both_one');
  });

  it('ignores a non-numeric variable', () => {
    const en = { hi: 'Hello {name}', hi_one: 'nope' };

    expect(resolvePluralKey(en, 'en', 'hi', { name: 'Ana' })).toBe('hi');
  });

  it('returns the bare key when nothing is declared', () => {
    const en = { hi: 'Hello' };

    expect(resolvePluralKey(en, 'en', 'hi', { count: 2 })).toBe('hi');
  });
});
