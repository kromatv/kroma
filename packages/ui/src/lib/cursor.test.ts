import { describe, expect, it } from 'vitest';
import { ARROW, HAND } from './cursor';

describe('the cursors a control and its group wear', () => {
  it('names the hand and the arrow, which React Native has no vocabulary for', () => {
    expect(ARROW).toEqual({ cursor: 'default' });
    expect(HAND).toEqual({ cursor: 'pointer' });
  });

  it('is one object per cursor, so a style array stays identity stable', () => {
    expect(HAND).toBe(HAND);
    expect(ARROW).not.toBe(HAND);
  });
});
