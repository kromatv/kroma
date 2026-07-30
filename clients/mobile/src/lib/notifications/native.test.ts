// `expo-notifications` calls `requireNativeModule()` at module scope, which
// throws when the module is not in the running binary. The runner is such an
// environment, so these tests exercise the absent branch for real; the present
// branch cannot be simulated in node, since `vi.mock` does not intercept the
// CommonJS `require` this module must use.

import { describe, expect, it } from 'vitest';

describe('reaching expo-notifications where it is not', () => {
  it('imports without throwing', async () => {
    await expect(import('./native')).resolves.toBeDefined();
  });

  it('answers null, which every caller reads as "push is unavailable here"', async () => {
    const { push } = await import('./native');
    expect(push()).toBeNull();
  });

  it('gives the same answer every time, without retrying the require', async () => {
    const { push } = await import('./native');
    expect(push()).toBe(push());
  });
});
