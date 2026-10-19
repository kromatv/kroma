// @vitest-environment jsdom
//
// The web half of the splash drift. Two decisions here are the whole reason
// this file exists rather than the native pan running everywhere, and both are
// invisible from the outside, so they are pinned:
//
// the scale is CONSTANT across the keyframes (a compositor moves an existing
// texture for free but must re-rasterise a layer whose scale changes, which on
// a television is a full-screen still every frame), and the timing function is
// STEPPED, so a pan travelling single-digit pixels per second stops paying for
// sixty full-screen recomposites a second to move nothing an eye resolves.

import { renderHook } from '@testing-library/react';
import { StyleSheet } from 'react-native';
import { describe, expect, it } from 'vitest';
import { GRADE, useDrift } from './splash-motion';
import type { CssDrift } from './splash-motion.web';

const SPEC = { x: 0.04, y: 0.03, zoom: 1.12, ms: 12_000, width: 1920, height: 1080 };

function drift(spec = SPEC) {
  const { result } = renderHook(() => useDrift(spec));
  return result.current;
}

function flat(spec = SPEC) {
  return StyleSheet.flatten<CssDrift>(drift(spec));
}

type Keyframes = Record<string, { transform?: string }>;

function keyframes(spec = SPEC): Keyframes {
  const rules = flat(spec).animationKeyframes as Keyframes[] | undefined;
  const first = rules?.[0];
  if (!first) throw new Error('the drift style carries no @keyframes rule');
  return first;
}

function frameAt(stop: string, spec = SPEC): string {
  const transform = keyframes(spec)[stop]?.transform;
  if (!transform) throw new Error(`no transform at ${stop}`);
  return transform;
}

describe('useDrift', () => {
  it('stays still before layout: a zero box has nothing to pan', () => {
    expect(drift({ ...SPEC, width: 0 })).toBeNull();
    expect(drift({ ...SPEC, height: 0 })).toBeNull();
  });

  it('pans one way, once, and holds its last frame', () => {
    expect(Object.keys(keyframes())).toEqual(['0%', '100%']);
    expect(frameAt('100%')).not.toBe(frameAt('0%'));
    expect(flat().animationIterationCount).toBe('1');
    expect(flat().animationFillMode).toBe('forwards');
  });

  it("pans by the spec fractions, taken against the layer's own box", () => {
    expect(frameAt('0%')).toBe('translate(4%, 3%) scale(1.12)');
    expect(frameAt('100%')).toBe('translate(-4%, -3%) scale(1.12)');
  });

  it('never changes the scale, which is what keeps the layer off the rasteriser', () => {
    const scales = Object.values(keyframes()).map(
      (frame) => /scale\(([\d.]+)\)/.exec(frame.transform ?? '')?.[1],
    );
    expect(new Set(scales)).toEqual(new Set(['1.12']));
  });

  it('steps the pan at 10Hz over the leg rather than moving every frame', () => {
    // 12s out at 10 steps a second.
    expect(flat().animationTimingFunction).toBe('steps(120, end)');
    // A leg shorter than one step still has to move.
    expect(flat({ ...SPEC, ms: 20 }).animationTimingFunction).toBe('steps(1, end)');
  });

  it('spends the spec duration on the pan', () => {
    expect(flat().animationDuration).toBe(`${SPEC.ms}ms`);
  });

  it('asks for a compositor layer up front so the first drifting frame is not also the promoting one', () => {
    expect(flat().willChange).toBe('transform');
    expect(flat().backfaceVisibility).toBe('hidden');
  });

  it('reuses one sheet per geometry: a rule per measured frame would be a rule per frame', () => {
    const a = drift() as unknown[];
    const b = drift() as unknown[];
    expect(a[0]).toBe(b[0]);
    const other = drift({ ...SPEC, zoom: 1.2 }) as unknown[];
    expect(other[0]).not.toBe(a[0]);
  });

  it('keeps the sheet a registry entry rather than a spread copy', () => {
    // Spreading a `StyleSheet.create` result into a new object silently loses
    // the @keyframes rule, so the hook must hand back an ARRAY.
    expect(Array.isArray(drift())).toBe(true);
  });
});

describe('GRADE', () => {
  it('is a filter, held apart from the drift so it rasterises once', () => {
    const style = StyleSheet.flatten(GRADE);
    expect(style).toHaveProperty('filter', 'brightness(0.86) saturate(1.02)');
  });
});
