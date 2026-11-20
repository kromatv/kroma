import { describe, expect, it } from 'vitest';
import { hasRail, RAIL_WIDTH, railInset } from './rail';

describe('the rail beside the app', () => {
  it.each(['lg', 'tv'] as const)(
    'is shown on a %s screen and pushes the bar clear of it',
    (step) => {
      expect(hasRail(step)).toBe(true);
      expect(railInset(step)).toBe(RAIL_WIDTH);
    },
  );

  it.each(['base', 'md'] as const)('is hidden on a %s screen and pushes nothing', (step) => {
    expect(hasRail(step)).toBe(false);
    expect(railInset(step)).toBe(0);
  });
});
