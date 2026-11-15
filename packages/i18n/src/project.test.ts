import { describe, expect, it } from 'vitest';
import { fallbackChain, isOffered, parentTags, type Project, stageOf } from './project';

const PROJECT: Project = {
  source: 'fr',
  fallback: 'en',
  locales: {
    en: { stage: 'stable' },
    de: { stage: 'beta' },
    gsw: { fallback: 'de' },
    it: { stage: 'live' },
  },
};

const among =
  (...codes: string[]) =>
  (locale: string) =>
    codes.includes(locale);

describe('stageOf', () => {
  it('holds the source language stable whatever the file says', () => {
    expect(stageOf({ source: 'fr', locales: { fr: { stage: 'draft' } } }, 'fr')).toBe('stable');
  });

  it('reads the stage the file gives a locale', () => {
    expect(stageOf(PROJECT, 'en')).toBe('stable');
    expect(stageOf(PROJECT, 'de')).toBe('beta');
  });

  it('drafts a locale the file leaves out, or stages with a word it does not know', () => {
    expect(stageOf(PROJECT, 'ja')).toBe('draft');
    expect(stageOf(PROJECT, 'it')).toBe('draft');
  });
});

describe('isOffered', () => {
  it('offers everything past a draft', () => {
    expect(['fr', 'en', 'de', 'gsw'].map((locale) => isOffered(PROJECT, locale))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('parentTags', () => {
  it('walks a tag up to its language', () => {
    expect(parentTags('zh-Hant-TW')).toEqual(['zh-Hant', 'zh']);
    expect(parentTags('fr')).toEqual([]);
  });
});

describe('fallbackChain', () => {
  it('ends in the fallback and then the source', () => {
    expect(fallbackChain(PROJECT, 'de', among('de', 'en', 'fr'))).toEqual(['de', 'en', 'fr']);
  });

  it('reads a regional locale in its language first', () => {
    expect(fallbackChain(PROJECT, 'pt-BR', among('pt-BR', 'pt', 'en', 'fr'))).toEqual([
      'pt-BR',
      'pt',
      'en',
      'fr',
    ]);
  });

  it('follows the fallback a locale names ahead of the project one', () => {
    expect(fallbackChain(PROJECT, 'gsw', among('gsw', 'de', 'en', 'fr'))).toEqual([
      'gsw',
      'de',
      'en',
      'fr',
    ]);
  });

  it('names only locales that exist, and each of them once', () => {
    expect(fallbackChain(PROJECT, 'en', among('en', 'fr'))).toEqual(['en', 'fr']);
    expect(fallbackChain(PROJECT, 'fr', among('en', 'fr'))).toEqual(['fr', 'en']);
    expect(fallbackChain(PROJECT, 'pt-BR', among('pt-BR', 'fr'))).toEqual(['pt-BR', 'fr']);
  });

  it('still leads with a locale that has no catalog of its own', () => {
    expect(fallbackChain(PROJECT, 'ja', among('en', 'fr'))).toEqual(['ja', 'en', 'fr']);
  });

  it('survives two locales that name each other', () => {
    const looped: Project = {
      source: 'fr',
      locales: { a: { fallback: 'b' }, b: { fallback: 'a' } },
    };

    expect(fallbackChain(looped, 'a', among('a', 'b', 'fr'))).toEqual(['a', 'b', 'fr']);
  });
});
