import { DeviceId } from '@kromatv/client';
import type { CastCommand } from '@kromatv/client/cast';
import { describe, expect, it } from 'vitest';
import {
  baseOf,
  drivenBase,
  heardBase,
  livePosition,
  orderedBase,
  redrawStep,
  showsAnother,
} from './cast-position';

const SALON = DeviceId.parse('tv-salon-01');
const T0 = 1_000_000;

function order(command: CastCommand) {
  return { receiverId: SALON, command };
}

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

describe('the base after a roster fetch', () => {
  const was = { id: SALON, positionMs: 5000, playing: true, at: T0 };

  it('is the row of the television driven from here', () => {
    expect(drivenBase([salon(9000)], SALON, was)).toMatchObject({ id: SALON, positionMs: 9000 });
  });

  it('is empty when the driven television plays nothing', () => {
    expect(drivenBase([{ id: SALON }], SALON, was)).toBeNull();
  });

  it('keeps the base when the roster does not hold the driven television', () => {
    expect(drivenBase([salon(9000)], 'tv-other', was)).toBe(was);
  });

  it('keeps the base when no television is driven', () => {
    expect(drivenBase([salon(9000)], null, was)).toBe(was);
  });
});

describe('the base after an order sent from here', () => {
  const counting = { id: SALON, positionMs: 60_000, playing: true, at: T0 };

  it('is the position a seek asked for, at once, and keeps whether the film was playing', () => {
    const paused = { ...counting, playing: false };
    const seek = { type: 'seek', positionMs: 10_000 } as const;

    expect(orderedBase(paused, order(seek), T0)).toMatchObject({
      positionMs: 10_000,
      playing: false,
    });
    expect(orderedBase(null, order(seek), T0)).toMatchObject({ positionMs: 10_000, playing: true });
  });

  it('is a skip away from where the count is, and never before the start', () => {
    const forward = orderedBase(counting, order({ type: 'skip', deltaMs: 10_000 }), T0 + 2000);
    const back = orderedBase(counting, order({ type: 'skip', deltaMs: -90_000 }), T0 + 2000);

    expect(forward).toMatchObject({ positionMs: 72_000, at: T0 + 2000 });
    expect(back).toMatchObject({ positionMs: 0 });
  });

  it('is left as it is by an order that moves nothing', () => {
    expect(orderedBase(counting, order({ type: 'pause' }), T0)).toBe(counting);
  });

  it('holds against a report that left the television before the order arrived', () => {
    const seeked = orderedBase(counting, order({ type: 'seek', positionMs: 300_000 }), T0);
    const stale = { id: SALON, positionMs: 60_400, playing: true, at: T0 + 400 };
    const landed = { id: SALON, positionMs: 300_000, playing: false, at: T0 + 700 };
    const running = { id: SALON, positionMs: 300_100, playing: true, at: T0 + 1500 };

    expect(heardBase(seeked, stale)).toBe(seeked);
    expect(heardBase(seeked, landed)).toBe(landed);
    expect(heardBase(landed, running)).toBe(running);
  });

  it('gives way after four seconds to a television that never followed', () => {
    const seeked = orderedBase(counting, order({ type: 'seek', positionMs: 300_000 }), T0);
    const unmoved = { id: SALON, positionMs: 64_000, playing: true, at: T0 + 4000 };

    expect(heardBase(seeked, unmoved)).toBe(unmoved);
  });
});

describe('the base after the television said where it is', () => {
  const counting = { id: SALON, positionMs: 60_000, playing: true, at: T0 };

  it('is kept while the count agrees with what was said, so a late report moves nothing', () => {
    const late = { id: SALON, positionMs: 60_920, playing: true, at: T0 + 1000 };

    expect(heardBase(counting, late)).toBe(counting);
  });

  it('is replaced when the television is somewhere else', () => {
    const seeked = { id: SALON, positionMs: 10_000, playing: true, at: T0 + 1000 };

    expect(heardBase(counting, seeked)).toBe(seeked);
  });

  it('is replaced when the television stopped or started', () => {
    const paused = { id: SALON, positionMs: 61_000, playing: false, at: T0 + 1000 };
    const resumed = { id: SALON, positionMs: 61_000, playing: true, at: T0 + 9000 };

    expect(heardBase(counting, paused)).toBe(paused);
    expect(heardBase(paused, resumed)).toBe(resumed);
  });

  it('is what was said when nothing was heard before, and nothing when it plays nothing', () => {
    expect(heardBase(null, counting)).toBe(counting);
    expect(heardBase(counting, null)).toBeNull();
  });
});

describe('how often a playhead is redrawn', () => {
  it('is every frame for a short clip and ten times a second for a film', () => {
    expect(redrawStep(12_000)).toBe(16);
    expect(redrawStep(100_000)).toBe(50);
    expect(redrawStep(7_200_000)).toBe(100);
  });

  it('is ten times a second when the runtime is not known', () => {
    expect(redrawStep(0)).toBe(100);
  });

  it('is asked for by a step along the bar or by another second', () => {
    expect(showsAnother(60_000, 60_100, 100)).toBe(true);
    expect(showsAnother(60_000, 60_050, 100)).toBe(false);
    expect(showsAnother(60_960, 61_000, 100)).toBe(true);
  });
});
