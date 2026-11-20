import { describe, expect, it } from 'vitest';
import { createPlayheadClock } from './playhead-clock';

const T0 = 1_000_000;

describe('telling a seek from a playhead that advances', () => {
  it('sees no jump in the first reading', () => {
    const clock = createPlayheadClock();

    expect(clock.jumped({ positionMs: 60_000, playing: true }, T0)).toBe(false);
  });

  it('sees no jump while a playing film advances with the clock', () => {
    const clock = createPlayheadClock();
    clock.jumped({ positionMs: 60_000, playing: true }, T0);

    expect(clock.jumped({ positionMs: 60_250, playing: true }, T0 + 250)).toBe(false);
    expect(clock.jumped({ positionMs: 61_400, playing: true }, T0 + 1250)).toBe(false);
  });

  it('sees a jump when the playhead lands far from where it should be', () => {
    const clock = createPlayheadClock();
    clock.jumped({ positionMs: 60_000, playing: true }, T0);

    expect(clock.jumped({ positionMs: 300_000, playing: true }, T0 + 250)).toBe(true);
  });

  it('sees no jump while a paused film stays where it is, however long', () => {
    const clock = createPlayheadClock();
    clock.jumped({ positionMs: 60_000, playing: false }, T0);

    expect(clock.jumped({ positionMs: 60_000, playing: false }, T0 + 60_000)).toBe(false);
  });

  it('sees a jump when a paused playhead is moved', () => {
    const clock = createPlayheadClock();
    clock.jumped({ positionMs: 60_000, playing: false }, T0);

    expect(clock.jumped({ positionMs: 10_000, playing: false }, T0 + 500)).toBe(true);
  });

  it('forgets when the player goes, so the next film does not jump from the last', () => {
    const clock = createPlayheadClock();
    clock.jumped({ positionMs: 3_600_000, playing: true }, T0);
    clock.jumped(null, T0 + 100);

    expect(clock.jumped({ positionMs: 0, playing: true }, T0 + 200)).toBe(false);
  });
});
