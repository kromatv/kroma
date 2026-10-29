import { describe, expect, it } from 'vitest';
import { mobileRoute, subjectRoute } from './route';

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

describe('subjectRoute', () => {
  it('opens the screen for what the notification is about', () => {
    expect(subjectRoute({ kind: 'movie', id: 'ab12' })).toBe('/item/ab12');
    expect(subjectRoute({ kind: 'episode', id: 'ep1' })).toBe('/item/ep1');
    expect(subjectRoute({ kind: 'show', id: 'cd34' })).toBe('/show/cd34');
  });

  it('refuses the kinds this app has no screen for', () => {
    expect(subjectRoute({ kind: 'request', id: 'req-7' })).toBeNull();
    expect(subjectRoute({ kind: 'report', id: 'rep1' })).toBeNull();
    expect(subjectRoute({ kind: 'job', id: 'library.scan' })).toBeNull();
    expect(subjectRoute({ kind: 'tv.kroma.torrents/torrent', id: 'abc' })).toBeNull();
  });

  it('has nowhere to go for a row written before subjects existed', () => {
    expect(subjectRoute(undefined)).toBeNull();
    expect(subjectRoute({ kind: 'movie', id: '' })).toBeNull();
  });
});
