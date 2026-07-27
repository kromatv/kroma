import { describe, expect, it } from 'vitest';
import { edgeScrollOffset, fitPitch, horizontalInset } from './edge-scroll';
import { edgeWidth, railMask } from './rail-edge';

/** A row of 200 tiles, 200px pitch, showing 5 at a time, one tile of margin. */
const ROW = { itemSize: 200, viewport: 1000, count: 200, margin: 200 };
const at = (offset: number, index: number) => edgeScrollOffset({ ...ROW, offset, index });

describe('edgeScrollOffset', () => {
  it('leaves the row alone while the selection is in the middle', () => {
    // Offset 0 shows items 0..4. Selecting 1, 2 or 3 keeps a margin on both
    // sides, so nothing moves - the highlight is what travels.
    expect(at(0, 1)).toBe(0);
    expect(at(0, 2)).toBe(0);
    expect(at(0, 3)).toBe(0);
  });

  it('scrolls as the selection comes within a margin of the right edge', () => {
    // Item 4 ends at 1000, flush with the right edge: a tile of look-ahead means
    // scrolling by exactly one tile.
    expect(at(0, 4)).toBe(200);
    expect(at(200, 5)).toBe(400);
  });

  it('scrolls as the selection comes within a margin of the left edge', () => {
    // Offset 1000 shows items 5..9. Walking back: 7 and 6 are comfortable, 5
    // touches the margin and pulls the row back one tile.
    expect(at(1000, 7)).toBe(1000);
    expect(at(1000, 6)).toBe(1000);
    expect(at(1000, 5)).toBe(800);
    expect(at(800, 4)).toBe(600);
  });

  it('is symmetric: walking out and back returns to where it started', () => {
    let offset = 0;
    for (let index = 0; index <= 12; index++) offset = at(offset, index);
    for (let index = 12; index >= 0; index--) offset = at(offset, index);
    expect(offset).toBe(0);
  });

  it('never scrolls past either end', () => {
    expect(at(0, 0)).toBe(0);
    const last = ROW.count - 1;
    const end = ROW.count * ROW.itemSize - ROW.viewport;
    expect(at(end, last)).toBe(end);
    expect(at(end, last)).toBeLessThanOrEqual(end);
  });

  it('centres the selection when the row is too narrow for the margins', () => {
    const narrow = { itemSize: 200, viewport: 300, count: 20, margin: 200 };
    expect(edgeScrollOffset({ ...narrow, offset: 0, index: 5 })).toBe(950);
  });

  it('has nothing to say before the row is measured', () => {
    expect(edgeScrollOffset({ ...ROW, viewport: 0, offset: 0, index: 4 })).toBe(0);
  });
});

describe('fitPitch', () => {
  it('fits whole tiles into the row', () => {
    // A 10-foot tile in a phone: two of 195 rather than two and a slice.
    expect(fitPitch(196, 390)).toBe(195);
    expect(390 / fitPitch(196, 390)).toBe(2);
    // And a viewport just past a whole count tightens up to include it.
    expect(fitPitch(196, 700)).toBeCloseTo(175, 6);
    expect(700 / fitPitch(196, 700)).toBe(4);
  });

  it('leaves a row that already fits alone', () => {
    expect(fitPitch(200, 1000)).toBe(200);
  });

  it('never goes below one tile per row', () => {
    expect(fitPitch(400, 300)).toBe(300);
  });

  it('has nothing to fit before the row is measured', () => {
    expect(fitPitch(196, 0)).toBe(196);
  });
});

describe('whole pixels', () => {
  it('never returns a fractional offset, whatever the strip', () => {
    // The 691x300 rail that started this: a 683 content strip over three columns
    // was 227.667, and the row sat at translateX(-264.179px). Every tile boundary
    // on a sub-pixel, rounded independently by the compositor: hairline seams
    // between tiles and a sliced sliver at each end.
    const pitch = fitPitch(196, 683);
    expect(pitch).toBe(227);
    const row = { itemSize: pitch, viewport: 683, count: 400, margin: pitch };
    for (let index = 0; index < 30; index += 1) {
      const offset = edgeScrollOffset({ ...row, offset: 264.179, index });
      expect(Number.isInteger(offset)).toBe(true);
    }
  });
});

