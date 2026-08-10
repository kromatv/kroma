import { describe, expect, it } from 'vitest';
import { blockerOf, PUSH_BLOCKER_LABEL } from './push-labels';

describe('blockerOf', () => {
  it('recognizes every reason the label table names', () => {
    for (const reason of Object.keys(PUSH_BLOCKER_LABEL)) {
      expect(blockerOf(new Error(reason))).toBe(reason);
    }
  });

  it('is null for a failure that names no blocker', () => {
    expect(blockerOf(new Error('Failed to fetch'))).toBeNull();
    expect(blockerOf(new Error(''))).toBeNull();
  });

  it('is null for anything that is not an Error', () => {
    expect(blockerOf('denied')).toBeNull();
    expect(blockerOf(null)).toBeNull();
    expect(blockerOf(undefined)).toBeNull();
  });
});
