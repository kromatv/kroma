// The subtitle edge treatment, both halves.
//
// Four settings, two very different spellings. The browser takes a
// comma-separated shadow list and draws the design's four-way outline exactly;
// React Native supports ONE text shadow, so the outline is approximated by a
// tight dark halo. What has to hold across that gap is that all four settings
// answer on both platforms, that `box` means the same thing on each (it is the
// one treatment that is a background rather than a shadow), and that the opacity
// coming from the settings slider is clamped before it reaches a colour - an
// `rgba(...)` alpha outside 0..1 is an invalid colour, which drops the whole
// declaration and takes the subtitle's readability with it.

import { describe, expect, it } from 'vitest';
import type { SubEdge } from './subtitle-appearance';
import * as native from './subtitle-edge';
import * as web from './subtitle-edge.web';

const EDGES: SubEdge[] = ['shadow', 'outline', 'box', 'none'];

describe('the native half', () => {
  it('draws a soft drop shadow', () => {
    expect(native.edgeStyle('shadow', 100)).toEqual({
      textShadowColor: 'rgba(0, 0, 0, 0.92)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 10,
    });
  });

  it('approximates the outline with a tight centred halo', () => {
    // Offset zero and a small radius: with only one shadow available, a halo in
    // every direction is the closest thing to an outline.
    expect(native.edgeStyle('outline', 100)).toEqual({
      textShadowColor: '#000000',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    });
  });

  it('paints a box from the opacity percentage', () => {
    expect(native.edgeStyle('box', 60)).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0.6)' });
  });

  it('gives "none" nothing at all', () => {
    expect(native.edgeStyle('none', 100)).toEqual({});
  });
});

describe('the web half', () => {
  it('spells the shadow as CSS', () => {
    expect(native.edgeStyle('shadow', 100)).not.toEqual(web.edgeStyle('shadow', 100));
    expect(web.edgeStyle('shadow', 100)).toHaveProperty('textShadow');
  });

  it('draws the outline as four real corners plus a soft drop', () => {
    const { textShadow } = web.edgeStyle('outline', 100) as { textShadow: string };
    // The thing the native half cannot do: one hard shadow per corner. Counted
    // by the corners themselves rather than by splitting on commas, which would
    // also split the rgba() of the drop shadow that follows them.
    for (const x of ['-1.5px', '1.5px']) {
      for (const y of ['-1.5px', '1.5px']) {
        expect(textShadow).toContain(`${x} ${y} 0 #000`);
      }
    }
    expect(textShadow.match(/0 #000/g)).toHaveLength(4);
    expect(textShadow).toContain('0 2px 6px rgba(0,0,0,.7)');
  });

  it('paints the same box as native', () => {
    expect(web.edgeStyle('box', 60)).toEqual(native.edgeStyle('box', 60));
  });

  it('gives "none" nothing at all', () => {
    expect(web.edgeStyle('none', 100)).toEqual({});
  });
});

describe('clampPct, on both halves', () => {
  it('holds the slider inside 0..100', () => {
    for (const clampPct of [native.clampPct, web.clampPct]) {
      expect(clampPct(-40)).toBe(0);
      expect(clampPct(0)).toBe(0);
      expect(clampPct(55)).toBe(55);
      expect(clampPct(100)).toBe(100);
      expect(clampPct(180)).toBe(100);
    }
  });

  it('keeps an out-of-range opacity from producing an invalid colour', () => {
    // alpha > 1 (or < 0) is not a valid rgba(), and an invalid colour drops the
    // whole declaration - the box would simply not be painted.
    for (const edgeStyle of [native.edgeStyle, web.edgeStyle]) {
      expect(edgeStyle('box', 400)).toEqual({ backgroundColor: 'rgba(0, 0, 0, 1)' });
      expect(edgeStyle('box', -20)).toEqual({ backgroundColor: 'rgba(0, 0, 0, 0)' });
    }
  });
});

describe('the two halves together', () => {
  it('answer every setting on both platforms', () => {
    // A missing branch is an unstyled subtitle on one platform only, which is
    // exactly the kind of gap nobody sees until a television is in front of them.
    for (const edge of EDGES) {
      expect(native.edgeStyle(edge, 50)).toBeTypeOf('object');
      expect(web.edgeStyle(edge, 50)).toBeTypeOf('object');
    }
  });

  it('agree that only "box" is a background rather than a shadow', () => {
    for (const edgeStyle of [native.edgeStyle, web.edgeStyle]) {
      for (const edge of EDGES) {
        const isBox = edge === 'box';
        expect(Object.hasOwn(edgeStyle(edge, 50), 'backgroundColor')).toBe(isBox);
      }
    }
  });
});