describe('the pitch grid', () => {
  // The row's offset is counted in PITCHES, and `edgeScrollOffset` returns an
  // offset unchanged while it sits inside the margin window - so an offset that
  // has fallen off the pitch grid is never corrected by it. That is what left
  // <VirtualRail> with a sliced tile at BOTH ends for the rest of a session once
  // the pitch changed under it (the `itemWidth` control did exactly that, because
  // the pitch used to be state written only on layout). The rail now derives the
  // pitch and snaps the offset; these are the two facts that made the bug possible.

  it('fits a whole number of pitches into the row, so the ends land flush', () => {
    // 1400 wide, tiles authored at 196: seven of them at 200 rather than seven at
    // 196 with 28px spare, which would be a sliced eighth.
    const pitch = fitPitch(196, 1400);
    expect(pitch).toBe(200);
    expect(1400 % pitch).toBe(0);
    // And always a whole number of pixels, whatever the strip: a fractional pitch
    // puts every tile boundary on a sub-pixel, and Chrome rounds each on its own.
    for (const width of [683, 691, 1237, 999, 561]) {
      expect(Number.isInteger(fitPitch(196, width))).toBe(true);
    }
  });

  it('keeps every offset it produces on that grid', () => {
    // Given a viewport that is a whole number of pitches, both bounds are whole
    // pitches too - which is why an off-grid offset can only have come from a
    // pitch that changed, never from this function.
    const pitch = fitPitch(196, 1400);
    const row = { itemSize: pitch, viewport: 1400, count: 400, margin: pitch };
    for (let index = 0; index < 40; index += 1) {
      const offset = edgeScrollOffset({ ...row, offset: index * pitch, index });
      expect(offset % pitch).toBe(0);
      expect(Number.isInteger(offset)).toBe(true);
    }
  });

  it('leaves an off-grid offset off the grid, which is why the rail snaps it', () => {
    const pitch = fitPitch(196, 1400);
    const row = { itemSize: pitch, viewport: 1400, count: 400, margin: pitch };
    // 43 pitches plus a fraction, with the selection comfortably in the middle:
    // nothing here pulls it back into line.
    const stale = 43 * pitch + 37;
    expect(edgeScrollOffset({ ...row, offset: stale, index: 46 })).toBe(stale);
  });
});

describe('horizontalInset', () => {
  // The rail measures its OUTER view but lays the tiles out inside
  // `contentStyle`'s padding. Dividing the outer width into whole pitches put a
  // row's worth of tiles into a strip that much narrower, so every offset sat
  // half a padding out of step: a sliver of a tile at each end, at every scroll
  // position, for any `itemWidth`. The two numbers have to describe one box.

  it('is nothing when the content has no padding to spend', () => {
    expect(horizontalInset(undefined)).toBe(0);
    expect(horizontalInset({})).toBe(0);
    expect(horizontalInset({ paddingVertical: 20 })).toBe(0);
  });

  it('counts both sides of the shorthand', () => {
    expect(horizontalInset({ paddingHorizontal: 4 })).toBe(8);
  });

  it('lets a longhand win over the shorthand, as React Native does', () => {
    expect(horizontalInset({ paddingHorizontal: 4, paddingLeft: 16 })).toBe(20);
    expect(horizontalInset({ paddingLeft: 10, paddingRight: 6 })).toBe(16);
  });

  it('ignores a length it cannot turn into a number rather than guessing', () => {
    // Being wrong by an unknown amount is worse than being wrong by a padding
    // nobody used.
    expect(horizontalInset({ paddingHorizontal: '5%' })).toBe(0);
  });

  it('leaves the tiles a strip the pitch divides exactly', () => {
    // The whole point, in one line: 1400 wide with 4px of content padding is a
    // 1392 strip, and the pitch has to fit that - not the 1400 nobody lays out in.
    const strip = 1400 - horizontalInset({ paddingHorizontal: 4 });
    expect(strip).toBe(1392);
    // A WHOLE number of pitches, which is what makes both ends land flush. The
    // pitch itself is fractional (1392/7), so this is the count rather than a
    // modulo - float residue is not a design fault.
    // Seven whole pixels of pitch, with at most `columns - 1` pixels of the strip
    // left over - which nobody can see, unlike a fractional edge on every tile.
    const pitch = fitPitch(196, strip);
    expect(Number.isInteger(pitch)).toBe(true);
    const columns = Math.round(strip / pitch);
    expect(strip - columns * pitch).toBeGreaterThanOrEqual(0);
    expect(strip - columns * pitch).toBeLessThan(columns);
  });
});

