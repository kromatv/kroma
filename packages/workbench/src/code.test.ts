// The snippet highlighter.
//
// It has no schema to validate against and no error state: whatever it fails to
// recognise is simply painted as plain text, so a mistake here does not throw -
// it silently mis-colours the code samples the whole Props drawer exists to
// show. That is what these pin.

import { describe, expect, it } from 'vitest';
import { lines, tokenize } from './code';

/** The tokens of one kind, in order - the readable form of "what got painted". */
const of = (code: string, kind: string) =>
  tokenize(code)
    .filter((t) => t.kind === kind)
    .map((t) => t.text);

/** Tokenizing must never lose or reorder a character. */
const roundTrips = (code: string) =>
  tokenize(code)
    .map((t) => t.text)
    .join('') === code;

describe('tokenize', () => {
  it('loses nothing: the tokens concatenate back to the input', () => {
    for (const code of [
      '',
      'const a = 1;',
      '<Button variant="primary" onPress={() => go()} />',
      '// just a comment',
      'const s = "he said \\"hi\\"";',
      'x\n\ny  ',
    ]) {
      expect(roundTrips(code), code).toBe(true);
    }
  });

  it('paints keywords, but only whole words', () => {
    expect(of('const x = 1', 'keyword')).toEqual(['const']);
    // `constant` merely starts with one.
    expect(of('constant = 1', 'keyword')).toEqual([]);
  });

  it('paints both comment forms', () => {
    expect(of('// line\nconst a = 1', 'comment')).toEqual(['// line']);
    expect(of('/* block\n spanning */ const a = 1', 'comment')).toEqual(['/* block\n spanning */']);
  });

  it('paints all three string forms, escapes included', () => {
    expect(of('"a" + \'b\' + `c`', 'string')).toEqual(['"a"', "'b'", '`c`']);
    // The escaped quote does not end the string.
    expect(of('const s = "he said \\"hi\\"";', 'string')).toEqual(['"he said \\"hi\\""']);
  });

  it('paints a JSX tag but not a less-than', () => {
    expect(of('<Button />', 'tag')).toEqual(['<Button']);
    expect(of('</Box>', 'tag')).toEqual(['</Box']);
    expect(of('a < b', 'tag')).toEqual([]);
  });

  it('paints an attribute name, and does not mistake a comparison for one', () => {
    expect(of('<Box variant="a" />', 'attr')).toEqual(['variant']);
    expect(of('if (a === b)', 'attr')).toEqual([]);
  });

  it('paints numbers and braces', () => {
    expect(of('const n = 1.5', 'number')).toEqual(['1.5']);
    expect(of('f({ a: [1] })', 'brace')).toEqual(['(', '{', '[', ']', '}', ')']);
  });

  it('leaves an unsupported construct uncoloured rather than mangled', () => {
    const code = 'const re = /a{2,}/gu;';
    expect(roundTrips(code)).toBe(true);
  });

  // The shape this replaced was `(?:[^"\\]|\\.)*`, whose two branches can claim
  // the same characters: an unterminated string made it backtrack quadratically.
  // The unrolled form cannot, so a pathological input stays fast.
  it('does not hang on a long unterminated string', () => {
    const code = `const s = "${'a\\'.repeat(20_000)}`;
    const started = Date.now();
    expect(roundTrips(code)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe('lines', () => {
  it('splits tokens across lines without losing the text', () => {
    const rows = lines('const a = 1;\nconst b = 2;');
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.map((t) => t.text).join(''))).toEqual([
      'const a = 1;',
      'const b = 2;',
    ]);
  });

  it('keeps a blank line as a row of its own', () => {
    expect(lines('a\n\nb')).toHaveLength(3);
  });

  it('carries a multi-line comment across the rows it spans', () => {
    const rows = lines('/* one\n   two */');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.every((t) => t.kind === 'comment'))).toBe(true);
  });
});
