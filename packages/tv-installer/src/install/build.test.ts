import { describe, expect, it } from 'vitest';
import { buildable } from './build';

describe('buildable', () => {
  it('builds a shell whose sources are in this checkout', () => {
    expect(buildable('clients/tizen')).toBe(true);
  });

  it('refuses a shell this checkout carries no sources for', () => {
    expect(buildable('clients/betamax')).toBe(false);
  });
});