describe('edgeWidth', () => {
  // The fade used to be a constant 92. That is 5% of a 1920pt television row and
  // invisible - but the workbench's `fit` stage clamps this story to 560, where the
  // same 92 is 17% of the row and lands as a black slab across a sixth of it. Which
  // is exactly why the artefact only showed up in `fit`.
  it('is a fraction of the row, so one number is not wrong at both sizes', () => {
    expect(edgeWidth(1920)).toBe(288);
    expect(edgeWidth(560)).toBe(88);
    // The share, not a constant: a wider row gets a wider fade.
    expect(edgeWidth(1200)).toBeGreaterThan(edgeWidth(700));
  });

  it('never gets too thin to read as a fade, nor wide enough to eat the row', () => {
    expect(edgeWidth(200)).toBe(88);
    expect(edgeWidth(0)).toBe(88);
    expect(edgeWidth(4000)).toBe(300);
    // And never more than a fifth of the row it is fading.
    for (const row of [560, 700, 1000, 1400, 1920]) {
      expect(edgeWidth(row) / row).toBeLessThan(0.2);
    }
  });
});

describe('railMask', () => {
  /** Every stop as `[alpha, position]`, positions read as pixels from the near
   *  edge - `calc(100% - Npx)` counts as N from the far one. */
  const stops = (css: string) =>
    [...css.matchAll(/rgba\(0, 0, 0, ([\d.]+)\) (?:calc\(100% - )?(\d+)(?:px)?/g)].map(
      ([, alpha, at]) => [Number(alpha), Number(at)] as const,
    );

  it('empties the ends it fades, so the clipped tile is gone rather than dimmed', () => {
    const css = railMask(200, true, true);
    // Both ends: alpha 0 at the clip's own edge, full alpha somewhere inside.
    expect(css).toContain('rgba(0, 0, 0, 0) 0px');
    expect(css).toContain('rgba(0, 0, 0, 0) 100%');
    expect(stops(css).some(([alpha]) => alpha === 1)).toBe(true);
  });

  it('does not fade an end that cannot scroll - the first tile keeps its ring', () => {
    // The bleed at a resting end holds the end tile's focus ring, which is what
    // the bleed is FOR. Fading it there is the artefact, not the fix.
    const resting = railMask(200, false, true);
    expect(resting.startsWith('linear-gradient(to right, rgba(0, 0, 0, 1) 0px')).toBe(true);
    expect(railMask(200, true, false).endsWith('rgba(0, 0, 0, 1) 100%)')).toBe(true);
    // Neither end scrolling is no mask at all, in effect: opaque throughout.
    expect(stops(railMask(200, false, false)).every(([alpha]) => alpha === 1)).toBe(true);
  });

  it('reveals the row monotonically, over the bleed plus the fade', () => {
    const fade = 200;
    const near = stops(railMask(fade, true, false));
    for (let at = 1; at < near.length; at++) {
      const [alpha, position] = near[at] ?? [0, 0];
      const [before, previous] = near[at - 1] ?? [0, 0];
      // A stop that steps backwards, in either alpha or position, is a band.
      if (position === 100) continue;
      expect(alpha).toBeGreaterThanOrEqual(before);
      expect(position).toBeGreaterThanOrEqual(previous);
    }
    // Nothing shows until the row's own edge, and all of it does one fade in.
    expect(near.filter(([, at]) => at <= 32).every(([alpha]) => alpha === 0)).toBe(true);
    expect(near.some(([alpha, at]) => alpha === 1 && at === 32 + fade)).toBe(true);
  });
});
