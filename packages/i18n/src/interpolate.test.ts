import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('replaces tokens with values', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
    expect(interpolate('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });

  it('leaves unknown tokens alone', () => {
    expect(interpolate('Hello {name}!', { other: 'World' })).toBe('Hello {name}!');
  });

  it('handles missing vars', () => {
    expect(interpolate('Hello {name}!')).toBe('Hello {name}!');
  });

  it('leaves a token naming an inherited property alone', () => {
    expect(interpolate('{toString} {constructor}', { name: 'World' })).toBe(
      '{toString} {constructor}',
    );
  });

  it('does not rescan a substituted value that itself looks like a token', () => {
    expect(interpolate('{a}', { a: '{b}', b: '!' })).toBe('{b}');
  });

  it('leaves an unclosed brace alone', () => {
    expect(interpolate('Salut {name', { name: 'Ana' })).toBe('Salut {name');
  });
});
