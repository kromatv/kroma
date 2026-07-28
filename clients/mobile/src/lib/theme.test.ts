// The phone's design vocabulary, mapped onto the kit's tokens.
//
// Nothing here holds a value - every colour and size comes from @kroma/ui - so
// what is worth testing is the MAPPING, and it contains one deliberate
// inversion that looks exactly like a bug:
//
//   this app's `textDim`   is the kit's `textMuted` (62% ink)
//   this app's `textFaint` is the kit's `textDim`   (45% ink)
//
// The names cross. A reader who "fixes" that alignment makes every dimmed label
// on the phone one step darker and every faint one one step lighter, which is
// not a crash and does not fail a type check - it just quietly degrades contrast
// across the whole app. So the crossing is pinned here, on purpose.
//
// The inked type ramp is the other one. The kit's `mobileType` bakes no colour,
// because a role has to be reusable on any surface. But the phone's screens
// spread `...type.x` and mostly say nothing about colour, and React Native's
// silent default is BLACK - which on this app's near-black surfaces rendered
// every unlabelled heading invisible.

import { colors as kit, mobileType } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { colors, posterWidth, TAB_BAR_CLEARANCE, type } from './theme';

describe('the colour mapping', () => {
  it('takes every value from the kit rather than holding its own', () => {
    // A literal here is a colour that can drift from the TV and the web.
    for (const value of Object.values(colors)) {
      expect(Object.values(kit)).toContain(value);
    }
  });

  it('CROSSES the two dim names, which is deliberate', () => {
    // The app's `textDim` is the 62% ink; the kit calls that `textMuted`.
    expect(colors.textDim).toBe(kit.textMuted);
    // The app's `textFaint` is the 45% ink; the kit calls that `textDim`.
    expect(colors.textFaint).toBe(kit.textDim);
    // Aligning the names would silently change the contrast of every dimmed and
    // faint label on the phone.
    expect(colors.textDim).not.toBe(colors.textFaint);
  });

  it('maps the surface ladder in order', () => {
    expect(colors.surface).toBe(kit.surface1);
    expect(colors.surfaceRaised).toBe(kit.surface2);
    expect(colors.surfaceHigh).toBe(kit.surface3);
  });

  it('carries the accent family and the status colours through', () => {
    expect(colors.accent).toBe(kit.accent);
    expect(colors.accentBright).toBe(kit.accentBright);
    expect(colors.accentSoft).toBe(kit.accentSoft);
    expect(colors.accentInk).toBe(kit.accentInk);
    expect(colors.success).toBe(kit.success);
    expect(colors.info).toBe(kit.info);
    expect(colors.danger).toBe(kit.danger);
  });
});

describe('the type ramp', () => {
  it('inks EVERY role', () => {
    // React Native's silent default is black, and this app's surfaces are
    // near-black: a role with no colour is an invisible heading.
    for (const [role, style] of Object.entries(type)) {
      expect(style.color, `${role} has no colour`).toBeTruthy();
    }
  });

  it('keeps the kit’s metrics untouched', () => {
    for (const [role, style] of Object.entries(type)) {
      // Colour is the ONLY thing added; a font size that drifts here is a phone
      // that no longer matches its own design.
      const { color: _color, ...metrics } = style;
      expect(metrics).toEqual(mobileType[role as keyof typeof mobileType]);
    }
  });

  it('dims the two small roles and not the rest', () => {
    for (const role of ['display', 'title', 'heading', 'section', 'body'] as const) {
      expect(type[role].color).toBe(kit.text);
    }
    // Caption and small are supporting text by definition.
    expect(type.caption.color).toBe(kit.textMuted);
    expect(type.small.color).toBe(kit.textMuted);
  });

  it('covers the kit’s whole ramp, so no role falls back to black', () => {
    expect(Object.keys(type).sort()).toEqual(Object.keys(mobileType).sort());
  });
});

describe('posterWidth', () => {
  it('fits three columns on a phone', () => {
    const w = posterWidth(390);
    // 390 - 32 padding - 24 gutters = 334, over three.
    expect(w).toBe(Math.floor((390 - 32 - 24) / 3));
  });

  it('steps up to four columns on a small tablet', () => {
    expect(posterWidth(600)).toBe(Math.floor((600 - 32 - 12 * 3) / 4));
    // 599 is still a phone: the breakpoint is inclusive at 600.
    expect(posterWidth(599)).toBe(Math.floor((599 - 32 - 24) / 3));
  });

  it('steps up to six on a large tablet', () => {
    expect(posterWidth(900)).toBe(Math.floor((900 - 32 - 12 * 5) / 6));
    expect(posterWidth(899)).toBe(Math.floor((899 - 32 - 12 * 3) / 4));
  });

  it('always leaves room for the padding and the gutters', () => {
    // A card wider than its share overflows the row, and on a phone that is a
    // horizontal scroll on a vertical grid.
    const columns = (width: number) => {
      if (width >= 900) return 6;
      if (width >= 600) return 4;
      return 3;
    };
    for (const width of [320, 390, 430, 600, 768, 900, 1024, 1366]) {
      const cols = columns(width);
      const used = posterWidth(width) * cols + 12 * (cols - 1) + 32;
      expect(used).toBeLessThanOrEqual(width);
    }
  });

  it('returns whole pixels', () => {
    // A fractional width is a seam of background between two cards on some
    // densities and not others.
    for (const width of [320, 375, 390, 414, 600, 900]) {
      expect(Number.isInteger(posterWidth(width))).toBe(true);
    }
  });

  it('grows with the screen', () => {
    // Within a column count, a wider screen means wider cards.
    expect(posterWidth(430)).toBeGreaterThan(posterWidth(390));
  });
});

describe('the tab bar clearance', () => {
  it('is a real height the scrolls can pad by', () => {
    // The tab bar floats and is translucent, so content scrolls UNDER it; this
    // is what keeps the last row reachable.
    expect(TAB_BAR_CLEARANCE).toBeGreaterThan(0);
    expect(Number.isInteger(TAB_BAR_CLEARANCE)).toBe(true);
  });
});
