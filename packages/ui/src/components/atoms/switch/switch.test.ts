import { describe, expect, it } from 'vitest';
import { switchVariants } from './switch';

// Mirrors the module's own geometry, so a drift between the two shows up here
// rather than as a thumb that sits closer to one end than the other.
const GEOM = {
  sm: { w: 46, h: 28, pad: 3, thumb: 20 },
  tv: { w: 64, h: 36, pad: 4, thumb: 26 },
} as const;

const SIZES = ['sm', 'tv'] as const;

describe('switch geometry', () => {
  it('declares the track the geometry says', () => {
    for (const size of SIZES) {
      expect(switchVariants({ size }).root).toMatchObject({
        width: GEOM[size].w,
        height: GEOM[size].h,
        paddingLeft: GEOM[size].pad,
        borderWidth: 1,
      });
    }
  });

  it('leaves the thumb the same gap at both ends of its run', () => {
    // React Native sizes border-box: the hairline is inside the declared width
    // and the padding inside that. A travel that ignores the edge parks the
    // thumb 2px past the padding at the ON end.
    for (const size of SIZES) {
      const root = switchVariants({ size }).root;
      const edge = root.borderWidth as number;
      const pad = root.paddingLeft as number;
      const inner = (root.width as number) - 2 * edge - 2 * pad;
      const travel = inner - GEOM[size].thumb;

      const gapWhenOff = pad;
      const gapWhenOn = (root.width as number) - 2 * edge - pad - travel - GEOM[size].thumb;
      expect(gapWhenOn).toBe(gapWhenOff);
    }
  });

  it('keeps the thumb inside the track at both ends', () => {
    for (const size of SIZES) {
      const root = switchVariants({ size }).root;
      const inner = (root.width as number) - 2 * (root.borderWidth as number);
      expect(GEOM[size].thumb).toBeLessThan(inner);
      expect(GEOM[size].thumb).toBeLessThanOrEqual((root.height as number) - 2);
    }
  });
});
