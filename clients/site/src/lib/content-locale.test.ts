import { describe, expect, it } from 'vitest';
import { CONTENT_FALLBACK_LANG, groupByName, parseContentPath, pickLocale } from './content-locale';

describe('parseContentPath', () => {
  it('reads a locale suffix', () => {
    expect(parseContentPath('../../content/blog/my-post.fr.mdx')).toEqual({
      name: 'my-post',
      lang: 'fr',
    });
  });

  it('treats a bare name as the fallback language', () => {
    expect(parseContentPath('../../content/blog/my-post.mdx')).toEqual({
      name: 'my-post',
      lang: CONTENT_FALLBACK_LANG,
    });
  });

  it('accepts an explicit suffix for the fallback language too', () => {
    expect(parseContentPath('../../content/legal/privacy.en.mdx')).toEqual({
      name: 'privacy',
      lang: 'en',
    });
  });

  // The reason the suffix is matched against the locale list rather than "the last
  // dotted segment": a version number is part of the name, not a language.
  it('keeps a trailing segment that is not a locale in the name', () => {
    expect(parseContentPath('../../content/blog/release.2.mdx')).toEqual({
      name: 'release.2',
      lang: CONTENT_FALLBACK_LANG,
    });
  });

  it('ignores the directories above the file', () => {
    expect(parseContentPath('/any/where/at/all/deep.fr.mdx').name).toBe('deep');
  });
});

describe('pickLocale', () => {
  it('prefers the requested locale', () => {
    expect(pickLocale({ en: 'english', fr: 'french' }, 'fr')).toBe('french');
  });

  it('falls back to the fallback language when a translation is missing', () => {
    expect(pickLocale({ en: 'english' }, 'fr')).toBe('english');
  });

  // A document is never hidden for lack of a translation, even when the fallback
  // language itself is the one that was never written.
  it('serves whatever exists when even the fallback is missing', () => {
    expect(pickLocale({ fr: 'french' }, 'en')).toBe('french');
  });

  it('is undefined only when nothing exists', () => {
    expect(pickLocale({}, 'en')).toBeUndefined();
  });
});

describe('groupByName', () => {
  it('groups every locale of a document under one name', () => {
    const grouped = groupByName({
      '../../content/blog/one.mdx': 'one-en',
      '../../content/blog/one.fr.mdx': 'one-fr',
      '../../content/blog/two.mdx': 'two-en',
    });

    expect([...grouped.keys()].sort()).toEqual(['one', 'two']);
    expect(grouped.get('one')).toEqual({ en: 'one-en', fr: 'one-fr' });
    expect(grouped.get('two')).toEqual({ en: 'two-en' });
  });

  it('is empty for an empty glob', () => {
    expect(groupByName({}).size).toBe(0);
  });
});
