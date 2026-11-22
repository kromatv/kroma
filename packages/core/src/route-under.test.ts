import { describe, expect, it } from 'vitest';
import { routeUnder } from './route-under';

describe('a route under one of a few roots', () => {
  it('is the root itself or a page below it', () => {
    expect(routeUnder('/account', ['/account'])).toBe(true);
    expect(routeUnder('/discover/movie/603', ['/account', '/discover'])).toBe(true);
  });

  it('is never a page that only starts with the same letters', () => {
    expect(routeUnder('/accounts-help', ['/account'])).toBe(false);
    expect(routeUnder('/', ['/account'])).toBe(false);
  });
});
