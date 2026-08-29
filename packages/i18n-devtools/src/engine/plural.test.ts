import { afterEach, describe, expect, it } from 'vitest';
import { testEngine } from '../testing';
import { setEngine } from './engine';
import { categoryOf } from './plural';

afterEach(() => {
  setEngine(null);
});

describe('the plural category a count falls in', () => {
  it('takes the engine at its word where it names one', () => {
    setEngine(testEngine({ categoryOf: () => 'cy-3' }));

    expect(categoryOf('cy', 3)).toBe('cy-3');
  });

  it('falls back to CLDR where the engine names none', () => {
    setEngine(testEngine({ categoryOf: () => '' }));

    expect([categoryOf('fr', 1), categoryOf('fr', 4)]).toEqual(['one', 'other']);
  });

  it('falls back to CLDR for an engine that does not answer at all', () => {
    setEngine(testEngine());

    expect(categoryOf('en', 2)).toBe('other');
  });

  it('reads a locale CLDR knows, plural or singular', () => {
    expect([categoryOf('en', 1), categoryOf('en', 7)]).toEqual(['one', 'other']);
  });

  it('answers for a locale Intl cannot parse, counting one as one', () => {
    expect([categoryOf('not a locale', 1), categoryOf('not a locale', 2)]).toEqual([
      'one',
      'other',
    ]);
  });

  it('asks Intl once per locale, answering the same either time', () => {
    expect([categoryOf('de', 1), categoryOf('de', 1)]).toEqual(['one', 'one']);
  });
});
