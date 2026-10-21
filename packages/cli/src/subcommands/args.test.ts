import { describe, expect, it } from 'vitest';
import { list, text } from './args';

describe('text', () => {
  it('keeps a non-empty string', () => {
    expect(text('x')).toBe('x');
  });

  it('drops an empty string and any other type', () => {
    expect([text(''), text(3), text(undefined)]).toEqual([undefined, undefined, undefined]);
  });
});

describe('list', () => {
  it('stringifies each item of an array', () => {
    expect(list(['a', 2])).toEqual(['a', '2']);
  });

  it('wraps a lone string and drops an empty one', () => {
    expect([list('a'), list(''), list(undefined)]).toEqual([['a'], [], []]);
  });
});
