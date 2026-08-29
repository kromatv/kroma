import { describe, expect, it } from 'vitest';
import { answer, catalogue, deviceEntries, SESSION_ENTRIES } from './stub';

const MOVIES = catalogue(2);

function body(path: string): unknown {
  return JSON.parse(answer(`http://probe.local/api${path}`, MOVIES).body);
}

describe('the stubbed server', () => {
  it('builds films the app can parse, each one distinct', () => {
    const films = catalogue(3);

    expect(films.map((film) => film.title)).toEqual(['Film 0', 'Film 1', 'Film 2']);
    expect(new Set(films.map((film) => film.id)).size).toBe(3);
  });

  it('answers every call as JSON, whatever was asked for', () => {
    expect(answer('http://probe.local/api/movies', MOVIES)).toMatchObject({
      status: 200,
      contentType: 'application/json',
    });
  });

  it('signs the run in as the account the device already holds', () => {
    const session = deviceEntries('http://probe.local', 'fr');

    expect(body('/auth/token')).toMatchObject({ token: 'probe-bearer' });
    expect(session['kroma.session']).toContain('probe-user');
  });

  it('serves the films on the one populated catalogue', () => {
    expect(body('/movies')).toHaveLength(2);
  });

  it('answers an empty list rather than nothing for the lists it leaves bare', () => {
    expect(body('/shows')).toEqual([]);
    expect(body('/continue')).toEqual([]);
  });

  it('has no featured title, so the home hero stays out of the walk', () => {
    expect(body('/home/featured')).toBeNull();
  });

  it('answers an object for a call it was never taught', () => {
    expect(body('/settings/unheard-of')).toEqual({});
  });
});

describe('the television the run boots', () => {
  it('marks the saved server used, or the app opens on the profile picker', () => {
    const stored = deviceEntries('http://probe.local', 'fr');

    expect(JSON.parse(stored['kroma.servers'] ?? '[]')).toMatchObject([
      { url: 'http://probe.local', lastUsedAt: expect.any(Number) },
    ]);
    expect(stored['kroma.locale']).toBe('fr');
  });

  it('has already seen the brand intro', () => {
    expect(SESSION_ENTRIES).toEqual({ 'kroma:intro-seen': '1' });
  });
});
