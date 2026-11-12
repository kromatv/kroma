import { describe, expect, it } from 'vitest';
import { floorBeyondRelease } from './server-floor';

const notes = (server: string) => ({ id: 'tv.acme.notes', engines: { server } });

describe('floorBeyondRelease', () => {
  it('accepts a floor at the release being prepared', () => {
    expect(floorBeyondRelease(notes('>=0.1.39'), '0.1.39')).toBeNull();
  });

  it('accepts a floor at a release already out', () => {
    expect(floorBeyondRelease(notes('>=0.1.38'), '0.1.39')).toBeNull();
  });

  it('accepts a canary floor, which comes before the release it leads to', () => {
    expect(floorBeyondRelease(notes('>=0.1.39-canary.3607377'), '0.1.39')).toBeNull();
  });

  it('refuses a floor past the release being prepared', () => {
    expect(floorBeyondRelease(notes('>=0.1.40'), '0.1.39')).toBe(
      'tv.acme.notes: needs server 0.1.40, past 0.1.39, the release being prepared, so no server could run it',
    );
  });

  it('refuses a caret floor past it too', () => {
    expect(floorBeyondRelease(notes('^0.2.0'), '0.1.39')).not.toBeNull();
  });

  it('says nothing about a module that sets no floor', () => {
    expect(floorBeyondRelease({ id: 'tv.acme.notes' }, '0.1.39')).toBeNull();
  });

  it('says nothing when the release being prepared is the unversioned placeholder', () => {
    expect(floorBeyondRelease(notes('>=0.1.40'), '0.0.0')).toBeNull();
  });
});
