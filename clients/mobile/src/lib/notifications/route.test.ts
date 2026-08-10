// Where a notification's link goes on a phone. The server writes links for
// the WEB app's routes, and the two clients don't name their screens alike,
// so an unmapped route must be recognisable as such — the row hides its
// buttons rather than leaving a dead tap.

import { describe, expect, it } from 'vitest';
import { mobileRoute } from './route';

describe('mobileRoute', () => {
  it('translates the web catalogue routes to this app s', () => {
    expect(mobileRoute('/movie/ab12')).toBe('/item/ab12');
    expect(mobileRoute('/show/cd34')).toBe('/show/cd34');
    // The browser watches at /watch, the phone plays at /player.
    expect(mobileRoute('/watch/ef56')).toBe('/player/ef56');
    expect(mobileRoute('/downloads')).toBe('/downloads');
  });

  it('sends the library front doors to the home tab', () => {
    expect(mobileRoute('/')).toBe('/');
    expect(mobileRoute('/films')).toBe('/');
    expect(mobileRoute('/series')).toBe('/');
  });

  it('refuses what this app has no screen for', () => {
    // The console is web-only: better no button than one that goes nowhere.
    expect(mobileRoute('/admin/requests')).toBeNull();
    expect(mobileRoute('/admin/jobs')).toBeNull();
    expect(mobileRoute('/requests')).toBeNull();
  });

  it('is not fooled by a missing, empty or foreign link', () => {
    expect(mobileRoute(undefined)).toBeNull();
    expect(mobileRoute(null)).toBeNull();
    expect(mobileRoute('')).toBeNull();
    expect(mobileRoute('https://elsewhere.example/movie/ab12')).toBeNull();
  });

  it('keeps the id and drops the query a route cannot carry', () => {
    expect(mobileRoute('/movie/ab12?from=notification')).toBe('/item/ab12');
    // A head with no id is not a screen.
    expect(mobileRoute('/movie')).toBeNull();
    expect(mobileRoute('/show')).toBeNull();
    expect(mobileRoute('/watch')).toBeNull();
  });
});
