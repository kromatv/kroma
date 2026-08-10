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
  it('bakes the kit focus ring into every ON row', () => {
    expect(panel.rowOn).toMatchObject(KROMA.ring.focusLift);
    expect(panel.valueRowOn).toMatchObject(KROMA.ring.focusLift);
  });

  it('keeps the idle row transparent, with no ring', () => {
    expect(panel.rowOff).toEqual({ backgroundColor: 'transparent' });
    expect(panel.rowOff.outlineWidth).toBeUndefined();
  });
});
