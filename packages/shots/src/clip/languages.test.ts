import { describe, expect, it } from 'vitest';
import { offeredLanguages, productLanguages } from './languages';

const REPO = new URL('../../../..', import.meta.url).pathname;

describe('the languages a sweep reads the screens in', () => {
  it('are the source language, then every locale past draft in the order listed', () => {
    const policy = {
      source: 'en',
      locales: { fr: { stage: 'stable' }, ko: { stage: 'beta' }, it: { stage: 'draft' } },
    };

    expect(offeredLanguages(policy)).toEqual(['en', 'fr', 'ko']);
  });

  it('leave out a locale the policy names without a stage', () => {
    expect(offeredLanguages({ source: 'en', locales: { nl: { fallback: 'de' } } })).toEqual(['en']);
  });

  it('are the source language alone for a policy that lists no locale', () => {
    expect(offeredLanguages({ source: 'fr' })).toEqual(['fr']);
  });

  it('refuse a policy with no source language', () => {
    expect(() => offeredLanguages({ locales: {} })).toThrow();
  });

  it('start with English for the product', () => {
    expect(productLanguages(REPO)[0]).toBe('en');
  });
});
