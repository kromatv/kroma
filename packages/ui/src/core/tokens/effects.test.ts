import { describe, expect, it } from 'vitest';
import { RING_GAP, RING_WIDTH, standoff, standoffInside } from './effects.ts';

describe('the focus ring', () => {
  it('is one width whichever side of the control it is drawn on', () => {
    expect(standoff('red').outlineWidth).toBe(RING_WIDTH);
    expect(standoffInside('red').outlineWidth).toBe(RING_WIDTH);
  });

  it('stands one gap off a control on its own', () => {
    expect(standoff('red').outlineOffset).toBe(RING_GAP);
  });

  it('lies on the inner edge of a member, so its fill and its ring are one shape', () => {
    expect(standoffInside('red').outlineOffset).toBe(-RING_WIDTH);
  });

  it('leaves the corner to the control on either side', () => {
    expect(standoff('red')).not.toHaveProperty('borderRadius');
    expect(standoffInside('red')).not.toHaveProperty('borderRadius');
  });
});
