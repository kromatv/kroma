import { describe, expect, it } from 'vitest';
import {
  BASE_RAMP,
  type FontToken,
  fonts,
  TV_RAMP,
  type TypeSpec,
  toType,
  typeSpec,
} from './typography';

describe('toType', () => {
  it('resolves a named family and derives the line height from the ratio', () => {
    expect(
      toType({ note: { family: 'display', weight: '700', size: 20, ratio: 1.05 } }, fonts),
    ).toEqual({
      note: { fontFamily: fonts.display, fontWeight: '700', fontSize: 20, lineHeight: 21 },
    });
  });

  it('keeps a family name no set answers to, so a theme can name a system font', () => {
    expect(
      toType(
        { note: { family: 'Courier New' as FontToken, weight: '400', size: 12, ratio: 1.5 } },
        fonts,
      ),
    ).toEqual({
      note: { fontFamily: 'Courier New', fontWeight: '400', fontSize: 12, lineHeight: 18 },
    });
  });
});

const ramp = TV_RAMP.map((role) => [role, typeSpec[role] as TypeSpec] as const);

const base = BASE_RAMP.map((role) => [role, typeSpec[role] as TypeSpec] as const);

// The widest jump the ramp allows between two neighbouring sizes. A screen that
// has to leap further than this reaches for a hand-set number instead, which is
// the drift a ramp exists to stop.
const MAX_STEP = 1.45;

describe('the 10-foot ramp', () => {
  it('runs largest to smallest', () => {
    const sizes = ramp.map(([, spec]) => spec.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('names every 10-foot role exactly once', () => {
    const tv = Object.keys(typeSpec).filter((role) => role.endsWith('Tv'));
    expect([...TV_RAMP].sort()).toEqual(tv.sort());
  });

  it('leaves no hole a call site would have to fill by hand', () => {
    const sizes = [...new Set(ramp.map(([, spec]) => spec.size))];
    const jumps = sizes.slice(1).map((size, i) => (sizes[i] as number) / size);
    for (const jump of jumps) expect(jump).toBeLessThanOrEqual(MAX_STEP);
  });

  it('pairs every step with its own leading', () => {
    for (const [role, spec] of ramp) {
      expect(spec.ratio, role).toBeGreaterThan(0);
      expect(toType({ [role]: spec }, fonts)[role]?.lineHeight, role).toBeGreaterThan(0);
    }
  });

  it('gives no two steps the same face, size and weight', () => {
    const seen = ramp.map(([, s]) => `${s.family}/${s.size}/${s.weight}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('keeps a face on one side of the ladder: display above, ui below', () => {
    const faces = ramp.map(([, spec]) => spec.family);
    expect(faces.indexOf('ui')).toBeGreaterThan(faces.lastIndexOf('display'));
  });
});

describe('the base ramp', () => {
  it('runs largest to smallest', () => {
    const sizes = base.map(([, spec]) => spec.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('names every base role exactly once', () => {
    const roles = Object.keys(typeSpec).filter((role) => !role.endsWith('Tv'));
    expect([...BASE_RAMP].sort()).toEqual(roles.sort());
  });

  it('leaves no hole under the poster size a call site would have to fill by hand', () => {
    const sizes = [...new Set(base.map(([, spec]) => spec.size))].filter(
      (size) => size < typeSpec.hero.size,
    );
    const jumps = sizes.slice(1).map((size, i) => (sizes[i] as number) / size);
    for (const jump of jumps) expect(jump).toBeLessThanOrEqual(MAX_STEP);
  });

  it('pairs every step with its own leading', () => {
    for (const [role, spec] of base) {
      expect(spec.ratio, role).toBeGreaterThan(0);
      expect(toType({ [role]: spec }, fonts)[role]?.lineHeight, role).toBeGreaterThan(0);
    }
  });

  it('gives no two steps the same face, size and weight', () => {
    const seen = base.map(([, s]) => `${s.family}/${s.size}/${s.weight}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('keeps a face on one side of the ladder: display above, ui below', () => {
    const faces = base.map(([, spec]) => spec.family);
    expect(faces.indexOf('ui')).toBeGreaterThan(faces.lastIndexOf('display'));
  });
});
