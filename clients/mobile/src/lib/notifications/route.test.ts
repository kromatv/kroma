import { describe, expect, it } from 'vitest';
import { mobileRoute } from './route';

describe('mobileRoute', () => {
  it("translates the web catalogue routes to this app's", () => {
    expect(mobileRoute('/movies/ab12')).toBe('/item/ab12');
    expect(mobileRoute('/shows/cd34')).toBe('/show/cd34');
    expect(mobileRoute('/watch/ef56')).toBe('/player/ef56');
    expect(mobileRoute('/downloads')).toBe('/downloads');
  });

  it('sends the library front doors to the home tab', () => {
    expect(mobileRoute('/')).toBe('/');
    expect(mobileRoute('/movies')).toBe('/');
    expect(mobileRoute('/shows')).toBe('/');
  });

  it('still maps the routes the web client used before they were renamed', () => {
    expect(mobileRoute('/movie/ab12')).toBe('/item/ab12');
    expect(mobileRoute('/show/cd34')).toBe('/show/cd34');
    expect(mobileRoute('/films')).toBe('/');
    expect(mobileRoute('/series')).toBe('/');
  });

  it('refuses what this app has no screen for', () => {
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
    expect(mobileRoute('/movies/ab12?from=notification')).toBe('/item/ab12');
    expect(mobileRoute('/movie')).toBeNull();
    expect(mobileRoute('/show')).toBeNull();
    expect(mobileRoute('/watch')).toBeNull();
  });
});
