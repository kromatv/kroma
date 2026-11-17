import { describe, expect, it } from 'vitest';
import { ago } from './ago';

describe('ago', () => {
  it('says how long ago a time was in the largest whole unit', () => {
    expect(ago(1000, 1030)).toBe('just now');
    expect(ago(1000, 1000 + 3 * 60 + 20)).toBe('3 minutes ago');
    expect(ago(1000, 1000 + 2 * 3600)).toBe('2 hours ago');
    expect(ago(1000, 1000 + 86_400)).toBe('yesterday');
  });

  it('never says a time is in the future', () => {
    expect(ago(2000, 1000)).toBe('just now');
  });
});
