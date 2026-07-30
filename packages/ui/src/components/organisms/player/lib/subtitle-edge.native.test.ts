// The subtitle edge treatment, both halves.
//
// Five settings, two very different spellings. The browser takes a
// comma-separated shadow list and draws each CEA-708 treatment as the standard
// describes it; React Native supports ONE text shadow, so `uniform` is
// approximated by a tight dark halo and the directional pair by a hard offset.
// What has to hold across that gap is that all five settings answer on both
// platforms, and that NONE of them paints a background - the background is its
// own CEA-708 layer now, with its own colour and opacity, and lives in
// subtitle-appearance.ts. An edge that quietly kept drawing one would put a slab
// behind the text that no setting in the panel could turn off.

import { describe, expect, it } from 'vitest';
import type { SubEdge } from './subtitle-appearance';
import * as native from './subtitle-edge';
import * as web from './subtitle-edge.web';

const EDGES: SubEdge[] = ['none', 'raised', 'depressed', 'uniform', 'shadow'];

describe('the native half', () => {
  it('draws a soft drop shadow', () => {
    expect(native.edgeStyle('shadow')).toEqual({
      textShadowColor: 'rgba(0, 0, 0, 0.92)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 10,
    });
  });

  it('approximates the uniform stroke with a tight centred halo', () => {
    // Offset zero and a small radius: with only one shadow available, a halo in
    // every direction is the closest thing to a stroke.
    expect(native.edgeStyle('uniform')).toEqual({
      textShadowColor: '#000000',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 3,
    });
  });

  it('points raised and depressed in opposite directions, with a hard edge', () => {
    const raised = native.edgeStyle('raised');
    const depressed = native.edgeStyle('depressed');
    expect(raised.textShadowOffset).toEqual({ width: 2, height: 2 });
    expect(depressed.textShadowOffset).toEqual({ width: -2, height: -2 });
    // Near-zero, never zero: Android's Paint removes the shadow layer outright at
    // radius 0, which would render both of these exactly like `none` and quietly
    // cost CEA-708 two of its five treatments.
    for (const r of [raised.textShadowRadius, depressed.textShadowRadius]) {
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(0.5);
    }
  });

  it('gives "none" nothing at all', () => {
    expect(native.edgeStyle('none')).toEqual({});
  });
});

describe('the web half', () => {
  it('spells the shadow as CSS', () => {
    expect(native.edgeStyle('shadow')).not.toEqual(web.edgeStyle('shadow'));
    expect(web.edgeStyle('shadow')).toHaveProperty('textShadow');
  });

  it('draws the uniform stroke as four real corners plus a soft drop', () => {
    const { textShadow } = web.edgeStyle('uniform') as { textShadow: string };
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

  it('points raised and depressed in opposite directions', () => {
    expect((web.edgeStyle('raised') as { textShadow: string }).textShadow).toContain(
      '1px 1px 0 #000',
    );
    expect((web.edgeStyle('depressed') as { textShadow: string }).textShadow).toContain(
      '-1px -1px 0 #000',
    );
  });

  it('gives "none" nothing at all', () => {
    expect(web.edgeStyle('none')).toEqual({});
  });
});

describe('the two halves together', () => {
  it('answer every setting on both platforms', () => {
    // A missing branch is an unstyled subtitle on one platform only, which is
    // exactly the kind of gap nobody sees until a television is in front of them.
    for (const edge of EDGES) {
      expect(native.edgeStyle(edge)).toBeTypeOf('object');
      expect(web.edgeStyle(edge)).toBeTypeOf('object');
    }
  });

  it('agree that an edge never paints a background', () => {
    for (const edgeStyle of [native.edgeStyle, web.edgeStyle]) {
      for (const edge of EDGES) {
        expect(Object.hasOwn(edgeStyle(edge), 'backgroundColor')).toBe(false);
      }
    }
  });
});
