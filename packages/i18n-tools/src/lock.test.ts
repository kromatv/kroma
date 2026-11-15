import { describe, expect, it } from 'vitest';
import { digest, type Lock, parseLock, renderLock, sameLock } from './lock.ts';

describe('digest', () => {
  it('is the same for the same templates in any order', () => {
    expect(digest({ key: 'a', forms: { a: 'x', a_one: 'y' } })).toBe(
      digest({ key: 'a', forms: { a_one: 'y', a: 'x' } }),
    );
  });

  it('moves when any template of the message moves', () => {
    expect(digest({ key: 'a', forms: { a: 'x', a_one: 'y' } })).not.toBe(
      digest({ key: 'a', forms: { a: 'x', a_one: 'z' } }),
    );
  });

  it('stays put when the message is renamed', () => {
    expect(digest({ key: 'a', forms: { a: 'x', a_one: 'y' } })).toBe(
      digest({ key: 'b', forms: { b: 'x', b_one: 'y' } }),
    );
  });
});

describe('a lock', () => {
  it('reads back what it wrote, keys in order', () => {
    const lock: Lock = new Map([
      ['nav.home', { source: 'aaaaaaaa', translation: 'bbbbbbbb' }],
      ['cart.pay', { source: 'cccccccc', translation: 'dddddddd' }],
    ]);

    const text = renderLock(lock);

    expect(sameLock(parseLock(text), lock)).toBe(true);
    expect(text.indexOf('cart.pay')).toBeLessThan(text.indexOf('nav.home'));
  });

  it('refuses a file of another version', () => {
    expect(() => parseLock('{ "version": 2, "messages": {} }')).toThrow();
  });

  it('differs from one whose translation moved', () => {
    const before: Lock = new Map([['a', { source: 'aaaaaaaa', translation: 'bbbbbbbb' }]]);
    const after: Lock = new Map([['a', { source: 'aaaaaaaa', translation: 'cccccccc' }]]);

    expect(sameLock(before, after)).toBe(false);
  });
});
