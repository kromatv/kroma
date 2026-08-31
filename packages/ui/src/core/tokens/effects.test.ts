import { describe, expect, it } from 'vitest';
import { RING_WIDTH, ring } from './effects.ts';

const corner = ({ borderRadius, outlineOffset }: (typeof ring)[keyof typeof ring]) =>
  (borderRadius ?? 0) + outlineOffset;

describe('the focus ring', () => {
  it('is one width whichever side of the control it is drawn on', () => {
    const widths = Object.values(ring).map((style) => style.outlineWidth);

    expect(new Set(widths)).toEqual(new Set([RING_WIDTH]));
  });

  it('turns a corner when drawn inside a row that has none of its own', () => {
    expect(corner(ring.focusInset)).toBeGreaterThan(0);
  });

  it('leaves the shape to the control when it is drawn outside it', () => {
    expect(ring.focus.borderRadius).toBeUndefined();
    expect(ring.focusEdge.borderRadius).toBeUndefined();
  });
});
