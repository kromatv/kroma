import { describe, expect, it } from 'vitest';

describe('the Metro half of the history pair', () => {
  it('carries no history, because a television has no git to read one from', async () => {
    const { HISTORY } = await import('./kit-history');
    expect(HISTORY).toBeUndefined();
  });

  it('exports the name its Vite twin does, so a caller needs no platform branch', async () => {
    const native = await import('./kit-history');
    expect(Object.hasOwn(native, 'HISTORY')).toBe(true);
  });
});
