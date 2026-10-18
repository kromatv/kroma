import { describe, expect, it } from 'vitest';
import { DIALOG_PAD, dialogPad, surfaceGutter } from './surface-shell';

describe('the frame a floating surface keeps', () => {
  it('spends a desk gutter on a window that has the width for one', () => {
    expect(dialogPad(1440)).toBe(DIALOG_PAD);
    expect(surfaceGutter(1440)).toBe(64);
  });

  it('leaves a phone held upright the column rather than the frame', () => {
    const phone = 390;

    expect(dialogPad(phone)).toBeLessThan(DIALOG_PAD);
    expect(phone - surfaceGutter(phone) * 2 - dialogPad(phone) * 2).toBeGreaterThan(300);
  });

  it('steps at the same width on both, so a panel never pads wide in a narrow frame', () => {
    expect(dialogPad(599)).toBe(dialogPad(390));
    expect(surfaceGutter(599)).toBe(surfaceGutter(390));
    expect(dialogPad(600)).toBe(DIALOG_PAD);
    expect(surfaceGutter(600)).toBe(64);
  });
});
