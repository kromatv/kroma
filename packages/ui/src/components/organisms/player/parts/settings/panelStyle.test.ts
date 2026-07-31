import { describe, expect, it } from 'vitest';
import { KROMA } from '#ui/core';
import { panel, rowStyle } from './panelStyle';

describe('rowStyle', () => {
  it('picks the ON style when focused', () => {
    expect(rowStyle({ gap: 1 }, { opacity: 1 }, true)).toEqual([{ gap: 1 }, { opacity: 1 }]);
  });

  it('falls back to the shared idle style when not focused', () => {
    expect(rowStyle({ gap: 1 }, { opacity: 1 }, false)).toEqual([{ gap: 1 }, panel.rowOff]);
  });
});

describe('focus-state style atoms', () => {
  it('bakes the shared small focus ring into every ON row', () => {
    expect(panel.rowOn.boxShadow).toBe(KROMA.ring.focusGlowSm);
    expect(panel.valueRowOn.boxShadow).toBe(KROMA.ring.focusGlowSm);
  });

  it('keeps the idle row transparent, with no ring', () => {
    expect(panel.rowOff).toEqual({ backgroundColor: 'transparent' });
    expect(panel.rowOff.boxShadow).toBeUndefined();
  });
});
