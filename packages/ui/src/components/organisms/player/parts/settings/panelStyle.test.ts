import { describe, expect, it } from 'vitest';
import { FOCUS_SHADOW_SM } from '#ui/components/organisms/player/lib/style';
import { rowOff, rowOn, rowStyle, valueRowOn } from './panelStyle';

describe('rowStyle', () => {
  it('picks the ON style when focused', () => {
    expect(rowStyle({ gap: 1 }, { opacity: 1 }, true)).toEqual([{ gap: 1 }, { opacity: 1 }]);
  });

  it('falls back to the shared idle style when not focused', () => {
    expect(rowStyle({ gap: 1 }, { opacity: 1 }, false)).toEqual([{ gap: 1 }, rowOff]);
  });
});

describe('focus-state style atoms', () => {
  it('bakes the shared small focus ring into every ON row', () => {
    expect(rowOn.boxShadow).toBe(FOCUS_SHADOW_SM);
    expect(valueRowOn.boxShadow).toBe(FOCUS_SHADOW_SM);
  });

  it('keeps the idle row transparent, with no ring', () => {
    expect(rowOff).toEqual({ backgroundColor: 'transparent' });
    expect(rowOff.boxShadow).toBeUndefined();
  });
});
