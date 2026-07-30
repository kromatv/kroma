// The browser takes a comma-separated shadow list and draws each CEA-708 treatment
// as the standard describes it; React Native supports only ONE text shadow, so the
// native half approximates. The background is a separate CEA-708 layer that lives
// in subtitle-appearance.ts, so no edge may paint one.

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
    // Near-zero, never zero: Android's Paint drops the shadow layer outright at
    // radius 0, rendering both of these exactly like `none`.
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
    // Counted by corner rather than by splitting on commas, which would also split
    // the rgba() of the drop shadow that follows them.
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
