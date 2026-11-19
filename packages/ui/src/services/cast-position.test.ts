import { DeviceId } from '@kromatv/client';
import { describe, expect, it } from 'vitest';
import { baseOf, livePosition, seekedBase } from './cast-position';

const SALON = DeviceId.parse('tv-salon-01');
const T0 = 1_000_000;

function salon(positionMs: number, state: 'playing' | 'paused' = 'playing') {
  return { id: SALON, nowPlaying: { positionMs, durationMs: 600_000, state } };
}

describe('where the television is now', () => {
  it('is what it last said plus the time since, while it plays', () => {
    const base = { id: SALON, positionMs: 60_000, playing: true, at: T0 };

    expect(livePosition(salon(60_000), base, T0 + 2500)).toBe(62_500);
  });

  it('holds still while it is paused', () => {
    const base = { id: SALON, positionMs: 60_000, playing: false, at: T0 };

    expect(livePosition(salon(60_000, 'paused'), base, T0 + 30_000)).toBe(60_000);
  });

  it('follows a seek backward, although the roster still holds the later position', () => {
    const seeked = { id: SALON, positionMs: 10_000, playing: true, at: T0 };

    expect(livePosition(salon(300_000), seeked, T0)).toBe(10_000);
  });

  it('never runs past the end of the title', () => {
    const base = { id: SALON, positionMs: 599_000, playing: true, at: T0 };

    expect(livePosition(salon(599_000), base, T0 + 60_000)).toBe(600_000);
  });

  it('is where the roster last had it before anything was heard for this television', () => {
    const other = { id: 'tv-chambre-02', positionMs: 5_000, playing: true, at: T0 };

    expect(livePosition(salon(42_000), null, T0)).toBe(42_000);
    expect(livePosition(salon(42_000), other, T0 + 9_000)).toBe(42_000);
    expect(livePosition(null, null, T0)).toBe(0);
  });
});

describe('the base a roster row gives', () => {
  it('is what the row says the television is doing', () => {
    expect(baseOf(salon(42_000, 'paused'), T0)).toEqual({
      id: SALON,
      positionMs: 42_000,
      playing: false,
      at: T0,
    });
  });

  it('is nothing for a television that plays nothing', () => {
    expect(baseOf({ id: SALON }, T0)).toBeNull();
  });
});

describe('the base after a seek sent from here', () => {
  it('is the position asked for, and keeps whether the film was playing', () => {
    const paused = { id: SALON, positionMs: 60_000, playing: false, at: T0 };

    expect(seekedBase(paused, SALON, 10_000)).toMatchObject({ positionMs: 10_000, playing: false });
    expect(seekedBase(null, SALON, 10_000)).toMatchObject({ positionMs: 10_000, playing: true });
  });
});
