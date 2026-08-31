import { describe, expect, it } from 'vitest';
import { holdCursor } from './resizable-cursor';

describe('holdCursor on a platform with no cursor to hold', () => {
  it('takes nothing, and gives back a release that does nothing', () => {
    const release = holdCursor('vertical');

    expect(release).toBeTypeOf('function');
    expect(() => release()).not.toThrow();
  });

  it('answers either orientation with the same do-nothing release', () => {
    expect(holdCursor('horizontal')).toBe(holdCursor('vertical'));
  });
});
