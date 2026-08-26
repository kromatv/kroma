import { describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({ os: 'android' as 'ios' | 'android' | 'web' }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
  },
}));

import { nativeBufferBudget } from './bufferBudget';

describe('nativeBufferBudget', () => {
  it('bounds the android buffer well under a 48 MB heap', () => {
    rn.os = 'android';

    const budget = nativeBufferBudget();

    expect(budget?.maxBufferBytes).toBe(16 * 1024 * 1024);
    expect(budget?.preferredForwardBufferDuration).toBe(20);
  });

  it('leaves apple to its own defaults', () => {
    rn.os = 'ios';

    expect(nativeBufferBudget()).toBeNull();
  });
});
