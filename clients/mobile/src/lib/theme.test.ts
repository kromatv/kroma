// The two dim names cross on purpose: this app's `textDim` is the kit's
// `textMuted` (62% ink) and its `textFaint` is the kit's `textDim` (45% ink).
// Aligning them would silently degrade contrast across the whole app.

import {
  KROMA,
  KROMA_LIGHT,
  colors as kit,
  mobileRadius,
  mobileType,
  mobileTypeSpec,
  setTheme,
} from '@kroma/ui/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  colors,
  MOBILE,
  MOBILE_LIGHT,
  mobileTheme,
  posterWidth,
  shades,
  TAB_BAR_CLEARANCE,
  type,
} from './theme';

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useTVEventHandler: undefined,
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));

// The kit reads its platform from ONE place now (`#ui/lib/platform`), because a
// literal is what a bundler can prune a branch on. A test standing in for a
// phone has to say so there as well as to React Native, or the palette answers
// as the browser's and the ground twins stop being twins.
vi.mock('#ui/lib/platform', () => ({ WEB: false }));

afterEach(() => {
  setTheme(KROMA);
});

describe('the colour mapping', () => {
  it('takes every value from the kit rather than holding its own', () => {
    for (const value of Object.values(colors)) {
      expect(Object.values(kit)).toContain(value);
    }
  });

  it('CROSSES the two dim names, which is deliberate', () => {
    expect(colors.textDim).toBe(kit.textMuted);
    expect(colors.textFaint).toBe(kit.textDim);
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
      const { color: _color, ...metrics } = style;
      expect(metrics).toEqual(mobileType[role as keyof typeof mobileType]);
    }
  });

  it('dims the two small roles and not the rest', () => {
    for (const role of ['display', 'title', 'heading', 'section', 'body'] as const) {
      expect(type[role].color).toBe('text');
    }
    expect(type.caption.color).toBe('textMuted');
    expect(type.small.color).toBe('textMuted');
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
    // The breakpoint is inclusive at 600.
    expect(posterWidth(599)).toBe(Math.floor((599 - 32 - 24) / 3));
  });

  it('steps up to six on a large tablet', () => {
    expect(posterWidth(900)).toBe(Math.floor((900 - 32 - 12 * 5) / 6));
    expect(posterWidth(899)).toBe(Math.floor((899 - 32 - 12 * 3) / 4));
  });

  it('always leaves room for the padding and the gutters', () => {
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
    for (const width of [320, 375, 390, 414, 600, 900]) {
      expect(Number.isInteger(posterWidth(width))).toBe(true);
    }
  });

  it('grows with the screen', () => {
    expect(posterWidth(430)).toBeGreaterThan(posterWidth(390));
  });
});

describe('mobileTheme', () => {
  it('answers with the twin that matches the ground the app is on', () => {
    expect(mobileTheme()).toBe(MOBILE);
    setTheme(KROMA_LIGHT);
    expect(mobileTheme()).toBe(MOBILE_LIGHT);
  });

  it('takes the ground it is handed over the one that is lit', () => {
    expect(mobileTheme(KROMA_LIGHT)).toBe(MOBILE_LIGHT);
    setTheme(KROMA_LIGHT);
    expect(mobileTheme(KROMA)).toBe(MOBILE);
  });

  it('shapes both twins for a hand, not for a room', () => {
    for (const theme of [MOBILE, MOBILE_LIGHT]) {
      expect(theme.typeSpec.body).toEqual(mobileTypeSpec.body);
      expect(theme.typeSpec.title).toEqual(mobileTypeSpec.title);
      expect(theme.radius.md).toBe(mobileRadius.md);
    }
    expect(MOBILE.typeSpec.body).not.toEqual(KROMA.typeSpec.body);
    expect(MOBILE.radius.md).not.toBe(KROMA.radius.md);
  });

  it('gives the paper twin the paper ground and the same ramp', () => {
    expect(MOBILE_LIGHT.colors.bg).not.toBe(MOBILE.colors.bg);
    expect(MOBILE_LIGHT.colors.bg).toBe(KROMA_LIGHT.colors.bg);
    expect(MOBILE_LIGHT.type).toEqual(MOBILE.type);
  });
});

describe('shades', () => {
  it('fades from nothing to the ground, at the ground that is lit', () => {
    const dark = shades();
    expect(dark.transparent).toMatch(/, 0\)$/);
    expect(dark.mid).toMatch(/, 0\.55\)$/);
    expect(dark.full).toMatch(/, 1\)$/);

    setTheme(KROMA_LIGHT);
    const paper = shades();
    expect(paper.full).not.toBe(dark.full);
    expect(paper.transparent).toMatch(/, 0\)$/);
  });

  it('is read at call time, so a swap after import still lands', () => {
    const first = shades().full;
    setTheme(KROMA_LIGHT);
    expect(shades().full).not.toBe(first);
    setTheme(KROMA);
    expect(shades().full).toBe(first);
  });
});

describe('the tab bar clearance', () => {
  it('is a real height the scrolls can pad by', () => {
    expect(TAB_BAR_CLEARANCE).toBeGreaterThan(0);
    expect(Number.isInteger(TAB_BAR_CLEARANCE)).toBe(true);
  });
});
