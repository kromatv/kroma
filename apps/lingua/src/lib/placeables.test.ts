import { tokensIn } from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { REF } from '#site/core/checks';
import { insertAt, nextMissing, partsOf, variablesOf } from './placeables';

describe('partsOf', () => {
  it('cuts a message into text, placeholders and references, in order', () => {
    expect(partsOf('{count} of $t(media.films) on {free} GB')).toEqual([
      { kind: 'placeholder', value: '{count}', name: 'count', at: 0 },
      { kind: 'text', value: ' of ', at: 7 },
      { kind: 'ref', value: '$t(media.films)', name: 'media.films', at: 11 },
      { kind: 'text', value: ' on ', at: 26 },
      { kind: 'placeholder', value: '{free}', name: 'free', at: 30 },
      { kind: 'text', value: ' GB', at: 36 },
    ]);
  });

  it('keeps a message with nothing to fill in as one run of text', () => {
    expect(partsOf('Play')).toEqual([{ kind: 'text', value: 'Play', at: 0 }]);
  });

  it('has no run at all for an empty message', () => {
    expect(partsOf('')).toEqual([]);
  });

  it('leaves braces that are not a placeholder as text', () => {
    expect(partsOf('{ not one } {a-b} {}')).toEqual([
      { kind: 'text', value: '{ not one } {a-b} {}', at: 0 },
    ]);
  });

  it('reads a reference spaced inside its parentheses', () => {
    expect(partsOf('$t( a.b )')).toEqual([{ kind: 'ref', value: '$t( a.b )', name: 'a.b', at: 0 }]);
  });

  it('finds a placeholder written twice at each place', () => {
    expect(partsOf('{n}+{n}').map((part) => [part.kind, part.at])).toEqual([
      ['placeholder', 0],
      ['text', 3],
      ['placeholder', 4],
    ]);
  });

  it('finds exactly the placeholders and references the server checks', () => {
    const texts = ['{a}{b}', 'x {c} $t(k.l) {c}', '{{d}}', '$t(m) {e_f} {g h}', '{1}'];

    for (const text of texts) {
      const parts = partsOf(text);
      expect(parts.flatMap((p) => (p.kind === 'placeholder' ? [p.name] : []))).toEqual(
        tokensIn(text),
      );
      expect(parts.flatMap((p) => (p.kind === 'ref' ? [p.name] : []))).toEqual(
        [...text.matchAll(REF)].map((m) => m[1]),
      );
      expect(parts.map((p) => p.value).join('')).toBe(text);
    }
  });
});

describe('variablesOf', () => {
  it('marks each placeholder of the source present or missing in the translation', () => {
    expect(variablesOf('{free} of {total} GB', 'Libre : {free}', { plural: false })).toEqual([
      { name: 'free', value: '{free}', state: 'present' },
      { name: 'total', value: '{total}', state: 'missing' },
    ]);
  });

  it('flags a placeholder the source does not have', () => {
    expect(variablesOf('{count} items', '{count} {things}', { plural: false })).toEqual([
      { name: 'count', value: '{count}', state: 'present' },
      { name: 'things', value: '{things}', state: 'unknown' },
    ]);
  });

  it('lets a plural form leave its count out, or write one its source lacks', () => {
    expect(variablesOf('{count} items', 'Un élément', { plural: true })).toEqual([
      { name: 'count', value: '{count}', state: 'optional' },
    ]);
    expect(variablesOf('One item', '{count} élément', { plural: true })).toEqual([]);
  });

  it('lists a placeholder once however often it is written', () => {
    expect(variablesOf('{n} and {n}', '{n}', { plural: false })).toEqual([
      { name: 'n', value: '{n}', state: 'present' },
    ]);
  });
});

describe('nextMissing', () => {
  it('picks the first missing placeholder', () => {
    expect(nextMissing(variablesOf('{a} {b} {c}', '{a}', { plural: false }))?.name).toBe('b');
  });

  it('falls back to the optional count of a plural form', () => {
    expect(nextMissing(variablesOf('{count} items', '', { plural: true }))?.name).toBe('count');
  });

  it('has nothing to insert once every placeholder is there', () => {
    expect(nextMissing(variablesOf('{a}', '{a}', { plural: false }))).toBeNull();
  });
});

describe('insertAt', () => {
  it('puts the token at the caret and moves the caret after it', () => {
    expect(insertAt('Libre  Go', { start: 6, end: 6 }, '{free}')).toEqual({
      value: 'Libre {free} Go',
      caret: 12,
    });
  });

  it('replaces the selected text', () => {
    expect(insertAt('Hello world', { start: 6, end: 11 }, '{name}')).toEqual({
      value: 'Hello {name}',
      caret: 12,
    });
  });

  it('appends without a caret', () => {
    expect(insertAt('Total :', null, ' {total}')).toEqual({ value: 'Total : {total}', caret: 15 });
  });

  it('keeps a caret past the end, or a reversed range, inside the text', () => {
    expect(insertAt('ab', { start: 9, end: 1 }, 'X')).toEqual({ value: 'abX', caret: 3 });
  });
});
