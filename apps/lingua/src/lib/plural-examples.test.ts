import { describe, expect, it } from 'vitest';
import { placeableHint, pluralExamples } from './plural-examples';

describe('pluralExamples', () => {
  it('lists the counts each form takes', () => {
    expect(pluralExamples('en', 'one')).toBe('1');
    expect(pluralExamples('en', 'other')).toBe('0, 2, 3…');
    expect(pluralExamples('fr', 'one')).toBe('0, 1');
    expect(pluralExamples('pl', 'few')).toBe('2, 3, 4…');
  });

  it('has nothing for a form the language does not take, or a tag Intl refuses', () => {
    expect(pluralExamples('en', 'few')).toBe('');
    expect(pluralExamples('not a tag!', 'one')).toBe('');
  });
});

describe('placeableHint', () => {
  it('says what a placeholder and a reference become', () => {
    expect(placeableHint({ kind: 'placeholder', name: 'free' }, { plural: false })).toBe(
      'Replaced when shown, e.g. by a name or a number. Keep it as written.',
    );
    expect(placeableHint({ kind: 'placeholder', name: 'count' }, { plural: false })).toBe(
      'Replaced by a number when shown. Keep it as written.',
    );
    expect(placeableHint({ kind: 'ref', name: 'media.films' }, { plural: false })).toBe(
      'Inserts the message media.films. Keep it as written.',
    );
  });

  it('lets a plural form write its count out', () => {
    expect(placeableHint({ kind: 'placeholder', name: 'count' }, { plural: true })).toContain(
      'write the number out',
    );
  });
});
