import { describe, expect, it } from 'vitest';
import { safeRedirect } from '#web/shared/lib/safe-redirect';

describe('safeRedirect', () => {
  it('keeps a path inside the site, query and all', () => {
    expect(safeRedirect('/movies/42?tab=cast')).toBe('/movies/42?tab=cast');
    expect(safeRedirect('/')).toBe('/');
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', 'movies', '', 42, null, undefined])(
    'refuses %s, which is not a path inside the site',
    (value) => {
      expect(safeRedirect(value)).toBeUndefined();
    },
  );

  it('refuses the pages that only sign someone in, which would loop', () => {
    expect(safeRedirect('/login')).toBeUndefined();
    expect(safeRedirect('/login?redirect=/movies')).toBeUndefined();
    expect(safeRedirect('/sso?flow=f1')).toBeUndefined();
  });
});
