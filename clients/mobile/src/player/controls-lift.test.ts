import { describe, expect, it } from 'vitest';
import { controlsLift } from './controls-lift';

const FULL = { visible: true, compact: false, barHeight: 0, bottomInset: 0 };

describe('controlsLift', () => {
  it('rests above the home indicator while the controls are hidden', () => {
    expect(controlsLift({ ...FULL, visible: false, bottomInset: 34 })).toBe(54);
  });

  it('clears the bottom bar once it is measured', () => {
    expect(controlsLift({ ...FULL, barHeight: 131 })).toBeGreaterThan(131);
  });

  it('follows the bottom bar when larger text makes it taller', () => {
    const regular = controlsLift({ ...FULL, barHeight: 131 });

    const larger = controlsLift({ ...FULL, barHeight: 176 });

    expect(larger - regular).toBe(45);
  });

  it('does not add the inset on top of a bar that already pads for it', () => {
    const flat = controlsLift({ ...FULL, barHeight: 131 });

    const notched = controlsLift({ ...FULL, barHeight: 131, bottomInset: 34 });

    expect(notched).toBe(flat);
  });

  it('keeps the design height until the bottom bar has been measured', () => {
    expect(controlsLift({ ...FULL, bottomInset: 20 })).toBe(130);
  });

  it('stays low in the inline player, which has no bottom bar', () => {
    expect(controlsLift({ ...FULL, compact: true, barHeight: 131 })).toBe(16);
  });
});
